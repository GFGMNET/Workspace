//! Live refresh (server.js watch/watchExternal): file changes in the data folder and in projects
//! with `location:` are announced on /api/events as {type: "project", slug, path} or {type: "features", path}.
use notify::{RecursiveMode, Watcher};
use pw_core::workspace::Workspace;
use serde_json::json;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::broadcast;

static TX: OnceLock<broadcast::Sender<String>> = OnceLock::new();

pub fn subscribe() -> Option<broadcast::Receiver<String>> { TX.get().map(|t| t.subscribe()) }

enum Msg { Root(PathBuf), Ext(String, PathBuf) }

fn skipped(rel: &str) -> bool {
    rel.split('/').any(|p| p == ".git" || p == "node_modules" || p == ".trash" || p == ".update") || rel.starts_with("app/")
}
fn rel(base: &Path, p: &Path) -> Option<String> {
    p.strip_prefix(base).ok().map(|r| r.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect::<Vec<_>>().join("/"))
}

/// Starts watching once (later calls do nothing).
pub fn start(ws: Arc<Workspace>) {
    if TX.get().is_some() { return; }
    let (btx, _) = broadcast::channel::<String>(256);
    if TX.set(btx.clone()).is_err() { return; }
    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<Msg>();
        let root = ws.root.canonicalize().unwrap_or_else(|_| ws.root.clone());
        let t = tx.clone();
        let mut root_watcher = match notify::recommended_watcher(move |r: notify::Result<notify::Event>| {
            if let Ok(e) = r { for p in e.paths { let _ = t.send(Msg::Root(p)); } }
        }) { Ok(w) => w, Err(e) => { eprintln!("  (live refresh disabled: {e})"); return; } };
        if let Err(e) = root_watcher.watch(&root, RecursiveMode::Recursive) { eprintln!("  (live refresh disabled: {e})"); return; }
        let mut ext: BTreeMap<String, (PathBuf, notify::RecommendedWatcher)> = BTreeMap::new();
        let mut pending: BTreeMap<String, String> = BTreeMap::new();
        let mut last_change = Instant::now();
        let mut last_ext: Option<Instant> = None;
        loop {
            // projects with location: (checked now and then, and when a project.yaml changes)
            if last_ext.map(|t| t.elapsed() > Duration::from_secs(30)).unwrap_or(true) {
                last_ext = Some(Instant::now());
                let mut want: BTreeMap<String, PathBuf> = BTreeMap::new();
                for x in ws.list_projects() {
                    if let Some(slug) = x["slug"].as_str() { if let Ok(p) = ws.load_project(slug) { if p.external { want.insert(slug.to_string(), p.dir); } } }
                }
                ext.retain(|slug, (dir, _)| want.get(slug) == Some(dir));
                for (slug, dir) in want {
                    if ext.contains_key(&slug) { continue; }
                    let t = tx.clone(); let s2 = slug.clone();
                    if let Ok(mut w) = notify::recommended_watcher(move |r: notify::Result<notify::Event>| {
                        if let Ok(e) = r { for p in e.paths { let _ = t.send(Msg::Ext(s2.clone(), p)); } }
                    }) {
                        if w.watch(&dir, RecursiveMode::Recursive).is_ok() { ext.insert(slug, (dir, w)); }
                    }
                }
            }
            match rx.recv_timeout(Duration::from_millis(250)) {
                Ok(Msg::Root(p)) => {
                    let Some(r) = rel(&root, &p).or_else(|| rel(&ws.root, &p)) else { continue };
                    if skipped(&r) { continue; }
                    let parts: Vec<&str> = r.split('/').collect();
                    let key = if parts.len() >= 2 && parts[0] == "projects" { format!("p:{}", parts[1]) } else if parts[0] == "features" { "features".into() } else { continue };
                    if r.ends_with("project.yaml") { last_ext = None; }
                    pending.insert(key, r); last_change = Instant::now();
                }
                Ok(Msg::Ext(slug, p)) => {
                    let dir = ext.get(&slug).map(|e| e.0.clone()).unwrap_or_default();
                    let r = rel(&dir, &p).unwrap_or_default();
                    if skipped(&r) { continue; }
                    pending.insert(format!("p:{slug}"), r); last_change = Instant::now();
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => return,
            }
            if !pending.is_empty() && last_change.elapsed() >= Duration::from_millis(250) {
                for (k, r) in std::mem::take(&mut pending) {
                    let ev = if k == "features" { json!({ "type": "features", "path": r }) } else { json!({ "type": "project", "slug": &k[2..], "path": r }) };
                    let _ = btx.send(ev.to_string());
                }
            }
        }
    });
}
