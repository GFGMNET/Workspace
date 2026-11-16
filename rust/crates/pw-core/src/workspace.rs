//! The data folder: features, projects and (in the prototype) Markdown items.
//! Same rules and answers as app/lib/workspace.js; checked by tests/contract.
use crate::yaml;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const STORES: [&str; 7] = ["markdown", "images", "files", "records", "diagram", "chat", "github"];
pub const FIELD_TYPES: [&str; 13] = ["text", "longtext", "number", "date", "datetime", "select", "bool", "url", "email", "tags", "list", "keyvalue", "link"];
const META_KEYS: [&str; 10] = ["name", "description", "icon", "color", "tags", "status", "owner", "created", "overview", "location"];

pub fn layouts() -> Value {
    json!({
        "markdown": ["pages", "cards", "list"], "images": ["grid"], "files": ["files", "code"],
        "records": ["table", "list", "cards", "kanban", "calendar", "orgchart", "map"],
        "diagram": ["diagram"], "chat": ["chat"], "github": ["issues"]
    })
}
fn default_layout(stores: &str) -> &'static str {
    match stores {
        "images" => "grid", "files" => "files", "records" => "table", "diagram" => "diagram",
        "chat" => "chat", "github" => "issues", _ => "pages",
    }
}

#[derive(Debug)]
pub struct HttpError {
    pub status: u16,
    pub message: String,
}
pub fn err(status: u16, message: impl Into<String>) -> HttpError {
    HttpError { status, message: message.into() }
}
pub type Result<T> = std::result::Result<T, HttpError>;

#[derive(Clone, Debug)]
pub struct Workspace {
    pub install: PathBuf,
    pub root: PathBuf,
}

pub fn prettify(k: &str) -> String {
    let s: String = k.chars().map(|c| if c == '_' || c == '-' { ' ' } else { c }).collect();
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut c = s.chars();
    match c.next() {
        Some(f) if f.is_ascii_alphanumeric() || f == '_' => f.to_uppercase().collect::<String>() + c.as_str(),
        Some(f) => f.to_string() + c.as_str(),
        None => String::new(),
    }
}

pub fn slugify(s: &str) -> String {
    let lower = s.to_lowercase().replace('ä', "ae").replace('ö', "oe").replace('ü', "ue").replace('ß', "ss");
    let mut out = String::new();
    let mut dash = false;
    for ch in lower.chars() {
        let c = match ch {
            'à'..='å' => 'a', 'è'..='ë' => 'e', 'ì'..='ï' => 'i', 'ò'..='ö' => 'o', 'ù'..='ü' => 'u', 'ç' => 'c', 'ñ' => 'n',
            _ => ch,
        };
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
            dash = false;
        } else if !dash && !out.is_empty() {
            out.push('-');
            dash = true;
        }
    }
    let out = out.trim_matches('-').chars().take(64).collect::<String>();
    if out.is_empty() { "item".into() } else { out }
}

fn check_id(id: &str, what: &str) -> Result<()> {
    if id.is_empty() || id.len() > 200 || id.contains('/') || id.contains('\\') || id.starts_with('.') || id.contains('\0') {
        return Err(err(400, format!("Invalid {what}")));
    }
    Ok(())
}
/// Joins and refuses anything outside `base`.
pub fn safe_join(base: &Path, rel: &str) -> Result<PathBuf> {
    let mut p = base.to_path_buf();
    for c in Path::new(&rel.replace('\\', "/")).components() {
        match c {
            Component::Normal(x) => p.push(x),
            Component::CurDir => {}
            _ => return Err(err(400, "Invalid path")),
        }
    }
    Ok(p)
}
fn mtime_ms(p: &Path) -> f64 {
    fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0)
}
fn rel(base: &Path, p: &Path) -> String {
    p.strip_prefix(base).map(|r| r.to_string_lossy().replace('\\', "/")).unwrap_or_default()
}

fn guess_type(n: &str) -> &'static str {
    let n = n.to_lowercase();
    let last = n.rsplit('_').next().unwrap_or(&n).to_string();
    let any = |xs: &[&str]| xs.iter().any(|x| last == *x);
    if any(&["date", "due", "day", "start", "end", "deadline", "birthday"]) { "date" }
    else if any(&["email", "mail"]) { "email" }
    else if any(&["url", "link", "website", "homepage"]) { "url" }
    else if any(&["notes", "description", "body", "details", "comment"]) { "longtext" }
    else if last == "tags" { "tags" }
    else if any(&["done", "active", "enabled"]) { "bool" }
    else if any(&["count", "amount", "price", "qty", "number", "x", "y"]) { "number" }
    else { "text" }
}
fn normalize_field(f: &Value) -> Value {
    match f {
        Value::String(n) => json!({ "name": n, "label": prettify(n), "type": guess_type(n) }),
        Value::Object(o) => {
            let mut out = o.clone();
            let name = o.get("name").or(o.get("key")).and_then(|v| v.as_str()).unwrap_or("field").to_string();
            out.insert("name".into(), json!(name));
            if !o.contains_key("label") { out.insert("label".into(), json!(prettify(&name))); }
            let t = o.get("type").and_then(|v| v.as_str()).filter(|t| FIELD_TYPES.contains(t)).map(|t| t.to_string())
                .unwrap_or_else(|| if o.get("options").map(|x| x.is_array()).unwrap_or(false) { "select".into() } else { guess_type(&name).into() });
            out.insert("type".into(), json!(t));
            Value::Object(out)
        }
        _ => json!({ "name": "field", "label": "Field", "type": "text" }),
    }
}

/// Fills in a feature definition's defaults (app/lib/workspace.js normalizeFeature).
pub fn normalize_feature(key: &str, raw: &Map<String, Value>) -> Value {
    let mut d = raw.clone();
    let s = |d: &Map<String, Value>, k: &str| d.get(k).and_then(|v| v.as_str()).map(|x| x.to_string());
    d.insert("key".into(), json!(key));
    if s(&d, "name").is_none() { d.insert("name".into(), json!(prettify(key))); }
    let mut stores = s(&d, "stores").filter(|x| STORES.contains(&x.as_str())).unwrap_or_else(|| "markdown".into());
    let for_claude = s(&d, "for_claude");
    let lay = layouts();
    let ok_layout = |st: &str, l: &Option<String>| l.as_ref().map(|l| lay[st].as_array().unwrap().iter().any(|x| x == l)).unwrap_or(false);
    let mut layout = s(&d, "layout");
    if !ok_layout(&stores, &layout) { layout = Some(default_layout(&stores).into()); }
    if for_claude.as_deref() == Some("skills") { stores = "markdown".into(); if !ok_layout("markdown", &s(raw, "layout")) { layout = Some("pages".into()); } }
    if for_claude.as_deref() == Some("mcp") { stores = "records".into(); }
    d.insert("stores".into(), json!(stores));
    d.insert("layout".into(), json!(layout));
    let folder = s(&d, "folder").unwrap_or_else(|| if for_claude.as_deref() == Some("skills") { ".claude/skills".into() } else if stores == "chat" { "chats".into() } else { key.into() });
    d.insert("folder".into(), json!(folder.replace('\\', "/").trim_matches('/')));
    if !d.contains_key("search") { d.insert("search".into(), json!(["markdown", "records", "diagram"].contains(&stores.as_str()))); }
    if s(&d, "new_item").is_none() {
        let n = match stores.as_str() { "images" => "Album", "files" => "Folder", "records" => "Item", "diagram" => "Diagram", "chat" => "Chat", _ => "Page" };
        if stores != "github" { d.insert("new_item".into(), json!(n)); }
    }
    if stores == "records" {
        let mut fields: Vec<Value> = d.get("fields").and_then(|f| f.as_array()).map(|a| a.iter().map(normalize_field).collect()).unwrap_or_default();
        if for_claude.as_deref() == Some("mcp") && fields.is_empty() {
            fields = ["name", "description"].iter().map(|n| normalize_field(&json!(n))).collect();
            fields.push(normalize_field(&json!({"name": "transport", "type": "select", "options": ["stdio", "http", "sse"]})));
            fields.push(normalize_field(&json!("command")));
            fields.push(normalize_field(&json!({"name": "args", "type": "list"})));
            fields.push(normalize_field(&json!("url")));
            fields.push(normalize_field(&json!({"name": "env", "type": "keyvalue"})));
            fields.push(normalize_field(&json!({"name": "headers", "type": "keyvalue"})));
        }
        if fields.is_empty() { fields.push(normalize_field(&json!("title"))); }
        let first = fields[0]["name"].as_str().unwrap_or("title").to_string();
        if s(&d, "title_field").is_none() { d.insert("title_field".into(), json!(first)); }
        let layout = d["layout"].as_str().unwrap_or("").to_string();
        if layout == "kanban" {
            let sf = s(&d, "status_field").unwrap_or_else(|| "status".into());
            d.insert("status_field".into(), json!(sf));
            let cols: Vec<Value> = d.get("columns").and_then(|c| c.as_array()).filter(|a| !a.is_empty())
                .map(|a| a.iter().map(|x| json!(x.as_str().map(|s| s.to_string()).unwrap_or_else(|| x.to_string()))).collect())
                .unwrap_or_else(|| vec![json!("To do"), json!("Doing"), json!("Done")]);
            d.insert("columns".into(), json!(cols));
            if fields.iter().any(|f| f["name"] == sf) {
                for f in fields.iter_mut() { if f["name"] == sf { f["type"] = json!("select"); f["options"] = json!(cols); } }
            } else {
                fields.push(json!({ "name": sf, "label": prettify(&sf), "type": "select", "options": cols }));
            }
        }
        if layout == "calendar" {
            let df = s(&d, "date_field").or_else(|| fields.iter().find(|f| f["type"] == "date").and_then(|f| f["name"].as_str().map(|s| s.to_string()))).unwrap_or_else(|| "date".into());
            d.insert("date_field".into(), json!(df));
            if !fields.iter().any(|f| f["name"] == df) { fields.push(json!({ "name": df, "label": prettify(&df), "type": "date" })); }
        }
        if layout == "orgchart" {
            let pf = s(&d, "parent_field").unwrap_or_else(|| "reports_to".into());
            d.insert("parent_field".into(), json!(pf));
            if !fields.iter().any(|f| f["name"] == pf) { fields.push(json!({ "name": pf, "label": prettify(&pf), "type": "text" })); }
            for f in fields.iter_mut() { if f["name"] == pf { f["type"] = json!("parent"); } }
        }
        if layout == "map" { fields.retain(|f| f["name"] != "x" && f["name"] != "y"); }
        d.insert("fields".into(), json!(fields));
    }
    if stores == "chat" {
        let p = s(&d, "permissions").filter(|p| ["ask", "auto", "read-only"].contains(&p.as_str())).unwrap_or_else(|| "ask".into());
        d.insert("permissions".into(), json!(p));
        let at: Vec<Value> = d.get("allowed_tools").and_then(|a| a.as_array()).map(|a| a.iter().map(|x| json!(x.as_str().map(|s| s.to_string()).unwrap_or_else(|| x.to_string()))).collect()).unwrap_or_default();
        d.insert("allowed_tools".into(), json!(at));
    }
    if stores == "images" && !d.contains_key("albums") { d.insert("albums".into(), json!(true)); }
    if stores == "github" {
        let repo = s(&d, "repo").unwrap_or_default();
        d.insert("repo".into(), json!(repo));
        let st = s(&d, "state").filter(|x| ["open", "closed", "all"].contains(&x.as_str())).unwrap_or_else(|| "open".into());
        d.insert("state".into(), json!(st));
    }
    Value::Object(d)
}

impl Workspace {
    pub fn features_dir(&self) -> PathBuf { self.root.join("features") }
    pub fn projects_dir(&self) -> PathBuf { self.root.join("projects") }
    pub fn public_dir(&self) -> PathBuf { self.install.join("app").join("public") }
    fn starter_dir(&self) -> PathBuf { self.install.join("app").join("starter") }

    /// First start: the data folder with the starter features (examples only on request).
    pub fn ensure(&self) {
        let _ = fs::create_dir_all(self.projects_dir());
        let fd = self.features_dir();
        if !fd.exists() {
            let _ = fs::create_dir_all(&fd);
            if let Ok(rd) = fs::read_dir(self.starter_dir().join("features")) {
                for e in rd.flatten() { let _ = fs::copy(e.path(), fd.join(e.file_name())); }
            }
        }
    }
    pub fn list_examples(&self) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(self.starter_dir().join("examples")).map(|rd| rd.flatten().filter(|e| e.path().is_dir()).map(|e| e.file_name().to_string_lossy().to_string()).collect()).unwrap_or_default();
        v.sort();
        v
    }
    pub fn add_examples(&self) -> Vec<String> {
        let mut added = vec![];
        for name in self.list_examples() {
            let dest = self.projects_dir().join(&name);
            if dest.exists() { continue; }
            if copy_dir(&self.starter_dir().join("examples").join(&name), &dest).is_ok() { added.push(name); }
        }
        added
    }

    pub fn list_features(&self) -> Vec<Value> {
        let mut out = vec![];
        let mut names: Vec<_> = fs::read_dir(self.features_dir()).map(|rd| rd.flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect()).unwrap_or_default();
        names.sort();
        for f in names {
            let key = match f.strip_suffix(".yaml").or_else(|| f.strip_suffix(".yml")) { Some(k) => k.to_string(), None => continue };
            let text = fs::read_to_string(self.features_dir().join(&f)).unwrap_or_default();
            let (raw, error, warning) = match yaml::parse_with_info(&text) {
                Ok((Value::Object(o), w)) => (o, Value::Null, if w { json!("read leniently") } else { Value::Null }),
                Ok((Value::Null, _)) => (Map::new(), Value::Null, Value::Null),
                Ok(_) => (Map::new(), json!("must be key: value pairs"), Value::Null),
                Err(e) => (Map::new(), json!(e.to_string()), Value::Null),
            };
            let def = normalize_feature(&key, &raw);
            out.push(json!({ "key": key, "file": format!("features/{f}"), "yaml": text, "error": error, "warning": warning, "raw": raw, "def": def }));
        }
        out
    }

    pub fn load_project(&self, slug: &str) -> Result<Project> {
        check_id(slug, "project")?;
        let home = self.projects_dir().join(slug);
        let file = home.join("project.yaml");
        let text = fs::read_to_string(&file).map_err(|_| err(404, format!("Project \"{slug}\" not found")))?;
        let (data, mut error) = match yaml::parse(&text) {
            Ok(Value::Object(o)) => (o, None),
            Ok(Value::Null) => (Map::new(), None),
            Ok(_) => (Map::new(), Some("project.yaml must be key: value pairs".to_string())),
            Err(e) => (Map::new(), Some(e.to_string())),
        };
        let features = self.list_features();
        let mut meta = Map::new();
        let mut feats = vec![];
        for (k, v) in data.iter() {
            if META_KEYS.contains(&k.to_lowercase().as_str()) { meta.insert(k.to_lowercase(), v.clone()); continue; }
            if !v.is_null() && !v.is_object() && !v.is_array() { meta.insert(k.clone(), v.clone()); continue; }
            let mut overrides = Map::new();
            if let Value::Object(o) = v { overrides = o.clone(); overrides.remove("items"); }
            let fkey = overrides.remove("feature").and_then(|x| x.as_str().map(|s| s.to_string())).unwrap_or_else(|| k.clone());
            let found = features.iter().find(|f| f["key"] == fkey.as_str())
                .or_else(|| features.iter().find(|f| f["key"] == fkey.to_lowercase().as_str()))
                .or_else(|| features.iter().find(|f| f["raw"]["aliases"].as_array().map(|a| a.iter().any(|x| x.as_str().map(|s| s.to_lowercase()) == Some(fkey.to_lowercase()))).unwrap_or(false)));
            let def = found.map(|f| {
                let mut raw = f["raw"].as_object().cloned().unwrap_or_default();
                for (a, b) in overrides.iter() { raw.insert(a.clone(), b.clone()); }
                let mut d = normalize_feature(k, &raw);
                d["featureName"] = f["def"]["name"].clone();
                d
            });
            feats.push(ProjectFeature {
                key: k.clone(),
                feature: found.map(|f| f["key"].as_str().unwrap_or("").to_string()).unwrap_or(fkey),
                missing: found.is_none(),
                def,
                overrides: Value::Object(overrides),
            });
        }
        let mut dir = home.clone();
        let mut external = false;
        if let Some(loc) = meta.get("location").and_then(|l| l.as_str()) {
            let l = loc.replace("{install}", &self.install.to_string_lossy()).replace("{data}", &self.root.to_string_lossy());
            let d = if Path::new(&l).is_absolute() { PathBuf::from(&l) } else { home.join(&l) };
            if d.is_dir() { dir = d; external = true; } else if error.is_none() { error = Some(format!("location: the folder \"{}\" does not exist", d.display())); }
        }
        let name = meta.get("name").map(|n| n.as_str().map(|s| s.to_string()).unwrap_or_else(|| n.to_string())).unwrap_or_else(|| slug.to_string());
        Ok(Project { slug: slug.into(), dir, home, external, file, name, meta, features: feats, yaml: text, error })
    }

    pub fn list_projects(&self) -> Vec<Value> {
        let mut out = vec![];
        for e in fs::read_dir(self.projects_dir()).map(|rd| rd.flatten().collect::<Vec<_>>()).unwrap_or_default() {
            let n = e.file_name().to_string_lossy().to_string();
            if !e.path().is_dir() || n.starts_with('.') || n.starts_with('_') || !e.path().join("project.yaml").exists() { continue; }
            match self.load_project(&n) {
                Ok(p) => out.push(json!({
                    "slug": p.slug, "name": p.name,
                    "description": p.meta.get("description").cloned().unwrap_or(json!("")),
                    "icon": p.meta.get("icon").cloned().unwrap_or(Value::Null), "color": p.meta.get("color").cloned().unwrap_or(Value::Null),
                    "tags": p.meta.get("tags").and_then(|t| t.as_array()).map(|a| a.iter().map(|x| json!(x.as_str().map(|s| s.to_string()).unwrap_or_else(|| x.to_string()))).collect::<Vec<_>>()).unwrap_or_default(),
                    "status": p.meta.get("status").cloned().unwrap_or(Value::Null), "error": p.error,
                    "features": p.features.iter().map(|f| json!({ "key": f.key, "feature": f.feature,
                        "name": f.def.as_ref().map(|d| d["name"].clone()).unwrap_or(json!(prettify(&f.key))),
                        "layout": f.def.as_ref().map(|d| d["layout"].clone()), "icon": f.def.as_ref().map(|d| d["icon"].clone()),
                        "missing": f.missing, "count": if f.missing { 0 } else { count_items(&p, f) } })).collect::<Vec<_>>(),
                    "modified": mtime_ms(&p.file),
                })),
                Err(e) => out.push(json!({ "slug": n, "name": n, "error": e.message, "features": [], "modified": 0 })),
            }
        }
        out.sort_by(|a, b| b["modified"].as_f64().unwrap_or(0.0).partial_cmp(&a["modified"].as_f64().unwrap_or(0.0)).unwrap_or(std::cmp::Ordering::Equal));
        out
    }

    pub fn list_items(&self, slug: &str, key: &str) -> Result<Value> {
        let p = self.load_project(slug)?;
        let f = p.feature(key)?;
        let def = f.def.as_ref().unwrap();
        let dir = safe_join(&p.dir, def["folder"].as_str().unwrap_or(key))?;
        match def["stores"].as_str().unwrap_or("") {
            "markdown" => Ok(json!({ "items": list_markdown(&p, def, &dir) })),
            "images" | "files" => Ok(json!({ "folders": [], "files": [] })),
            _ => Ok(json!({ "items": [] })),
        }
    }

    pub fn read_item(&self, slug: &str, key: &str, id: &str) -> Result<Value> {
        check_id(id, "id")?;
        let p = self.load_project(slug)?;
        let f = p.feature(key)?;
        let def = f.def.as_ref().unwrap();
        let file = item_path(&p, def, key, id)?;
        let text = fs::read_to_string(&file).map_err(|_| err(404, format!("Item \"{id}\" not found")))?;
        let mut base = json!({ "project": slug, "feature": key, "id": id, "file": rel(&p.dir, &file), "modified": mtime_ms(&file) });
        if def["stores"] == "records" {
            match yaml::parse(&text) { Ok(v) => { base["data"] = if v.is_null() { json!({}) } else { v }; } Err(e) => { base["error"] = json!(e.to_string()); } }
        }
        base["content"] = json!(text);
        Ok(base)
    }

    pub fn write_item(&self, slug: &str, key: &str, id: &str, content: &str) -> Result<Value> {
        check_id(id, "id")?;
        let p = self.load_project(slug)?;
        let f = p.feature(key)?;
        let def = f.def.as_ref().unwrap();
        if !["markdown", "diagram"].contains(&def["stores"].as_str().unwrap_or("")) {
            return Err(err(501, "Not in the prototype yet: only pages and diagrams can be saved"));
        }
        let file = item_path(&p, def, key, id)?;
        if let Some(parent) = file.parent() { let _ = fs::create_dir_all(parent); }
        fs::write(&file, content).map_err(|e| err(500, e.to_string()))?;
        self.read_item(slug, key, id)
    }
}

pub struct ProjectFeature {
    pub key: String,
    pub feature: String,
    pub missing: bool,
    pub def: Option<Value>,
    pub overrides: Value,
}
pub struct Project {
    pub slug: String,
    pub dir: PathBuf,
    pub home: PathBuf,
    pub external: bool,
    pub file: PathBuf,
    pub name: String,
    pub meta: Map<String, Value>,
    pub features: Vec<ProjectFeature>,
    pub yaml: String,
    pub error: Option<String>,
}
impl Project {
    pub fn feature(&self, key: &str) -> Result<&ProjectFeature> {
        let f = self.features.iter().find(|f| f.key == key).ok_or_else(|| err(404, format!("Feature \"{key}\" is not in project {}", self.name)))?;
        if f.missing { return Err(err(400, format!("Feature \"{}\" is not defined yet. Create features/{}.yaml first.", f.feature, f.feature))); }
        Ok(f)
    }
    /// The answer of GET /api/projects/<p> (server.js projectView).
    pub fn view(&self) -> Value {
        json!({ "slug": self.slug, "name": self.name, "meta": self.meta, "yaml": self.yaml, "error": self.error, "warning": Value::Null,
            "path": self.dir.to_string_lossy(), "external": self.external, "yamlPath": self.file.to_string_lossy(),
            "features": self.features.iter().map(|f| json!({ "key": f.key, "feature": f.feature, "missing": f.missing, "def": f.def, "overrides": f.overrides })).collect::<Vec<_>>() })
    }
}

fn item_path(p: &Project, def: &Value, key: &str, id: &str) -> Result<PathBuf> {
    let dir = safe_join(&p.dir, def["folder"].as_str().unwrap_or(key))?;
    let ext = match def["stores"].as_str().unwrap_or("") { "records" => "yaml", "diagram" => "mmd", "chat" => "json", _ => "md" };
    if def["for_claude"] == "skills" { return safe_join(&dir, &format!("{id}/SKILL.md")); }
    safe_join(&dir, &format!("{id}.{ext}"))
}

fn split_front_matter(text: &str) -> (Map<String, Value>, String) {
    let t = text.replace("\r\n", "\n");
    if let Some(rest) = t.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---\n").or_else(|| if rest.ends_with("\n---") { Some(rest.len() - 4) } else { None }) {
            let meta = yaml::parse(&rest[..end]).ok().and_then(|v| v.as_object().cloned()).unwrap_or_default();
            let body = rest[(end + 5).min(rest.len())..].to_string();
            return (meta, body);
        }
    }
    (Map::new(), t)
}
fn md_title(meta: &Map<String, Value>, body: &str, fallback: &str) -> String {
    if let Some(t) = meta.get("title").and_then(|t| t.as_str()) { return t.to_string(); }
    if let Some(n) = meta.get("name").and_then(|t| t.as_str()) {
        if !n.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') { return n.to_string(); }
    }
    for l in body.lines() { if let Some(h) = l.strip_prefix("# ") { return h.trim().to_string(); } }
    prettify(fallback)
}
fn md_summary(body: &str) -> String {
    let line = body.lines().map(|l| l.trim()).find(|l| !l.is_empty() && !["#", "```", "|", ">", "![", "---"].iter().any(|p| l.starts_with(p))).unwrap_or("");
    let mut out = String::new();
    let mut paren = 0;
    for c in line.chars() {
        match c { '(' => paren += 1, ')' if paren > 0 => paren -= 1, '*' | '_' | '`' | '[' | ']' => {}, _ if paren == 0 => out.push(c), _ => {} }
    }
    out.chars().take(220).collect()
}
fn list_markdown(p: &Project, def: &Value, dir: &Path) -> Vec<Value> {
    let skills = def["for_claude"] == "skills";
    let mut out: Vec<Value> = vec![];
    for e in fs::read_dir(dir).map(|rd| rd.flatten().collect::<Vec<_>>()).unwrap_or_default() {
        let n = e.file_name().to_string_lossy().to_string();
        if n.starts_with('.') || n.starts_with('_') { continue; }
        let (file, id) = if skills {
            if !e.path().is_dir() { continue; }
            let f = e.path().join("SKILL.md"); if !f.exists() { continue; } (f, n.clone())
        } else {
            if !e.path().is_file() || !n.ends_with(".md") { continue; }
            (e.path(), n.trim_end_matches(".md").to_string())
        };
        let text = fs::read_to_string(&file).unwrap_or_default();
        let (meta, body) = split_front_matter(&text);
        let tags: Vec<Value> = match meta.get("tags") {
            Some(Value::Array(a)) => a.iter().map(|x| json!(x.as_str().map(|s| s.to_string()).unwrap_or_else(|| x.to_string()))).collect(),
            Some(Value::String(s)) => s.split(',').map(|x| json!(x.trim())).collect(),
            _ => vec![],
        };
        let summary = meta.get("description").and_then(|d| d.as_str()).map(|s| s.to_string()).unwrap_or_else(|| md_summary(&body));
        out.push(json!({ "id": id, "title": md_title(&meta, &body, &id), "tags": tags, "summary": summary, "modified": mtime_ms(&file), "file": rel(&p.dir, &file) }));
    }
    out.sort_by(|a, b| a["title"].as_str().unwrap_or("").to_lowercase().cmp(&b["title"].as_str().unwrap_or("").to_lowercase()));
    out
}
fn count_items(p: &Project, f: &ProjectFeature) -> usize {
    let def = match &f.def { Some(d) => d, None => return 0 };
    let dir = match safe_join(&p.dir, def["folder"].as_str().unwrap_or(&f.key)) { Ok(d) => d, Err(_) => return 0 };
    let entries: Vec<PathBuf> = fs::read_dir(&dir).map(|rd| rd.flatten().filter(|e| { let n = e.file_name().to_string_lossy().to_string(); !n.starts_with('.') && !n.starts_with('_') }).map(|e| e.path()).collect()).unwrap_or_default();
    fn ends(p: &Path, x: &[&str]) -> bool { p.is_file() && x.iter().any(|s| p.to_string_lossy().ends_with(s)) }
    match def["stores"].as_str().unwrap_or("") {
        "markdown" if def["for_claude"] == "skills" => entries.iter().filter(|p| p.join("SKILL.md").exists()).count(),
        "markdown" => entries.iter().filter(|p| ends(p, &[".md"])).count(),
        "records" => entries.iter().filter(|p| ends(p, &[".yaml", ".yml"])).count(),
        "diagram" => entries.iter().filter(|p| ends(p, &[".mmd"])).count(),
        "chat" => entries.iter().filter(|p| ends(p, &[".json"])).count(),
        "github" => 0,
        _ => count_files(&dir),
    }
}
fn count_files(dir: &Path) -> usize {
    fs::read_dir(dir).map(|rd| rd.flatten().map(|e| if e.path().is_dir() { if e.file_name().to_string_lossy().starts_with('.') { 0 } else { count_files(&e.path()) } } else { 1 }).sum()).unwrap_or(0)
}
fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for e in fs::read_dir(from)? {
        let e = e?;
        let t = to.join(e.file_name());
        if e.path().is_dir() { copy_dir(&e.path(), &t)?; } else { fs::copy(e.path(), &t)?; }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn slugs_and_names() {
        assert_eq!(slugify("Home Lab"), "home-lab");
        assert_eq!(slugify("Größe & Co"), "groesse-co");
        assert_eq!(slugify("!!!"), "item");
        assert_eq!(prettify("my_feature-key"), "My feature key");
    }
    #[test]
    fn feature_defaults() {
        let d = normalize_feature("tasks", json!({ "stores": "records", "layout": "kanban", "fields": ["title", "due"] }).as_object().unwrap());
        assert_eq!(d["columns"], json!(["To do", "Doing", "Done"]));
        assert_eq!(d["fields"][1]["type"], "date");
        assert_eq!(d["folder"], "tasks");
        assert_eq!(normalize_feature("x", &Map::new())["layout"], "pages");
    }
}
