//! Changing projects, features and templates (app/lib/workspace.js: saveFeature … deleteProject).
//! project.yaml is always changed as text, so the client's comments and formatting stay.
use crate::files::natural_cmp;
use crate::items::{self, unique_name};
use crate::workspace::{self as w, check_id, copy_dir, err, safe_join, Project, ProjectFeature, Result, Workspace, META_KEYS, STORES};
use crate::yaml;
use regex::Regex;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::Path;

const ARCHIVE: &str = "_archive";
const TEMPLATE_MAX: u64 = 200 * 1024 * 1024;

fn s(v: &Value) -> String { match v { Value::String(s) => s.clone(), Value::Null => String::new(), o => o.to_string() } }
fn write_text(p: &Path, t: &str) -> Result<()> {
    if let Some(d) = p.parent() { fs::create_dir_all(d).map_err(|e| err(500, e.to_string()))?; }
    fs::write(p, t).map_err(|e| err(500, e.to_string()))
}
fn with_nl(t: &str) -> String { if t.ends_with('\n') { t.to_string() } else { format!("{t}\n") } }
fn parse_map(text: &str, what: &str) -> Result<Map<String, Value>> {
    match yaml::parse(text) {
        Ok(Value::Object(o)) => Ok(o),
        Ok(_) => Err(err(400, format!("{what} must be key: value pairs"))),
        Err(e) => Err(err(400, format!("{what}: {e}"))),
    }
}
fn io<T>(r: std::io::Result<T>) -> Result<T> { r.map_err(|e| err(500, e.to_string())) }

impl Workspace {
    fn templates_dir(&self) -> std::path::PathBuf { self.root.join("templates") }
    fn archive_dir(&self) -> std::path::PathBuf { self.projects_dir().join(ARCHIVE) }

    // ---------- features ----------
    pub fn get_feature(&self, key: &str) -> Option<Value> { self.list_features().into_iter().find(|f| f["key"] == key) }
    pub fn save_feature(&self, key: &str, text: &str) -> Result<Value> {
        let key = w::slugify(key).replace('-', "_");
        check_id(&key, "feature")?;
        let raw = match yaml::parse(text) {
            Ok(Value::Object(o)) => o,
            Ok(_) => return Err(err(400, "Feature YAML must be key: value pairs")),
            Err(e) => return Err(err(400, format!("Feature YAML: {e}"))),
        };
        let stores = raw.get("stores").map(s).unwrap_or_else(|| "markdown".into());
        if raw.contains_key("stores") && !STORES.contains(&stores.as_str()) { return Err(err(400, format!("stores must be one of: {}", STORES.join(", ")))); }
        if let Some(l) = raw.get("layout").map(s) {
            let ok: Vec<String> = w::layouts()[&stores].as_array().map(|a| a.iter().map(s).collect()).unwrap_or_default();
            if !ok.contains(&l) { return Err(err(400, format!("layout \"{l}\" does not work with stores: {stores}. Use one of: {}", ok.join(", ")))); }
        }
        write_text(&self.features_dir().join(format!("{key}.yaml")), &with_nl(text))?;
        self.get_feature(&key).ok_or_else(|| err(500, "Feature not saved"))
    }
    pub fn delete_feature(&self, key: &str) -> Result<Value> {
        check_id(key, "feature")?;
        let f = self.features_dir().join(format!("{key}.yaml"));
        if !f.exists() { return Err(err(404, "Feature not found")); }
        let used: Vec<String> = self.list_projects().iter().filter(|p| p["features"].as_array().map(|a| a.iter().any(|x| x["feature"] == key)).unwrap_or(false)).map(|p| s(&p["name"])).collect();
        if !used.is_empty() { return Err(err(400, format!("Still used by: {}", used.join(", ")))); }
        let t = self.features_dir().join(items::TRASH); io(fs::create_dir_all(&t))?;
        let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        io(fs::rename(&f, t.join(format!("{key}-{ms}.yaml"))))?;
        Ok(json!({ "ok": true }))
    }

    // ---------- projects ----------
    pub fn create_project(&self, body: &Value) -> Result<Project> {
        let name = body["name"].as_str().map(|n| n.trim()).filter(|n| !n.is_empty());
        let mut text = body["yaml"].as_str().filter(|y| !y.trim().is_empty()).map(|y| y.to_string())
            .unwrap_or_else(|| format!("name: {}\n", serde_json::to_string(name.unwrap_or("New project")).unwrap()));
        let data = parse_map(&text, "project.yaml").map_err(|e| if e.message.ends_with("pairs") { err(400, "project.yaml must be key: value pairs with at least \"name:\"") } else { e })?;
        if let (Some(n), None) = (name, data.get("name")) { text = format!("name: {}\n{text}", serde_json::to_string(n).unwrap()); }
        let final_name = name.map(|n| n.to_string()).or_else(|| data.get("name").map(s)).unwrap_or_else(|| "New project".into());
        io(fs::create_dir_all(self.projects_dir()))?;
        let slug = unique_name(&self.projects_dir(), &w::slugify(&final_name), "");
        let dest = self.projects_dir().join(&slug);
        if let Some(t) = body["template"].as_str().filter(|t| !t.is_empty()) {
            check_id(t, "template")?;
            let td = safe_join(&self.templates_dir(), t)?;
            if !td.is_dir() { return Err(err(404, "Template not found")); }
            io(copy_dir(&td, &dest))?;
            let _ = fs::remove_file(dest.join("template.json"));
        }
        write_text(&dest.join("project.yaml"), &with_nl(&text))?;
        self.sync_project(&slug)
    }
    pub fn save_project_yaml(&self, slug: &str, text: &str) -> Result<Project> {
        let p = self.load_project(slug)?;
        parse_map(text, "project.yaml")?;
        write_text(&p.file, &with_nl(text))?;
        self.sync_project(slug)
    }
    /// Adds "<key>:" to project.yaml as text.
    pub fn add_feature_to_project(&self, slug: &str, key: &str, settings: Option<&Value>) -> Result<Project> {
        let p = self.load_project(slug)?;
        if let Some(e) = &p.error { return Err(err(400, format!("Fix project.yaml first: {e}"))); }
        let key = key.trim();
        let ok = key.chars().next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false) && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
        if !ok { return Err(err(400, "Feature key must be letters, digits, _ or -")); }
        if p.data.contains_key(key) { return Err(err(400, format!("\"{key}\" is already in this project"))); }
        let block = match settings.and_then(|v| v.as_object()).filter(|o| !o.is_empty()) {
            Some(o) => { let mut m = Map::new(); m.insert(key.to_string(), Value::Object(o.clone())); yaml::stringify(&Value::Object(m)) }
            None => format!("{key}:\n"),
        };
        write_text(&p.file, &format!("{}\n{block}", p.yaml.trim_end()))?;
        self.sync_project(slug)
    }
    /// Sets `programs:` in project.yaml (the MCPs of programs like Blender; only known names), keeping comments.
    /// An empty list removes the key. Creates the folder of each program for its results.
    pub fn set_programs(&self, slug: &str, list: &[String]) -> Result<Project> {
        let p = self.load_project(slug)?;
        if let Some(e) = &p.error { return Err(err(400, format!("Fix project.yaml first: {e}"))); }
        let mut keep: Vec<Value> = vec![];
        for k in list {
            let k = k.trim().to_lowercase();
            if crate::programs::find(&k).is_none() { return Err(err(400, format!("Unknown program \"{k}\""))); }
            if !keep.contains(&json!(k)) { keep.push(json!(k)); }
        }
        let mut data = p.data.clone();
        if keep.is_empty() { data.remove("programs"); } else { data.insert("programs".into(), Value::Array(keep.clone())); }
        write_text(&p.file, &yaml::update_mapping(&p.yaml, &data))?;
        for k in &keep { let _ = fs::create_dir_all(p.dir.join(k.as_str().unwrap_or(""))); }
        self.sync_project(slug)
    }
    /// Saves the Overview's dashboard (plan DASHBOARD) as `dashboard:` in project.yaml, keeping comments; an empty list removes it.
    /// A block: what (a feature key of the project), show (number | list), filter, count, x, y, w (1–4), h (1–3).
    pub fn set_dashboard(&self, slug: &str, blocks: &Value) -> Result<Project> {
        let p = self.load_project(slug)?;
        if let Some(e) = &p.error { return Err(err(400, format!("Fix project.yaml first: {e}"))); }
        let list = blocks.as_array().ok_or_else(|| err(400, "dashboard must be a list of blocks"))?;
        let mut out: Vec<Value> = vec![];
        for b in list {
            let what = b["what"].as_str().unwrap_or("").trim().to_string();
            if !p.features.iter().any(|f| f.key == what) { return Err(err(400, format!("\"{what}\" is not a feature of this project"))); }
            let show = if b["show"] == "list" { "list" } else { "number" };
            let n = |k: &str, lo: i64, hi: i64, d: i64| -> i64 { b[k].as_i64().or_else(|| b[k].as_str().and_then(|s| s.parse().ok())).unwrap_or(d).clamp(lo, hi) };
            let mut m = Map::new();
            m.insert("what".into(), json!(what));
            m.insert("show".into(), json!(show));
            if let Some(f) = b["filter"].as_str().map(|s| s.trim()).filter(|s| !s.is_empty()) { m.insert("filter".into(), json!(f)); }
            if show == "list" { m.insert("count".into(), json!(n("count", 1, 50, 5))); }
            m.insert("x".into(), json!(n("x", 0, 3, 0)));
            m.insert("y".into(), json!(n("y", 0, 99, 0)));
            m.insert("w".into(), json!(n("w", 1, 4, 1)));
            m.insert("h".into(), json!(n("h", 1, 3, 1)));
            out.push(Value::Object(m));
        }
        let mut data = p.data.clone();
        if out.is_empty() { data.remove("dashboard"); } else { data.insert("dashboard".into(), Value::Array(out)); }
        write_text(&p.file, &yaml::update_mapping(&p.yaml, &data))?;
        self.load_project(slug)
    }
    /// Removes the key line and its indented block (the content folder stays on disk).
    pub fn remove_feature_from_project(&self, slug: &str, key: &str) -> Result<Project> {
        let p = self.load_project(slug)?;
        if !p.data.contains_key(key) { return Err(err(404, "Not in project")); }
        let re = Regex::new(&format!(r"^\s{{0,2}}{}\s*:", regex::escape(key))).unwrap();
        let mut out: Vec<&str> = vec![]; let mut skipping = false;
        for l in p.yaml.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)) {
            if skipping {
                let indented = l.starts_with(|c: char| c.is_whitespace()) && !l.trim().is_empty();
                if indented { continue; }
                if l.trim().is_empty() { skipping = false; out.push(l); continue; }
                skipping = false;
            }
            if re.is_match(l) { skipping = true; continue; }
            out.push(l);
        }
        let mut text = out.join("\n");
        while text.contains("\n\n\n") { text = text.replace("\n\n\n", "\n\n"); }
        write_text(&p.file, &text)?;
        self.sync_project(slug)
    }
    /// Creates the feature folders and seed items listed in project.yaml, and .mcp.json.
    pub fn sync_project(&self, slug: &str) -> Result<Project> {
        let p = self.load_project(slug)?;
        if p.error.is_some() { return Ok(p); }
        for f in p.features.iter().filter(|f| !f.missing) {
            let d = f.def.as_ref().unwrap();
            if d["stores"] == "github" { continue; }
            if let Ok(dir) = items::feature_dir(&p, f) { let _ = fs::create_dir_all(&dir); }
            for seed in &f.seeds { let _ = seed_item(&p, f, seed); }
        }
        self.write_mcp_json(&p);
        self.load_project(slug)
    }

    // ---------- rename, archive, delete ----------
    pub fn rename_project(&self, slug: &str, body: &Value) -> Result<Project> {
        let p = self.load_project(slug)?;
        let name = body["name"].as_str().unwrap_or("").trim().to_string();
        if name.is_empty() { return Err(err(400, "Please enter a name")); }
        let plain = name.chars().all(|c| c.is_alphanumeric() || c == '_' || " .()&+-".contains(c)) && !name.starts_with(|c: char| c.is_ascii_digit());
        let line = format!("name: {}", if plain { name.clone() } else { serde_json::to_string(&name).unwrap() });
        let re = Regex::new(r"(?m)^name\s*:.*$").unwrap();
        let text = if re.is_match(&p.yaml) { re.replace(&p.yaml, regex::NoExpand(&line)).into_owned() }
            else if let Some(rest) = p.yaml.strip_prefix("---\n") { format!("---\n{line}\n{rest}") } else { format!("{line}\n{}", p.yaml) };
        parse_map(&text, "project.yaml")?;
        write_text(&p.file, &text)?;
        let mut new_slug = slug.to_string();
        if body["folder"].as_bool().unwrap_or(false) {
            let target = w::slugify(&name);
            if target != slug {
                new_slug = unique_name(&self.projects_dir(), &target, "");
                io(fs::rename(&p.home, self.projects_dir().join(&new_slug)))?;
            }
        }
        self.load_project(&new_slug)
    }
    pub fn archive_project(&self, slug: &str) -> Result<Value> {
        let p = self.load_project(slug)?;
        io(fs::create_dir_all(self.archive_dir()))?;
        let name = unique_name(&self.archive_dir(), slug, "");
        io(fs::rename(&p.home, self.archive_dir().join(&name)))?;
        write_text(&self.archive_dir().join(&name).join(".archived"), &format!("{}\n", items::now_iso()))?;
        Ok(json!({ "ok": true, "archived": name }))
    }
    pub fn list_archived(&self) -> Vec<Value> {
        let d = self.archive_dir();
        let mut out: Vec<Value> = fs::read_dir(&d).map(|r| r.flatten().filter(|e| e.path().join("project.yaml").exists()).map(|e| {
            let slug = e.file_name().to_string_lossy().to_string();
            let name = fs::read_to_string(e.path().join("project.yaml")).ok().and_then(|t| yaml::parse(&t).ok()).and_then(|v| v.get("name").map(s)).filter(|n| !n.is_empty()).unwrap_or_else(|| slug.clone());
            let when = fs::read_to_string(e.path().join(".archived")).ok().map(|t| t.trim().to_string());
            json!({ "slug": slug, "name": name, "archived": when })
        }).collect()).unwrap_or_default();
        out.sort_by(|a, b| s(&b["archived"]).cmp(&s(&a["archived"])));
        out
    }
    pub fn restore_project(&self, archived: &str) -> Result<Project> {
        check_id(archived, "project")?;
        let from = safe_join(&self.archive_dir(), archived)?;
        if !from.join("project.yaml").exists() { return Err(err(404, "Not in the archive")); }
        let slug = unique_name(&self.projects_dir(), archived, "");
        let _ = fs::remove_file(from.join(".archived"));
        io(fs::rename(&from, self.projects_dir().join(&slug)))?;
        self.load_project(&slug)
    }
    /// Deletes the project's folder in data/projects/ (or in the archive) for good.
    /// A project with location: keeps its content folder: only its project.yaml folder goes.
    pub fn delete_project(&self, slug: &str, archived: bool) -> Result<Value> {
        check_id(slug, "project")?;
        let dir = safe_join(&if archived { self.archive_dir() } else { self.projects_dir() }, slug)?;
        if !dir.join("project.yaml").exists() { return Err(err(404, "Project not found")); }
        io(fs::remove_dir_all(&dir))?;
        Ok(json!({ "ok": true }))
    }

    // ---------- templates: data/templates/<id>/ = project.yaml + template.json (+ starter content) ----------
    pub fn list_templates(&self) -> Vec<Value> {
        let mut out: Vec<Value> = fs::read_dir(self.templates_dir()).map(|r| r.flatten().filter(|e| e.path().join("project.yaml").exists()).map(|e| {
            let d = e.path(); let id = e.file_name().to_string_lossy().to_string();
            let meta: Value = fs::read_to_string(d.join("template.json")).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(json!({}));
            let y = fs::read_to_string(d.join("project.yaml")).unwrap_or_default();
            let features: Vec<String> = yaml::parse(&y).ok().and_then(|v| v.as_object().cloned()).map(|o| o.keys().filter(|k| !META_KEYS.contains(&k.as_str())).cloned().collect()).unwrap_or_default();
            let or = |k: &str, d: Value| if meta[k].is_null() { d } else { meta[k].clone() };
            json!({ "id": id, "name": or("name", json!(id)), "description": or("description", json!("")), "content": meta["content"] == true,
                "created": or("created", Value::Null), "from": or("from", Value::Null), "yaml": y, "features": features })
        }).collect()).unwrap_or_default();
        out.sort_by(|a, b| natural_cmp(&s(&a["name"]), &s(&b["name"])));
        out
    }
    /// Saves a project's structure and, if wanted, its content as a template.
    /// Never copied: chats, the trash, Claude's generated files, and location:.
    pub fn save_template(&self, slug: &str, body: &Value) -> Result<Value> {
        let p = self.load_project(slug)?;
        if let Some(e) = &p.error { return Err(err(400, format!("Fix project.yaml first: {e}"))); }
        let name = body["name"].as_str().map(|n| n.trim().to_string()).filter(|n| !n.is_empty()).unwrap_or_else(|| p.name.clone());
        io(fs::create_dir_all(self.templates_dir()))?;
        let id = unique_name(&self.templates_dir(), &w::slugify(&name), "");
        let d = self.templates_dir().join(&id);
        let re = Regex::new(r"(?m)^location:.*(\r?\n)?").unwrap();
        let y = re.replace(&fs::read_to_string(&p.file).unwrap_or_default(), "").into_owned();
        write_text(&d.join("project.yaml"), &y)?;
        let content = body["content"].as_bool().unwrap_or(false);
        if content {
            let mut size = 0u64;
            let r: Result<()> = (|| {
                for f in p.features.iter().filter(|f| !f.missing) {
                    let def = f.def.as_ref().unwrap();
                    if def["stores"] == "chat" || def["stores"] == "github" { continue; }
                    let folder = s(&def["folder"]); if folder.is_empty() { continue; }
                    let src = safe_join(&p.dir, &folder)?; if !src.is_dir() { continue; }
                    copy_filtered(&src, &d.join(&folder), &mut size)?;
                }
                Ok(())
            })();
            if let Err(e) = r { let _ = fs::remove_dir_all(&d); return Err(e); }
        }
        let meta = json!({ "name": name, "description": s(&body["description"]), "content": content, "from": p.name, "created": items::now_iso() });
        write_text(&d.join("template.json"), &(serde_json::to_string_pretty(&meta).unwrap() + "\n"))?;
        self.list_templates().into_iter().find(|t| t["id"] == id.as_str()).ok_or_else(|| err(500, "Template not saved"))
    }
    pub fn delete_template(&self, id: &str) -> Result<Value> {
        check_id(id, "template")?;
        let d = safe_join(&self.templates_dir(), id)?;
        if !d.is_dir() { return Err(err(404, "Template not found")); }
        io(fs::remove_dir_all(&d))?;
        Ok(json!({ "ok": true }))
    }
}

fn copy_filtered(from: &Path, to: &Path, size: &mut u64) -> Result<()> {
    io(fs::create_dir_all(to))?;
    for e in io(fs::read_dir(from))?.flatten() {
        let n = e.file_name().to_string_lossy().to_string();
        if [".trash", ".git", "node_modules"].contains(&n.as_str()) { continue; }
        let p = e.path();
        if p.is_dir() { copy_filtered(&p, &to.join(&n), size)?; continue; }
        *size += fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
        if *size > TEMPLATE_MAX { return Err(err(413, "The content is larger than 200 MB; save the template without content")); }
        io(fs::copy(&p, to.join(&n)))?;
    }
    Ok(())
}

fn seed_title(seed: &Value, def: &Value) -> Option<String> {
    match seed {
        Value::Null => None,
        Value::Object(o) => Some(o.get("title").or(o.get("name")).or(def["title_field"].as_str().and_then(|k| o.get(k))).filter(|v| !v.is_null()).map(s).unwrap_or_else(|| "Untitled".into())),
        other => Some(s(other)),
    }
}
fn seed_item(p: &Project, f: &ProjectFeature, seed: &Value) -> Result<()> {
    let def = f.def.as_ref().unwrap();
    let Some(title) = seed_title(seed, def) else { return Ok(()) };
    let id = w::slugify(&title);
    let d = items::feature_dir(p, f)?;
    let tf = def["title_field"].as_str().unwrap_or("title");
    match def["stores"].as_str().unwrap_or("") {
        "markdown" if def["for_claude"] == "skills" => {
            let file = d.join(&id).join("SKILL.md");
            if !file.exists() { write_text(&file, &items::skill_stub(&id, &title, seed["description"].as_str().filter(|_| seed.is_object())))?; }
        }
        "markdown" => {
            let file = d.join(format!("{id}.md"));
            let extra = if seed.is_object() { seed["content"].as_str().map(|c| format!("{c}\n")).unwrap_or_default() } else { String::new() };
            if !file.exists() { write_text(&file, &format!("# {title}\n\n{extra}"))?; }
        }
        "records" => {
            let file = d.join(format!("{id}.yaml"));
            if !file.exists() {
                let mut data = seed.as_object().cloned().unwrap_or_else(|| { let mut m = Map::new(); m.insert(tf.into(), json!(title)); m });
                if data.get(tf).map(|v| v.is_null() || v == "" || v == false).unwrap_or(true) { data.insert(tf.into(), json!(title)); }
                write_text(&file, &yaml::stringify(&Value::Object(data)))?;
            }
        }
        "images" | "files" => io(fs::create_dir_all(d.join(&id)))?,
        "diagram" => {
            let file = d.join(format!("{id}.mmd"));
            if !file.exists() { write_text(&file, &format!("%% {title}\nflowchart LR\n  A[Start] --> B[Next step]\n"))?; }
        }
        _ => {}
    }
    Ok(())
}
