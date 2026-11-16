//! Secrets (app/lib/secrets.js): stored encrypted in <root>/.secrets.json with AES-256-GCM.
//! The same file format as 0.x, so secrets saved by 0.x can be read (when the key isn't OS-protected).
//! The key itself is protected by the operating system when it can be (so a copied data folder doesn't
//! reveal the values): on Windows with DPAPI (`protected: dpapi`, for this Windows user), on Linux by the
//! desktop app through the keyring (`protected: keyring`, see [`set_protector`]). Without it the key is
//! kept next to the secrets (`protected: none`) and the app says so; it is upgraded as soon as it can be.
//! Keys protected by the 0.x desktop app (`protected: os`, Electron's safeStorage) are taken over on
//! Windows (data/.app/Local State); elsewhere the secrets have to be entered again.
use crate::workspace::{err, Result, Workspace};
use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use regex::Regex;
use serde_json::{json, Map, Value};
use std::fs;
use std::sync::OnceLock;

fn re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\$\{secret:([A-Za-z0-9][A-Za-z0-9_.-]{0,63})\}").unwrap())
}
fn name_ok(n: &str) -> bool {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$").unwrap()).is_match(n)
}
pub fn env_name(name: &str) -> String {
    "PW_SECRET_".to_string() + &name.to_uppercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect::<String>()
}
pub fn refs(text: &str) -> Vec<String> { re().captures_iter(text).map(|c| c[1].to_string()).collect() }

/// ${secret:x} → ${PW_SECRET_X} (for .mcp.json).
pub fn to_env_refs(v: &Value) -> Value {
    match v {
        Value::String(s) => Value::String(re().replace_all(s, |c: &regex::Captures| format!("${{{}}}", env_name(&c[1]))).into_owned()),
        Value::Array(a) => Value::Array(a.iter().map(to_env_refs).collect()),
        Value::Object(o) => Value::Object(o.iter().map(|(k, x)| (k.clone(), to_env_refs(x))).collect()),
        other => other.clone(),
    }
}

fn random<const N: usize>() -> [u8; N] {
    let mut b = [0u8; N];
    getrandom::getrandom(&mut b).expect("random numbers");
    b
}
fn now() -> String { crate::items::now_iso() }
fn to_key(v: Vec<u8>) -> Result<[u8; 32]> { v.try_into().map_err(|_| err(500, "Bad secrets key")) }
fn key_cache() -> &'static std::sync::Mutex<std::collections::HashMap<String, [u8; 32]>> {
    static C: OnceLock<std::sync::Mutex<std::collections::HashMap<String, [u8; 32]>>> = OnceLock::new();
    C.get_or_init(Default::default)
}

/// Protects the secrets' key with the operating system.
pub trait Protector: Send + Sync {
    /// Stored as `protected:` in .secrets.json.
    fn name(&self) -> &'static str;
    fn protect(&self, key: &[u8]) -> std::result::Result<String, String>;
    fn unprotect(&self, data: &str) -> std::result::Result<Vec<u8>, String>;
}
static PROTECTOR: OnceLock<Box<dyn Protector>> = OnceLock::new();
/// The desktop app registers the keyring (Linux) here. Windows always has DPAPI.
pub fn set_protector(p: Box<dyn Protector>) { let _ = PROTECTOR.set(p); }
fn protector() -> Option<&'static dyn Protector> {
    if cfg!(windows) { let _ = PROTECTOR.set(Box::new(dpapi::Dpapi)); }
    PROTECTOR.get().map(|b| b.as_ref())
}
fn wrap(key: &[u8; 32]) -> Value {
    if let Some(p) = protector() { if let Ok(d) = p.protect(key) { key_cache().lock().unwrap().insert(d.clone(), *key); return json!({ "protected": p.name(), "data": d }); } }
    json!({ "protected": "none", "data": B64.encode(key) })
}

/// Windows DPAPI for the current user, through PowerShell's ProtectedData (no native code in the app).
mod dpapi {
    use super::Protector;
    pub struct Dpapi;
    fn run(op: &str, data: &str) -> Result<String, String> {
        let script = format!("Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::{op}([Convert]::FromBase64String($env:PW_DPAPI_IN), $null, 'CurrentUser'))");
        let mut c = std::process::Command::new("powershell.exe");
        c.args(["-NoProfile", "-NonInteractive", "-Command", &script]).env("PW_DPAPI_IN", data).stdin(std::process::Stdio::null());
        #[cfg(windows)]
        { use std::os::windows::process::CommandExt; c.creation_flags(0x0800_0000); }
        let out = c.output().map_err(|e| e.to_string())?;
        let t = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !out.status.success() || t.is_empty() { return Err(String::from_utf8_lossy(&out.stderr).trim().to_string()); }
        Ok(t)
    }
    pub fn unprotect(data: &str) -> Result<Vec<u8>, String> {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.decode(run("Unprotect", data)?).map_err(|e| e.to_string())
    }
    impl Protector for Dpapi {
        fn name(&self) -> &'static str { "dpapi" }
        fn protect(&self, key: &[u8]) -> Result<String, String> { use base64::Engine; run("Protect", &base64::engine::general_purpose::STANDARD.encode(key)) }
        fn unprotect(&self, data: &str) -> Result<Vec<u8>, String> { unprotect(data) }
    }
}

impl Workspace {
    fn secrets_file(&self) -> std::path::PathBuf { self.root.join(".secrets.json") }
    fn secrets_read(&self) -> Map<String, Value> {
        let mut j = fs::read_to_string(self.secrets_file()).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok())
            .and_then(|v| v.as_object().cloned()).unwrap_or_default();
        if !j.get("items").map(|i| i.is_object()).unwrap_or(false) { j.insert("items".into(), json!({})); }
        j
    }
    fn secrets_write(&self, j: &Map<String, Value>) -> Result<()> {
        let f = self.secrets_file();
        if let Some(d) = f.parent() { let _ = fs::create_dir_all(d); }
        fs::write(&f, serde_json::to_string_pretty(j).unwrap() + "\n").map_err(|e| err(500, e.to_string()))?;
        #[cfg(unix)]
        { use std::os::unix::fs::PermissionsExt; let _ = fs::set_permissions(&f, fs::Permissions::from_mode(0o600)); }
        Ok(())
    }
    fn secrets_key(&self, j: &mut Map<String, Value>, create: bool) -> Result<Option<[u8; 32]>> {
        let Some(k) = j.get("key").cloned() else {
            if !create { return Ok(None); }
            let k = random::<32>();
            j.insert("key".into(), wrap(&k));
            return Ok(Some(k));
        };
        let data = k["data"].as_str().unwrap_or("").to_string();
        let how = k["protected"].as_str().unwrap_or("none").to_string();
        if let Some(hit) = key_cache().lock().unwrap().get(&data) { return Ok(Some(*hit)); }
        let key: [u8; 32] = match how.as_str() {
            "none" => to_key(B64.decode(&data).map_err(|_| err(500, "Bad secrets key"))?)?,
            "os" => to_key(self.electron_key(&data).map_err(|m| err(423, m))?)?,
            other => {
                let p = protector().filter(|p| p.name() == other).ok_or_else(|| err(423, format!("The secrets are protected by {} and cannot be read here. Open the workspace with the app on the computer where they were saved, or remove them and enter them again.", if other == "dpapi" { "Windows" } else { "the system keyring" })))?;
                to_key(p.unprotect(&data).map_err(|_| err(423, "The secrets were saved by another computer or user and cannot be read here. Remove them and enter them again."))?)?
            }
        };
        key_cache().lock().unwrap().insert(data, key);
        // upgrade to the protection that is available now
        if protector().map(|p| p.name() != how).unwrap_or(false) {
            let w = wrap(&key);
            if w["protected"] != how.as_str() { j.insert("key".into(), w); let _ = self.secrets_write(j); }
        }
        Ok(Some(key))
    }
    /// 0.x desktop app (Electron safeStorage). Windows: its own key is in data/.app/Local State, protected by DPAPI.
    fn electron_key(&self, data: &str) -> std::result::Result<Vec<u8>, String> {
        let again = "The secrets were saved by the 0.x desktop app and cannot be read here. Remove them and enter them again.".to_string();
        if !cfg!(windows) { return Err(again); }
        let ls: Value = fs::read_to_string(self.root.join(".app").join("Local State")).ok().and_then(|t| serde_json::from_str(&t).ok()).ok_or(again.clone())?;
        let wrapped = B64.decode(ls["os_crypt"]["encrypted_key"].as_str().unwrap_or("")).map_err(|_| again.clone())?;
        let wrapped = wrapped.strip_prefix(b"DPAPI").ok_or(again.clone())?;
        let chrome_key = dpapi::unprotect(&B64.encode(wrapped)).map_err(|_| again.clone())?;
        let blob = B64.decode(data).map_err(|_| again.clone())?;
        let body = blob.strip_prefix(b"v10").ok_or(again.clone())?;
        if body.len() < 12 + 16 || chrome_key.len() != 32 { return Err(again); }
        let plain = Aes256Gcm::new_from_slice(&chrome_key).unwrap().decrypt(Nonce::from_slice(&body[..12]), &body[12..]).map_err(|_| again.clone())?;
        // safeStorage stored our key as base64 text
        B64.decode(String::from_utf8_lossy(&plain).trim()).map_err(|_| again)
    }
    pub fn secrets_status(&self) -> Value {
        let mut j = self.secrets_read();
        let has = j["items"].as_object().map(|o| !o.is_empty()).unwrap_or(false);
        let locked = if has { self.secrets_key(&mut j, false).err().map(|e| e.message) } else { None };
        let mut items: Vec<Value> = j["items"].as_object().unwrap().iter()
            .map(|(n, v)| json!({ "name": n, "env": env_name(n), "updated": v.get("updated").cloned().unwrap_or(Value::Null) })).collect();
        items.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
        let available = protector().is_some();
        let protection = j.get("key").map(|k| k["protected"].clone()).unwrap_or_else(|| json!(protector().map(|p| p.name()).unwrap_or("none")));
        json!({ "protection": protection, "available": available, "locked": locked, "items": items })
    }
    pub fn secret_set(&self, name: &str, value: &str) -> Result<Value> {
        let name = name.trim();
        if !name_ok(name) { return Err(err(400, "Name: letters, digits, - _ . (up to 64 characters)")); }
        if value.is_empty() { return Err(err(400, "The value is empty")); }
        let mut j = self.secrets_read();
        let k = self.secrets_key(&mut j, true)?.unwrap();
        let iv = random::<12>();
        let mut out = Aes256Gcm::new_from_slice(&k).unwrap()
            .encrypt(Nonce::from_slice(&iv), Payload { msg: value.as_bytes(), aad: b"" }).map_err(|_| err(500, "Encryption failed"))?;
        let tag = out.split_off(out.len() - 16); // Node keeps the tag separately
        j["items"].as_object_mut().unwrap().insert(name.to_string(), json!({ "iv": B64.encode(iv), "tag": B64.encode(tag), "data": B64.encode(out), "updated": now() }));
        self.secrets_write(&j)?;
        Ok(self.secrets_status())
    }
    pub fn secret_remove(&self, name: &str) -> Result<Value> {
        let mut j = self.secrets_read();
        j["items"].as_object_mut().unwrap().remove(name);
        if j["items"].as_object().unwrap().is_empty() { j.remove("key"); }
        self.secrets_write(&j)?;
        Ok(self.secrets_status())
    }
    pub fn secrets_remove_all(&self) -> Result<Value> {
        let mut j = Map::new(); j.insert("items".into(), json!({}));
        self.secrets_write(&j)?;
        Ok(self.secrets_status())
    }
    pub fn secret_get(&self, name: &str) -> Result<Option<String>> {
        let mut j = self.secrets_read();
        let Some(it) = j["items"].get(name).cloned() else { return Ok(None) };
        let Some(k) = self.secrets_key(&mut j, false)? else { return Ok(None) };
        let d = |s: &Value| B64.decode(s.as_str().unwrap_or("")).unwrap_or_default();
        let (iv, mut data) = (d(&it["iv"]), d(&it["data"]));
        if iv.len() != 12 { return Err(err(500, "Bad secret")); }
        data.extend(d(&it["tag"]));
        let plain = Aes256Gcm::new_from_slice(&k).unwrap().decrypt(Nonce::from_slice(&iv), data.as_slice()).map_err(|_| err(500, "The secret cannot be decrypted"))?;
        Ok(Some(String::from_utf8_lossy(&plain).into_owned()))
    }
    /// ${secret:x} → value (unknown names stay as they are).
    pub fn secrets_resolve(&self, s: &str) -> String {
        if !s.contains("${secret:") { return s.to_string(); }
        re().replace_all(s, |c: &regex::Captures| self.secret_get(&c[1]).ok().flatten().unwrap_or_else(|| c[0].to_string())).into_owned()
    }
    /// Environment for a process reading `text` (.mcp.json): only the secrets it uses, plus the missing names.
    pub fn secrets_env_for(&self, text: &str) -> (Vec<(String, String)>, Vec<String>) {
        static R: OnceLock<Regex> = OnceLock::new();
        let r = R.get_or_init(|| Regex::new(r"\$\{(PW_SECRET_[A-Z0-9_]+)\}").unwrap());
        let mut wanted: Vec<String> = r.captures_iter(text).map(|c| c[1].to_string()).collect();
        wanted.sort(); wanted.dedup();
        let j = self.secrets_read();
        let mut env = vec![];
        for name in j["items"].as_object().unwrap().keys() {
            let e = env_name(name);
            if let Some(i) = wanted.iter().position(|w| *w == e) {
                if let Ok(Some(v)) = self.secret_get(name) { env.push((e, v)); }
                wanted.remove(i);
            }
        }
        (env, wanted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn round_trip() {
        let dir = std::env::temp_dir().join(format!("pw-secrets-{}", std::process::id()));
        let ws = Workspace { install: dir.clone(), root: dir.clone() };
        ws.secret_set("github-token", "abc123").unwrap();
        assert_eq!(ws.secret_get("github-token").unwrap().as_deref(), Some("abc123"));
        assert_eq!(ws.secrets_resolve("t ${secret:github-token}"), "t abc123");
        assert_eq!(to_env_refs(&json!(["${secret:github-token}"]))[0], "${PW_SECRET_GITHUB_TOKEN}");
        let (env, missing) = ws.secrets_env_for("${PW_SECRET_GITHUB_TOKEN} ${PW_SECRET_X}");
        assert_eq!(env[0].1, "abc123"); assert_eq!(missing, vec!["PW_SECRET_X"]);
        let _ = fs::remove_dir_all(dir);
    }
}
