//! Help & wiki inside the app (plan docs/plans/HELP.md): the wiki pages and their pictures come with the program
//! (`app/help/pages/*.md`, `app/help/screenshots/*`, made by the release build from docs/wiki like the GitHub wiki), so the
//! help works without an internet connection and matches the installed version. In a development folder it falls back to
//! `docs/wiki` and `docs/screenshots`.
use pw_core::workspace::{err, safe_join, HttpError, Workspace};
use serde_json::{json, Value};
use std::path::PathBuf;

const RAW: &str = "https://raw.githubusercontent.com/GFGMNET/Workspace/main/docs/screenshots/";
const WIKI: &str = "https://github.com/GFGMNET/Workspace/wiki/";

fn pages_dir(ws: &Workspace) -> PathBuf {
    let built = ws.install.join("app").join("help").join("pages");
    if built.is_dir() { built } else { ws.install.join("docs").join("wiki") }
}
pub fn pictures_dir(ws: &Workspace) -> PathBuf {
    let built = ws.install.join("app").join("help").join("screenshots");
    if built.is_dir() { built } else { ws.install.join("docs").join("screenshots") }
}
fn names(ws: &Workspace) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(pages_dir(ws)).map(|rd| rd.flatten().filter_map(|e| {
        let n = e.file_name().to_string_lossy().to_string();
        n.strip_suffix(".md").filter(|s| !s.starts_with('_')).map(|s| s.to_string())
    }).collect()).unwrap_or_default();
    v.sort();
    v
}
/// The page text with the pictures and wiki links pointing into the app.
fn local(text: &str) -> String { text.replace(RAW, "/help-img/").replace(WIKI, "#/help/") }
fn title_of(text: &str, name: &str) -> String {
    text.lines().find_map(|l| l.strip_prefix("# ").map(|t| t.trim().to_string())).unwrap_or_else(|| name.replace('-', " "))
}

/// GET /api/help: the menu (_Sidebar.md) and the list of pages.
pub fn index(ws: &Workspace) -> Value {
    let sidebar = std::fs::read_to_string(pages_dir(ws).join("_Sidebar.md")).unwrap_or_default();
    json!({ "sidebar": local(&sidebar), "pages": names(ws) })
}
/// GET /api/help/page/<name>
pub fn page(ws: &Workspace, name: &str) -> Result<Value, HttpError> {
    let name = name.trim().trim_end_matches(".md");
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.starts_with('.') { return Err(err(400, "Invalid page")); }
    let file = safe_join(&pages_dir(ws), &format!("{name}.md"))?;
    let text = std::fs::read_to_string(&file).map_err(|_| err(404, "There is no help page with this name"))?;
    Ok(json!({ "name": name, "title": title_of(&text, name), "text": local(&text) }))
}
/// GET /api/help/search?q=…: pages whose title or text contain all words
pub fn search(ws: &Workspace, q: &str) -> Value {
    let words: Vec<String> = q.to_lowercase().split_whitespace().map(|s| s.to_string()).collect();
    if words.is_empty() { return json!([]); }
    let mut out: Vec<(usize, Value)> = vec![];
    for n in names(ws) {
        let Ok(text) = std::fs::read_to_string(pages_dir(ws).join(format!("{n}.md"))) else { continue };
        let low = text.to_lowercase();
        if !words.iter().all(|w| low.contains(w.as_str()) || n.to_lowercase().contains(w.as_str())) { continue; }
        let title = title_of(&text, &n);
        let score = words.iter().filter(|w| title.to_lowercase().contains(w.as_str())).count() * 10 + words.iter().map(|w| low.matches(w.as_str()).count()).sum::<usize>();
        let at = low.find(words[0].as_str()).unwrap_or(0);
        let start = text[..at.min(text.len())].char_indices().rev().nth(60).map(|(i, _)| i).unwrap_or(0);
        let snippet: String = text[start..].chars().take(160).collect::<String>().replace('\n', " ");
        out.push((score, json!({ "name": n, "title": title, "snippet": snippet })));
    }
    out.sort_by(|a, b| b.0.cmp(&a.0));
    Value::Array(out.into_iter().take(30).map(|x| x.1).collect())
}
