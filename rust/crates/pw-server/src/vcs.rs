//! Version Control tab (plan docs/plans/VERSION-CONTROL.md): read access to a Git or SVN repository with a login —
//! the files, one file, the history, the history of one file. Server, port, protocol, path and user come from project.yaml;
//! the password / key from the app's secrets, handed over only while a command runs (never written to a file).
//! Git: a bare copy with only the list of files and the history (`--filter=blob:none`) in `<project>/.version-control/<key>.git`;
//! a file's content comes when it is opened. Settings that can start programs are switched off for every command.
use pw_core::workspace::{err, HttpError, Project, Workspace};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use std::collections::HashMap;
use tokio::io::AsyncWriteExt;

type R<T> = Result<T, HttpError>;

struct Repo { kind: String, url: String, shown: String, user: String, password: String, key: String, protocol: String, port: String, cache: PathBuf }

fn s(d: &Value, k: &str) -> String { d[k].as_str().map(|x| x.trim().to_string()).or_else(|| d[k].as_i64().map(|n| n.to_string())).unwrap_or_default() }

fn repo(ws: &Workspace, p: &Project, key: &str) -> R<Repo> {
    let f = p.feature(key)?;
    let d = f.def.clone().unwrap_or(json!({}));
    if d["stores"] != "vcs" { return Err(err(400, "Not a Version Control feature")); }
    let kind = s(&d, "type").to_lowercase();
    let protocol = s(&d, "protocol").to_lowercase();
    let (server, port, path) = (s(&d, "server"), s(&d, "port"), s(&d, "path").trim_matches('/').to_string());
    let ok = match kind.as_str() { "git" => ["http", "https", "ssh"].contains(&protocol.as_str()), "svn" => ["svn", "http", "https"].contains(&protocol.as_str()), _ => false };
    if !ok { return Err(err(400, "Set type: git (protocol http, https or ssh) or type: svn (protocol svn, http or https) in project.yaml")); }
    if server.is_empty() || path.is_empty() { return Err(err(400, "Set server:, port: and path: in project.yaml")); }
    if server.contains(['/', ' ', '@']) || !port.chars().all(|c| c.is_ascii_digit()) { return Err(err(400, "server: is a name or address only, port: a number")); }
    if path.split('/').any(|x| x == ".." || x.is_empty()) || path.starts_with('-') { return Err(err(400, "Invalid path:")); }
    let user = ws.secrets_resolve(&s(&d, "user"));
    let hostport = if port.is_empty() { server.clone() } else { format!("{server}:{port}") };
    let url = if kind == "git" && protocol == "ssh" { format!("ssh://{}@{hostport}/{path}", if user.is_empty() { "git".into() } else { user.clone() }) } else { format!("{protocol}://{hostport}/{path}") };
    let cache = p.dir.join(".version-control").join(format!("{key}.git"));
    Ok(Repo { kind, shown: format!("{protocol}://{hostport}/{path}"), url, password: ws.secrets_resolve(&s(&d, "password")), key: ws.secrets_resolve(&s(&d, "key")), user, protocol, port, cache })
}

fn cmd(program: &str) -> tokio::process::Command {
    #[allow(unused_mut)]
    let mut c = tokio::process::Command::new(crate::chat::find_program(program, &crate::chat::current_env()));
    #[cfg(windows)]
    c.creation_flags(0x0800_0000);
    c.env_clear().envs(crate::chat::current_env()).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    c
}
async fn output(mut c: tokio::process::Command, stdin: Option<String>, secs: u64) -> R<(bool, Vec<u8>, String)> {
    let mut child = c.spawn().map_err(|e| err(500, if e.kind() == std::io::ErrorKind::NotFound { "Git or SVN is not installed on this PC (git / svn not found)".to_string() } else { e.to_string() }))?;
    if let Some(mut si) = child.stdin.take() { if let Some(t) = stdin { let _ = si.write_all(t.as_bytes()).await; } drop(si); }
    match tokio::time::timeout(Duration::from_secs(secs), child.wait_with_output()).await {
        Ok(Ok(o)) => Ok((o.status.success(), o.stdout, String::from_utf8_lossy(&o.stderr).to_string())),
        Ok(Err(e)) => Err(err(500, e.to_string())),
        Err(_) => Err(err(504, "The server took too long")),
    }
}
fn clean_error(e: &str, r: &Repo) -> String {
    let mut t = e.replace(&r.password, "***");
    if !r.key.is_empty() { t = t.replace(&r.key, "***"); }
    let low = t.to_lowercase();
    if low.contains("authentication") || low.contains("401") || low.contains("permission denied") || low.contains("could not read username") || low.contains("e170001") || low.contains("e215004") { return format!("The server refused the login — check user: and the password / key under Secrets. ({})", t.trim()); }
    if low.contains("could not resolve") || low.contains("connection refused") || low.contains("unable to connect") || low.contains("e170013") || low.contains("timed out") { return format!("The server can't be reached — check server: and port:. ({})", t.trim()); }
    t.trim().chars().take(600).collect()
}

// ---------- Git ----------
const HELPER: &str = "!f() { test \"$1\" = get && echo username=$PW_VC_USER && echo password=$PW_VC_PASS; }; f";
async fn git(r: &Repo, args: &[&str], dir: Option<&Path>) -> R<(bool, Vec<u8>, String)> {
    let mut c = cmd("git");
    c.args(["-c", "core.fsmonitor=false", "-c", "core.hooksPath=", "-c", "credential.helper=", "-c", &format!("credential.helper={HELPER}"), "-c", "protocol.file.allow=never"]);
    if r.protocol == "https" { c.args(["-c", "http.sslVerify=false"]); if cfg!(windows) { c.args(["-c", "http.sslBackend=openssl"]); } }
    if let Some(d) = dir { c.arg("-C").arg(d); }
    c.args(args).env("GIT_TERMINAL_PROMPT", "0").env("GCM_INTERACTIVE", "never").env("PW_VC_USER", &r.user).env("PW_VC_PASS", &r.password);
    // ssh: the key goes into a short-lived ssh-agent through stdin, never into a file
    let mut agent: Option<(String, String)> = None;
    if r.protocol == "ssh" {
        let (ok, out, e) = output({ let mut a = cmd("ssh-agent"); a.arg("-s"); a }, None, 15).await?;
        if !ok { return Err(err(500, format!("ssh-agent did not start: {e}"))); }
        let o = String::from_utf8_lossy(&out);
        let grab = |k: &str| o.split(';').find_map(|x| x.trim().strip_prefix(&format!("{k}=")).map(|v| v.to_string())).unwrap_or_default();
        let (sock, pid) = (grab("SSH_AUTH_SOCK"), grab("SSH_AGENT_PID"));
        let (ok, _, e) = output({ let mut a = cmd("ssh-add"); a.arg("-").env("SSH_AUTH_SOCK", &sock); a }, Some(format!("{}\n", r.key.trim())), 15).await?;
        if !ok { let _ = output({ let mut k = cmd("ssh-agent"); k.arg("-k").env("SSH_AGENT_PID", &pid); k }, None, 10).await; return Err(err(400, format!("The ssh key from the secrets was not accepted: {}", e.trim()))); }
        let port = if r.port.is_empty() { String::new() } else { format!(" -p {}", r.port) };
        c.env("SSH_AUTH_SOCK", &sock).env("GIT_SSH_COMMAND", format!("ssh{port} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes"));
        agent = Some((sock, pid));
    }
    let res = output(c, None, 600).await;
    if let Some((_, pid)) = agent { let _ = output({ let mut k = cmd("ssh-agent"); k.arg("-k").env("SSH_AGENT_PID", &pid); k }, None, 10).await; }
    res
}
fn fetched() -> &'static Mutex<HashMap<PathBuf, Instant>> { static C: OnceLock<Mutex<HashMap<PathBuf, Instant>>> = OnceLock::new(); C.get_or_init(Default::default) }
/// First time: list + history only; later: only the changes (at most once a minute, or on Refresh).
async fn git_sync(r: &Repo, refresh: bool) -> R<()> {
    if r.cache.join("HEAD").exists() {
        let recent = fetched().lock().unwrap().get(&r.cache).map(|t| t.elapsed() < Duration::from_secs(60)).unwrap_or(false);
        if recent && !refresh { return Ok(()); }
        let (ok, _, e) = git(r, &["fetch", "-q", "--prune", "--filter=blob:none", "origin", "+refs/heads/*:refs/heads/*"], Some(&r.cache)).await?;
        if !ok { return Err(err(502, clean_error(&e, r))); }
    } else {
        let _ = std::fs::create_dir_all(r.cache.parent().unwrap());
        let (ok, _, e) = git(r, &["clone", "-q", "--bare", "--filter=blob:none", &r.url, &r.cache.to_string_lossy()], None).await?;
        if !ok { let _ = std::fs::remove_dir_all(&r.cache); return Err(err(502, clean_error(&e, r))); }
        let _ = git(r, &["config", "remote.origin.url", &r.url], Some(&r.cache)).await;
    }
    fetched().lock().unwrap().insert(r.cache.clone(), Instant::now());
    Ok(())
}
fn check_file(f: &str) -> R<String> {
    let f = f.trim().trim_start_matches('/').to_string();
    if f.is_empty() || f.starts_with('-') || f.split('/').any(|x| x == ".." || x.is_empty()) { return Err(err(400, "Invalid file")); }
    Ok(f)
}
fn text_of(b: &[u8]) -> Value {
    if b.iter().take(8000).any(|x| *x == 0) { return json!({ "binary": true, "size": b.len() }); }
    let t = String::from_utf8_lossy(b).to_string();
    let n = t.chars().count();
    json!({ "text": if n > 400_000 { t.chars().take(400_000).collect::<String>() + "\n…(cut)" } else { t }, "size": b.len() })
}
fn parse_git_log(out: &str) -> Vec<Value> {
    out.split('\u{1e}').filter(|c| !c.trim().is_empty()).map(|c| {
        let mut lines = c.trim_matches('\n').lines();
        let head: Vec<&str> = lines.next().unwrap_or("").split('\u{1f}').collect();
        let files: Vec<String> = lines.filter(|l| !l.trim().is_empty()).map(|l| l.trim().to_string()).collect();
        json!({ "id": head.first().copied().unwrap_or(""), "short": head.first().map(|h| h.chars().take(7).collect::<String>()), "author": head.get(1).copied().unwrap_or(""),
            "date": head.get(2).copied().unwrap_or(""), "message": head.get(3).copied().unwrap_or(""), "files": files })
    }).collect()
}

// ---------- SVN ----------
async fn svn(r: &Repo, args: &[&str]) -> R<(bool, Vec<u8>, String)> {
    let mut c = cmd("svn");
    c.args(args).args(["--non-interactive", "--no-auth-cache", "--username", &r.user, "--password-from-stdin"]);
    if r.protocol == "https" { c.arg("--trust-server-cert-failures=unknown-ca,cn-mismatch,expired,not-yet-valid,other"); }
    output(c, Some(r.password.clone()), 300).await
}
fn xml_unescape(s: &str) -> String { s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&") }
fn parse_svn_log(xml: &str) -> Vec<Value> {
    let entry = regex::Regex::new(r#"(?s)<logentry\s+revision="(\d+)">(.*?)</logentry>"#).unwrap();
    let tag = |t: &str, body: &str| regex::Regex::new(&format!(r"(?s)<{t}>(.*?)</{t}>")).unwrap().captures(body).map(|c| xml_unescape(&c[1])).unwrap_or_default();
    let path = regex::Regex::new(r#"(?s)<path[^>]*>(.*?)</path>"#).unwrap();
    entry.captures_iter(xml).map(|c| {
        let b = &c[2];
        json!({ "id": format!("r{}", &c[1]), "short": format!("r{}", &c[1]), "author": tag("author", b), "date": tag("date", b).chars().take(19).collect::<String>().replace('T', " "),
            "message": tag("msg", b).lines().next().unwrap_or("").to_string(), "files": path.captures_iter(b).map(|p| xml_unescape(&p[1]).trim_start_matches('/').to_string()).collect::<Vec<_>>() })
    }).collect()
}

// ---------- the four addresses ----------
pub async fn files(ws: &Workspace, slug: &str, key: &str, refresh: bool) -> R<Value> {
    let p = ws.load_project(slug)?; let r = repo(ws, &p, key)?;
    let list: Vec<String> = if r.kind == "git" {
        git_sync(&r, refresh).await?;
        let (ok, out, e) = git(&r, &["ls-tree", "-r", "--name-only", "HEAD"], Some(&r.cache)).await?;
        if !ok { return Err(err(502, clean_error(&e, &r))); }
        String::from_utf8_lossy(&out).lines().map(|l| l.to_string()).collect()
    } else {
        let (ok, out, e) = svn(&r, &["list", "-R", &r.url]).await?;
        if !ok { return Err(err(502, clean_error(&e, &r))); }
        String::from_utf8_lossy(&out).lines().filter(|l| !l.ends_with('/')).map(|l| l.to_string()).collect()
    };
    Ok(json!({ "type": r.kind, "url": r.shown, "files": list }))
}
pub async fn file(ws: &Workspace, slug: &str, key: &str, f: &str) -> R<Value> {
    let p = ws.load_project(slug)?; let r = repo(ws, &p, key)?; let f = check_file(f)?;
    let (ok, out, e) = if r.kind == "git" { git_sync(&r, false).await?; git(&r, &["show", &format!("HEAD:{f}")], Some(&r.cache)).await? } else { svn(&r, &["cat", &format!("{}/{f}", r.url)]).await? };
    if !ok { return Err(err(404, clean_error(&e, &r))); }
    let mut v = text_of(&out); v["file"] = json!(f);
    Ok(v)
}
pub async fn history(ws: &Workspace, slug: &str, key: &str, f: Option<&str>) -> R<Value> {
    let p = ws.load_project(slug)?; let r = repo(ws, &p, key)?;
    let f = match f { Some(x) if !x.trim().is_empty() => Some(check_file(x)?), _ => None };
    let list = if r.kind == "git" {
        git_sync(&r, false).await?;
        let mut a = vec!["log".to_string(), "-n".into(), "300".into(), "--name-only".into(), "--date=format:%Y-%m-%d %H:%M".into(), "--format=%x1e%H%x1f%an%x1f%ad%x1f%s".into(), "HEAD".into()];
        if let Some(f) = &f { a.push("--".into()); a.push(f.clone()); }
        let refs: Vec<&str> = a.iter().map(|x| x.as_str()).collect();
        let (ok, out, e) = git(&r, &refs, Some(&r.cache)).await?;
        if !ok { return Err(err(502, clean_error(&e, &r))); }
        parse_git_log(&String::from_utf8_lossy(&out))
    } else {
        let target = match &f { Some(f) => format!("{}/{f}", r.url), None => r.url.clone() };
        let (ok, out, e) = svn(&r, &["log", "--xml", "-v", "-l", "300", &target]).await?;
        if !ok { return Err(err(502, clean_error(&e, &r))); }
        parse_svn_log(&String::from_utf8_lossy(&out))
    };
    Ok(json!({ "type": r.kind, "url": r.shown, "file": f, "history": list }))
}
