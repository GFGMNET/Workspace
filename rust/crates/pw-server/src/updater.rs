//! Updates (app/lib/updater.js): once a week the app asks GitHub for the latest release; if it is
//! newer, the screen offers "Update now / Later / Skip". Updating downloads the package for this
//! platform, checks it (Windows: signature with the project's own certificate; Linux: SHA-256 from the release's
//! checksum list), keeps a backup of the current program, and swaps the files after the app has quit,
//! then starts it again. data/ is never touched. See docs/plans/RELEASE-TRUST.md.
use crate::github::{http, settings};
use crate::VERSION;
use pw_core::workspace::{err, HttpError, Workspace};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const WEEK: u64 = 7 * 24 * 3600 * 1000;
/// Never replaced by an update: the client's data and the update folder.
const KEEP: [&str; 4] = ["data", ".update", ".git", "node_modules"];
static BUSY: AtomicBool = AtomicBool::new(false);

fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }
fn state_file(ws: &Workspace) -> PathBuf { ws.root.join(".workspace.json") }
fn read_state(ws: &Workspace) -> Map<String, Value> {
    fs::read_to_string(state_file(ws)).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).and_then(|v| v.as_object().cloned()).unwrap_or_default()
}
fn write_state(ws: &Workspace, patch: Value) -> Map<String, Value> {
    let mut s = read_state(ws);
    if let Value::Object(p) = patch { for (k, v) in p { s.insert(k, v); } }
    let _ = fs::write(state_file(ws), serde_json::to_string_pretty(&s).unwrap() + "\n");
    s
}
struct Settings { check: bool, repo: String }
fn update_settings(ws: &Workspace) -> Settings {
    let u = settings(ws)["updates"].clone();
    Settings { check: u["check"] != false && std::env::var("UPDATE_CHECK").map(|v| v != "0").unwrap_or(true),
        repo: u["repo"].as_str().filter(|r| !r.is_empty()).unwrap_or("GFGMNET/Workspace").to_string() }
}
// Four numbers: an urgent fix is 1.0.0.1 / 1.0.1.1 (maintainer's rule 2026-11-25), so the fourth number counts too.
fn parse_v(v: &str) -> [u64; 4] {
    let v = v.trim_start_matches(['v', 'V']);
    let mut out = [0u64; 4];
    for (i, p) in v.split(['.', '+', '-']).take(4).enumerate() { out[i] = p.parse().unwrap_or(0); }
    out
}
pub fn newer(a: &str, b: &str) -> bool { parse_v(a) > parse_v(b) }

pub fn view(ws: &Workspace, st: &Map<String, Value>) -> Value {
    let s = update_settings(ws);
    let latest = st.get("latest").cloned().unwrap_or(Value::Null);
    let available = latest["version"].as_str().map(|v| newer(v, VERSION) && st.get("skipped").and_then(|x| x.as_str()) != Some(v)).unwrap_or(false);
    let snoozed_until = st.get("snoozedUntil").cloned().unwrap_or(Value::Null);
    json!({ "current": VERSION, "enabled": s.check, "repo": s.repo, "lastCheck": st.get("lastCheck").cloned().unwrap_or(Value::Null), "latest": latest,
        "available": available, "snoozedUntil": snoozed_until, "snoozed": snoozed_until.as_u64().map(|t| now() < t).unwrap_or(false),
        "error": st.get("updateError").cloned().unwrap_or(Value::Null) })
}

/// The package for this installation: the native one for this platform and processor when the
/// program runs as the app (PW_EXE), otherwise the plain package (like 0.x).
pub fn pick_asset<'a>(assets: &'a [Value], native: bool) -> Option<&'a Value> {
    let os = if cfg!(windows) { "windows" } else if cfg!(target_os = "macos") { "macos" } else { "linux" };
    let arch = if cfg!(target_arch = "x86_64") { "x64" } else if cfg!(target_arch = "aarch64") { "arm64" } else { std::env::consts::ARCH };
    let name = |a: &Value| a["name"].as_str().unwrap_or("").to_lowercase();
    let zips: Vec<&Value> = assets.iter().filter(|a| name(a).ends_with(".zip")).collect();
    let is_native = |n: &str| ["-windows-", "-linux-", "-macos-"].iter().any(|x| n.contains(x));
    if native { return zips.into_iter().find(|a| name(a).ends_with(&format!("-{os}-{arch}.zip"))); }
    zips.into_iter().find(|a| !is_native(&name(a)))
}
fn native() -> bool { std::env::var_os("PW_EXE").is_some() }

pub async fn check(ws: &Workspace, force: bool) -> Value {
    let s = update_settings(ws); let st = read_state(ws);
    let recent = st.get("lastCheck").and_then(|v| v.as_u64()).map(|t| now().saturating_sub(t) < WEEK).unwrap_or(false);
    if !force && (!s.check || recent) { return view(ws, &st); }
    let api = std::env::var("UPDATE_API").unwrap_or_else(|_| "https://api.github.com".into());
    let r = http().get(format!("{api}/repos/{}/releases/latest", s.repo)).header("Accept", "application/vnd.github+json").timeout(Duration::from_secs(15)).send().await;
    let result: Result<Value, String> = async {
        let r = r.map_err(|e| e.to_string())?;
        if r.status().as_u16() == 404 { return Ok(json!({ "lastCheck": now(), "latest": null, "updateError": null })); }
        if !r.status().is_success() { return Err(format!("GitHub answered {}", r.status().as_u16())); }
        let rel: Value = r.json().await.map_err(|e| e.to_string())?;
        let assets = rel["assets"].as_array().cloned().unwrap_or_default();
        let asset = pick_asset(&assets, native());
        if native() && asset.is_none() { return Ok(json!({ "lastCheck": now(), "latest": null, "updateError": null })); }
        let sums = assets.iter().find(|a| { let n = a["name"].as_str().unwrap_or("").to_lowercase(); n == "sha256sums" || n == "sha256sums.txt" || n.ends_with(".sha256") })
            .map(|a| a["browser_download_url"].clone()).unwrap_or(Value::Null);
        let latest = json!({ "version": rel["tag_name"].as_str().unwrap_or("").trim_start_matches(['v', 'V']), "name": if rel["name"].is_null() { rel["tag_name"].clone() } else { rel["name"].clone() },
            "notes": rel["body"].as_str().unwrap_or(""), "published": rel["published_at"], "page": rel["html_url"],
            "zip": asset.map(|a| a["browser_download_url"].clone()).unwrap_or(rel["zipball_url"].clone()),
            "asset": asset.map(|a| a["name"].clone()).unwrap_or(Value::Null), "sums": sums });
        Ok(json!({ "lastCheck": now(), "latest": latest, "updateError": null }))
    }.await;
    match result {
        Ok(patch) => view(ws, &write_state(ws, patch)),
        Err(e) => view(ws, &write_state(ws, json!({ "lastCheck": now(), "updateError": format!("Could not check for updates: {e}") }))),
    }
}
pub fn skip(ws: &Workspace, version: &str) -> Value { view(ws, &write_state(ws, json!({ "skipped": version }))) }
pub fn later(ws: &Workspace) -> Value { view(ws, &write_state(ws, json!({ "snoozedUntil": now() + WEEK }))) }

// ---------- installing ----------
fn hex(b: &[u8]) -> String { b.iter().map(|x| format!("{x:02x}")).collect() }
/// Unpacks with path checks; keeps the executable bit of files zipped on Linux.
fn unzip(bytes: &[u8], dest: &Path) -> Result<(), String> {
    let mut z = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| format!("Not a zip file: {e}"))?;
    // the file names in the zip must agree with each other (no hidden second name for a file)
    z.validate_header_consistency().map_err(|e| format!("The zip file is not consistent: {e}"))?;
    for i in 0..z.len() {
        let mut f = z.by_index(i).map_err(|e| e.to_string())?;
        let rel = f.enclosed_name().ok_or_else(|| format!("Unsafe path in zip: {}", f.name().map(|n| n.to_string()).unwrap_or_default()))?;
        let target = dest.join(rel);
        if f.is_symlink() { continue; } // a release never contains links
        if f.is_dir() { fs::create_dir_all(&target).map_err(|e| e.to_string())?; continue; }
        if let Some(d) = target.parent() { fs::create_dir_all(d).map_err(|e| e.to_string())?; }
        let mut out = fs::File::create(&target).map_err(|e| e.to_string())?;
        std::io::copy(&mut f, &mut out).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        if let Some(mode) = f.unix_mode() { use std::os::unix::fs::PermissionsExt; let _ = fs::set_permissions(&target, fs::Permissions::from_mode(mode & 0o777)); }
    }
    Ok(())
}
fn server_name() -> &'static str { if cfg!(windows) { "workspace-server.exe" } else { "workspace-server" } }
/// The program folder inside the package: it holds the server program and app/public.
fn find_root(dir: &Path, depth: usize) -> Option<PathBuf> {
    if dir.join(server_name()).is_file() && dir.join("app").join("public").is_dir() { return Some(dir.to_path_buf()); }
    if depth > 2 { return None; }
    fs::read_dir(dir).ok()?.flatten().filter(|e| e.path().is_dir()).find_map(|e| find_root(&e.path(), depth + 1))
}
/// Fingerprint of the project's own signing certificate (signing/, created once by .github/workflows/signing-cert.yml).
const SIGNER: &str = include_str!("../../../../signing/workspace-signing.thumbprint");
/// Windows: the new program must be signed with exactly the project's own certificate, unchanged, and be Workspace.
/// The certificate is self-made, so Windows says "not trusted" (UnknownError/NotTrusted) unless it is installed on the PC —
/// that is fine here; what counts is that it is our certificate and the file was not changed (docs/plans/SIGNING.md).
fn check_signature(exe: &Path) -> Result<(), String> {
    if !cfg!(windows) { return Ok(()); }
    let script = "$s = Get-AuthenticodeSignature -LiteralPath $env:PW_CHECK_FILE; \
        $v = (Get-Item -LiteralPath $env:PW_CHECK_FILE).VersionInfo.ProductName; \
        Write-Output (\"{0}|{1}|{2}\" -f $s.Status, $s.SignerCertificate.Thumbprint, $v)";
    let mut c = std::process::Command::new("powershell.exe");
    c.args(["-NoProfile", "-NonInteractive", "-Command", script]).env("PW_CHECK_FILE", exe);
    #[cfg(windows)]
    { use std::os::windows::process::CommandExt; c.creation_flags(0x0800_0000); }
    let out = c.output().map_err(|e| format!("The signature could not be checked: {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    signature_ok(&text)
}
/// "Status|Thumbprint|ProductName" from PowerShell → accepted or why not.
fn signature_ok(text: &str) -> Result<(), String> {
    let mut p = text.splitn(3, '|');
    let (status, thumb, product) = (p.next().unwrap_or(""), p.next().unwrap_or(""), p.next().unwrap_or(""));
    if !matches!(status, "Valid" | "UnknownError" | "NotTrusted") {
        return Err(format!("The new program is not signed or was changed (signature: {})", if status.is_empty() { "none" } else { status }));
    }
    if !thumb.trim().eq_ignore_ascii_case(SIGNER.trim()) { return Err("The new program is signed by someone else".into()); }
    if product.trim() != "Workspace" { return Err("The new program is not Workspace".into()); }
    Ok(())
}
fn copy_all(from: &Path, to: &Path) -> std::io::Result<()> {
    if from.is_dir() {
        fs::create_dir_all(to)?;
        for e in fs::read_dir(from)?.flatten() { copy_all(&e.path(), &to.join(e.file_name()))?; }
        Ok(())
    } else { fs::copy(from, to).map(|_| ()) }
}

/// Downloads, checks and unpacks the new version, makes a backup and prepares the swap.
/// The caller then quits; the swap script puts the files in place and starts the app again.
pub async fn apply(ws: &Workspace) -> Result<Value, HttpError> {
    if BUSY.swap(true, Ordering::SeqCst) { return Err(err(409, "An update is already running")); }
    let r = apply_inner(ws).await;
    BUSY.store(false, Ordering::SeqCst);
    if let Err(e) = &r { write_state(ws, json!({ "updateError": format!("Update failed: {e}") })); }
    r.map_err(|e| err(500, format!("Update failed, nothing was changed: {e}")))
}
async fn apply_inner(ws: &Workspace) -> Result<Value, String> {
    let st = read_state(ws);
    let latest = st.get("latest").cloned().unwrap_or(Value::Null);
    let version = latest["version"].as_str().unwrap_or("").to_string();
    if version.is_empty() || !newer(&version, VERSION) { return Err("No newer version to install".into()); }
    let url = latest["zip"].as_str().ok_or("No download")?.to_string();
    let install = ws.install.clone();
    let work = install.join(".update"); let stamp = now();
    let unpacked = work.join(format!("new-{stamp}"));
    let backup = work.join(format!("backup-{VERSION}-{stamp}"));
    let r = http().get(&url).timeout(Duration::from_secs(300)).send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() { return Err(format!("Download failed ({})", r.status().as_u16())); }
    let bytes = r.bytes().await.map_err(|e| e.to_string())?;
    // Linux: the checksum from the release's list must match
    if !cfg!(windows) {
        let sums_url = latest["sums"].as_str().ok_or("The release has no checksum list (SHA256SUMS)")?;
        let sums = http().get(sums_url).timeout(Duration::from_secs(30)).send().await.map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
        let file = latest["asset"].as_str().unwrap_or("");
        let want = sums.lines().find_map(|l| { let mut p = l.split_whitespace(); let h = p.next()?; let n = p.next()?.trim_start_matches('*'); (n == file).then(|| h.to_lowercase()) })
            .ok_or("The checksum list does not name the download")?;
        if hex(&Sha256::digest(&bytes)) != want { return Err("The download is damaged or changed (checksum differs)".into()); }
    }
    let result: Result<Value, String> = (|| {
        fs::create_dir_all(&unpacked).map_err(|e| e.to_string())?;
        unzip(&bytes, &unpacked)?;
        let src = find_root(&unpacked, 0).ok_or("The download does not look like Workspace")?;
        if cfg!(windows) { check_signature(&src.join("Workspace.exe"))?; }
        // backup of the current program (copied: the running program stays in place until the swap)
        fs::create_dir_all(&backup).map_err(|e| e.to_string())?;
        for e in fs::read_dir(&install).map_err(|e| e.to_string())?.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if KEEP.contains(&n.as_str()) { continue; }
            copy_all(&e.path(), &backup.join(&n)).map_err(|e| format!("Backup failed: {e}"))?;
        }
        write_state(ws, json!({ "updatedFrom": VERSION, "updatedTo": version, "updatedAt": now(), "backup": backup.strip_prefix(&install).unwrap_or(&backup).to_string_lossy(), "updateError": null, "skipped": null }));
        Ok(json!({ "ok": true, "from": VERSION, "to": version, "backup": backup.strip_prefix(&install).unwrap_or(&backup).to_string_lossy(), "notes": [], "swap": src.to_string_lossy() }))
    })();
    if result.is_err() { let _ = fs::remove_dir_all(&unpacked); let _ = fs::remove_dir_all(&backup); }
    result
}

/// Starts a small script that waits until this program has quit, moves the new files in and starts it again.
pub fn run_swap(ws: &Workspace, src: &Path) {
    let install = ws.install.clone(); let pid = std::process::id();
    let exe = std::env::var_os("PW_EXE").map(PathBuf::from).or_else(|| std::env::current_exe().ok()).unwrap_or_default();
    let unpacked = src.ancestors().find(|a| a.parent().map(|p| p.ends_with(".update")).unwrap_or(false)).map(|p| p.to_path_buf()).unwrap_or_else(|| src.to_path_buf());
    if cfg!(windows) {
        let script = install.join(".update").join("swap.cmd");
        let text = [
            "@echo off".to_string(),
            ":wait".into(),
            format!("tasklist /FI \"PID eq {pid}\" 2>nul | find \"{pid}\" >nul && (ping -n 2 127.0.0.1 >nul & goto wait)"),
            format!("robocopy \"{}\" \"{}\" /E /MOVE /XD data .update /R:20 /W:1 /NFL /NDL /NJH /NJS /NP >nul", src.display(), install.display()),
            format!("rmdir /S /Q \"{}\" 2>nul", unpacked.display()),
            format!("set PW_RESTARTED=1& start \"\" \"{}\"", exe.display()),
            String::new(),
        ].join("\r\n");
        if fs::write(&script, text).is_ok() {
            let mut c = std::process::Command::new("cmd.exe");
            c.args(["/c", &script.to_string_lossy()]).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
            #[cfg(windows)]
            { use std::os::windows::process::CommandExt; c.creation_flags(0x0800_0000 | 0x0000_0008); }
            let _ = c.spawn();
        }
    } else {
        let q = |p: &Path| format!("'{}'", p.to_string_lossy().replace('\'', "'\\''"));
        let script = format!("while kill -0 {pid} 2>/dev/null; do sleep 0.5; done; cp -a {}/. {}/ && rm -rf {}; PW_RESTARTED=1 {} >/dev/null 2>&1 &", q(src), q(&install), q(&unpacked), q(&exe));
        let _ = std::process::Command::new("/bin/sh").args(["-c", &script]).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn();
    }
}

#[cfg(test)]
mod version_tests {
    use super::newer;
    #[test]
    fn four_numbers() {
        assert!(newer("1.0.0.1", "1.0.0"));        // urgent fix for 1.0
        assert!(newer("v1.0.0.2", "1.0.0.1"));
        assert!(newer("1.0.1", "1.0.0.9"));         // the next version beats every urgent fix
        assert!(newer("1.0.1.1", "1.0.1"));
        assert!(newer("1.0.0", "0.9.1.5"));         // beta testers get 1.0
        assert!(newer("1.0.1", "0.9.2.3"));         // and 1.0.1
        assert!(!newer("1.0.0", "1.0.0"));
        assert!(!newer("1.0.0", "1.0.0.1"));
        assert!(!newer("0.9.1.5", "1.0.0"));
    }
}

#[cfg(test)]
mod signature_tests {
    #[test]
    fn signature_check() {
        let me = super::SIGNER.trim();
        assert!(super::signature_ok(&format!("UnknownError|{me}|Workspace")).is_ok());
        assert!(super::signature_ok(&format!("Valid|{}|Workspace", me.to_lowercase())).is_ok());
        assert!(super::signature_ok(&format!("HashMismatch|{me}|Workspace")).is_err());
        assert!(super::signature_ok("NotSigned||Workspace").is_err());
        assert!(super::signature_ok("UnknownError|0000000000000000000000000000000000000000|Workspace").is_err());
        assert!(super::signature_ok(&format!("Valid|{me}|Other")).is_err());
    }
}
