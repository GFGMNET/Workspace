//! File explorer (app/lib/files.js): plain file operations inside one base folder —
//! a project folder (scope "p/<project>") or the whole data folder (scope "workspace").
use crate::workspace::{err, Result, Workspace};
use crate::yaml;
use serde_json::{json, Value};
use std::cmp::Ordering;
use std::fs;
use std::path::{Component, Path, PathBuf};

/// Private files of the app are never listed or opened.
pub const PRIVATE: [&str; 3] = [".secrets.json", ".ide-token", ".app"];
const SKIP: [&str; 6] = [".git", "node_modules", ".trash", ".secrets.json", ".ide-token", ".app"];
const MAX_TEXT: u64 = 2 * 1024 * 1024;
const MAX_ENTRIES: usize = 5000;

/// Like JavaScript's localeCompare with numeric: true, sensitivity: base (good enough for file names).
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let (a, b) = (a.to_lowercase(), b.to_lowercase());
    let (mut x, mut y) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (x.peek().copied(), y.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, _) => return Ordering::Less,
            (_, None) => return Ordering::Greater,
            (Some(c), Some(d)) if c.is_ascii_digit() && d.is_ascii_digit() => {
                let mut n1 = String::new(); while let Some(c) = x.peek().copied().filter(|c| c.is_ascii_digit()) { n1.push(c); x.next(); }
                let mut n2 = String::new(); while let Some(c) = y.peek().copied().filter(|c| c.is_ascii_digit()) { n2.push(c); y.next(); }
                let (t1, t2) = (n1.trim_start_matches('0'), n2.trim_start_matches('0'));
                let o = t1.len().cmp(&t2.len()).then(t1.cmp(t2));
                if o != Ordering::Equal { return o; }
            }
            (Some(c), Some(d)) => { if c != d { return c.cmp(&d); } x.next(); y.next(); }
        }
    }
}

fn rel_of(b: &Path, p: &Path) -> String {
    p.strip_prefix(b).map(|r| r.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect::<Vec<_>>().join("/")).unwrap_or_default()
}
fn check_name(name: &str) -> Result<()> {
    let bad = name.is_empty() || name.len() > 200 || name.chars().all(|c| c == '.')
        || name.chars().any(|c| "<>:\"|?*".contains(c) || (c as u32) < 0x20);
    if bad { Err(err(400, format!("Invalid name: {name}"))) } else { Ok(()) }
}
fn mtime(p: &Path) -> f64 { fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0) }

impl Workspace {
    pub fn fs_base(&self, scope: &str) -> Result<PathBuf> {
        if scope == "workspace" { return Ok(self.root.clone()); }
        match scope.strip_prefix("p/") { Some(s) if !s.is_empty() => Ok(self.load_project(s)?.dir), _ => Err(err(400, "Unknown scope")) }
    }
    /// A path inside the base folder; never outside it and never an app-private file.
    pub fn fs_path(&self, scope: &str, rel: &str) -> Result<(PathBuf, PathBuf)> {
        let b = self.fs_base(scope)?;
        let clean = rel.replace('\\', "/"); let clean = clean.trim_start_matches('/');
        let mut p = b.clone();
        for c in Path::new(clean).components() {
            match c {
                Component::Normal(x) => {
                    if PRIVATE.contains(&x.to_string_lossy().as_ref()) { return Err(err(403, "This file is private to the app")); }
                    p.push(x)
                }
                Component::CurDir => {}
                Component::ParentDir => { if !p.pop() || !p.starts_with(&b) { return Err(err(400, "Path outside the folder")); } }
                _ => return Err(err(400, "Path outside the folder")),
            }
        }
        if !p.starts_with(&b) { return Err(err(400, "Path outside the folder")); }
        Ok((b, p))
    }
    pub fn fs_tree(&self, scope: &str, sub: &str) -> Result<Value> {
        let (b, start) = self.fs_path(scope, sub)?;
        if !start.exists() { return Err(err(404, "Folder not found")); }
        let mut n = 0usize; let mut truncated = false;
        fn walk(b: &Path, dir: &Path, depth: usize, n: &mut usize, truncated: &mut bool) -> Vec<Value> {
            let mut ents: Vec<(String, PathBuf, bool)> = fs::read_dir(dir).map(|r| r.flatten().map(|e| (e.file_name().to_string_lossy().to_string(), e.path(), e.path().is_dir())).collect()).unwrap_or_default();
            ents.sort_by(|a, c| c.2.cmp(&a.2).then_with(|| natural_cmp(&a.0, &c.0)));
            let mut out = vec![];
            for (name, full, dir) in ents {
                if SKIP.contains(&name.as_str()) { continue; }
                *n += 1; if *n > MAX_ENTRIES { *truncated = true; break; }
                if dir {
                    let children = if depth < 12 { walk(b, &full, depth + 1, n, truncated) } else { vec![] };
                    out.push(json!({ "name": name, "path": rel_of(b, &full), "dir": true, "children": children }));
                } else if let Ok(m) = fs::metadata(&full) {
                    out.push(json!({ "name": name, "path": rel_of(b, &full), "size": m.len(), "modified": mtime(&full) }));
                }
            }
            out
        }
        let children = walk(&b, &start, 0, &mut n, &mut truncated);
        Ok(json!({ "base": b.to_string_lossy(), "root": rel_of(&b, &start), "children": children, "truncated": truncated }))
    }
    pub fn fs_read(&self, scope: &str, rel: &str) -> Result<Value> {
        let (b, p) = self.fs_path(scope, rel)?;
        let m = fs::metadata(&p).ok().filter(|m| !m.is_dir()).ok_or_else(|| err(404, "File not found"))?;
        let mut info = json!({ "path": rel_of(&b, &p), "name": p.file_name().map(|n| n.to_string_lossy().to_string()), "size": m.len(), "modified": mtime(&p) });
        if m.len() > MAX_TEXT { info["tooLarge"] = json!(true); return Ok(info); }
        let buf = fs::read(&p).map_err(|e| err(500, e.to_string()))?;
        if buf[..buf.len().min(8000)].contains(&0) { info["binary"] = json!(true); return Ok(info); }
        let text = String::from_utf8_lossy(&buf); let text = text.strip_prefix('\u{feff}').unwrap_or(&text);
        info["text"] = json!(true); info["content"] = json!(text);
        Ok(info)
    }
    fn fs_after_change(&self, scope: &str) {
        if let Some(s) = scope.strip_prefix("p/") { if let Ok(p) = self.load_project(s) { if p.error.is_none() { self.write_mcp_json(&p); } } }
    }
    pub fn fs_write(&self, scope: &str, rel: &str, content: &str, create: bool) -> Result<Value> {
        let (b, p) = self.fs_path(scope, rel)?;
        check_name(&p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())?;
        let name = p.file_name().unwrap().to_string_lossy().to_string();
        if create && p.exists() { return Err(err(409, format!("{name} already exists"))); }
        if p.is_dir() { return Err(err(400, "That is a folder")); }
        let r = rel_of(&b, &p);
        let parts: Vec<&str> = r.split('/').collect();
        let checked = (scope.starts_with("p/") && r == "project.yaml")
            || (scope == "workspace" && ((parts.len() == 3 && parts[0] == "projects" && parts[2] == "project.yaml")
                || (parts.len() == 2 && parts[0] == "features" && (parts[1].ends_with(".yaml") || parts[1].ends_with(".yml")))));
        if checked {
            match yaml::parse(content) {
                Ok(Value::Object(_)) => {}
                Ok(_) => return Err(err(400, "YAML error: must be key: value pairs")),
                Err(e) => return Err(err(400, format!("YAML error: {e}"))),
            }
        }
        if let Some(d) = p.parent() { fs::create_dir_all(d).map_err(|e| err(500, e.to_string()))?; }
        fs::write(&p, content).map_err(|e| err(500, e.to_string()))?;
        self.fs_after_change(scope);
        Ok(json!({ "ok": true, "path": r }))
    }
    pub fn fs_mkdir(&self, scope: &str, rel: &str) -> Result<Value> {
        let (b, p) = self.fs_path(scope, rel)?;
        check_name(&p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())?;
        if p.exists() { return Err(err(409, "Already exists")); }
        fs::create_dir_all(&p).map_err(|e| err(500, e.to_string()))?;
        Ok(json!({ "ok": true, "path": rel_of(&b, &p) }))
    }
    pub fn fs_rename(&self, scope: &str, from: &str, to: &str) -> Result<Value> {
        let (b, a) = self.fs_path(scope, from)?; let (_, z) = self.fs_path(scope, to)?;
        let zn = z.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        check_name(&zn)?;
        if !a.exists() { return Err(err(404, "Not found")); }
        if z.exists() { return Err(err(409, format!("{zn} already exists"))); }
        if a == b { return Err(err(400, "Cannot rename the root")); }
        if let Some(d) = z.parent() { fs::create_dir_all(d).map_err(|e| err(500, e.to_string()))?; }
        fs::rename(&a, &z).map_err(|e| err(500, e.to_string()))?;
        self.fs_after_change(scope);
        Ok(json!({ "ok": true, "path": rel_of(&b, &z) }))
    }
    /// Never deletes: moves into <base>/.trash/
    pub fn fs_trash(&self, scope: &str, rel: &str) -> Result<Value> {
        let (b, p) = self.fs_path(scope, rel)?;
        if p == b { return Err(err(400, "Cannot delete the root")); }
        if !p.exists() { return Err(err(404, "Not found")); }
        let r = rel_of(&b, &p);
        if scope == "workspace" && (r == "projects" || r == "features") { return Err(err(400, "This folder is needed by the workspace")); }
        let t = b.join(".trash"); fs::create_dir_all(&t).map_err(|e| err(500, e.to_string()))?;
        let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        fs::rename(&p, t.join(format!("{ms}-{}", p.file_name().unwrap().to_string_lossy()))).map_err(|e| err(500, e.to_string()))?;
        self.fs_after_change(scope);
        Ok(json!({ "ok": true }))
    }
    pub fn fs_upload(&self, scope: &str, dir_rel: &str, filename: &str, bytes: &[u8]) -> Result<Value> {
        let (b, d) = self.fs_path(scope, dir_rel)?;
        let raw = filename.rsplit(['/', '\\']).next().unwrap_or("");
        let mut name = String::new(); let mut last_bad = false;
        for c in raw.chars() { if "<>:\"|?*".contains(c) || (c as u32) < 0x20 { if !last_bad { name.push('_'); } last_bad = true; } else { name.push(c); last_bad = false; } }
        check_name(&name)?;
        if PRIVATE.contains(&name.as_str()) { return Err(err(403, "This file is private to the app")); }
        fs::create_dir_all(&d).map_err(|e| err(500, e.to_string()))?;
        let (stem, ext) = match name.rfind('.') { Some(i) if i > 0 => (name[..i].to_string(), name[i..].to_string()), _ => (name.clone(), String::new()) };
        let mut i = 2;
        while d.join(&name).exists() { name = format!("{stem}-{i}{ext}"); i += 1; }
        fs::write(d.join(&name), bytes).map_err(|e| err(500, e.to_string()))?;
        self.fs_after_change(scope);
        Ok(json!({ "ok": true, "name": name, "path": rel_of(&b, &d.join(&name)) }))
    }
    pub fn fs_abs(&self, scope: &str, rel: &str) -> Result<PathBuf> {
        let (_, p) = self.fs_path(scope, rel)?;
        if !p.exists() { return Err(err(404, "Not found")); }
        Ok(p)
    }
    /// Opens VS Code on the folder (and the file). VSCODE_COMMAND overrides `code`.
    pub fn fs_open_vscode(&self, scope: &str, rel: &str) -> Result<Value> {
        let (b, p) = self.fs_path(scope, rel)?;
        if !p.exists() { return Err(err(404, "Not found")); }
        let cmd = std::env::var("VSCODE_COMMAND").unwrap_or_else(|_| "code".into());
        let mut c = if cfg!(windows) { let mut c = std::process::Command::new("cmd"); c.arg("/C").arg(&cmd); c } else { std::process::Command::new(&cmd) };
        if p.is_file() { c.arg(&b).arg("-g").arg(&p); } else { c.arg(&p); }
        #[cfg(windows)]
        { use std::os::windows::process::CommandExt; c.creation_flags(0x0800_0000); }
        let (ps, bs) = (p.to_string_lossy().to_string(), b.to_string_lossy().to_string());
        Ok(match c.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn() {
            Ok(_) => json!({ "ok": true, "path": ps, "folder": bs }),
            Err(_) => json!({ "ok": false, "command": cmd, "error": format!("VS Code's \"{cmd}\" command was not found"), "path": ps, "folder": bs }),
        })
    }
}
