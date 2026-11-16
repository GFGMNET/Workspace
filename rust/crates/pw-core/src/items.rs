//! Items of every storage type: pages, records, diagrams, chats, pictures and files
//! (app/lib/workspace.js: listRecords … saveUpload; app/lib/exif.js).
use crate::workspace::{self as w, err, safe_join, Project, ProjectFeature, Result, Workspace};
use crate::yaml;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const TRASH: &str = ".trash";

pub fn is_image(name: &str) -> bool {
    let n = name.to_lowercase();
    [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif"].iter().any(|e| n.ends_with(e))
}
fn hidden(n: &str) -> bool { n.starts_with('.') || n.starts_with('_') }
fn now_ms() -> u128 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0) }
pub fn now_iso() -> String {
    let ms = now_ms() as i64; let secs = ms / 1000; let (y, mo, d) = civil(secs.div_euclid(86400));
    let t = secs.rem_euclid(86400);
    format!("{y:04}-{mo:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z", t / 3600, (t / 60) % 60, t % 60, ms.rem_euclid(1000))
}
pub fn civil(z: i64) -> (i64, u32, u32) {
    let z = z + 719468; let era = z.div_euclid(146097); let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
fn iso_from_ms(ms: f64) -> String {
    let ms = ms as i64; let secs = ms / 1000; let (y, mo, d) = civil(secs.div_euclid(86400)); let t = secs.rem_euclid(86400);
    format!("{y:04}-{mo:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z", t / 3600, (t / 60) % 60, t % 60, ms.rem_euclid(1000))
}

pub fn unique_name(dir: &Path, base: &str, ext: &str) -> String {
    let mut name = base.to_string(); let mut i = 2;
    while dir.join(format!("{name}{ext}")).exists() { name = format!("{base}-{i}"); i += 1; }
    name
}
fn write_text(p: &Path, s: &str) -> Result<()> {
    if let Some(d) = p.parent() { fs::create_dir_all(d).map_err(|e| err(500, e.to_string()))?; }
    fs::write(p, s).map_err(|e| err(500, e.to_string()))
}
pub fn feature_dir(p: &Project, f: &ProjectFeature) -> Result<PathBuf> {
    safe_join(&p.dir, f.def.as_ref().and_then(|d| d["folder"].as_str()).unwrap_or(&f.key))
}
fn def(f: &ProjectFeature) -> &Value { f.def.as_ref().expect("feature definition") }
fn stores(f: &ProjectFeature) -> &str { def(f)["stores"].as_str().unwrap_or("") }

pub fn item_path(p: &Project, f: &ProjectFeature, id: &str) -> Result<PathBuf> {
    if id.is_empty() || id.contains('/') || id.contains('\\') || id.starts_with('.') { return Err(err(400, "Invalid item")); }
    let d = feature_dir(p, f)?;
    match stores(f) {
        "markdown" if def(f)["for_claude"] == "skills" => safe_join(&d, &format!("{id}/SKILL.md")),
        "markdown" => safe_join(&d, &format!("{id}.md")),
        "records" => { let y = safe_join(&d, &format!("{id}.yaml"))?; let yml = safe_join(&d, &format!("{id}.yml"))?; Ok(if y.exists() || !yml.exists() { y } else { yml }) }
        "diagram" => safe_join(&d, &format!("{id}.mmd")),
        "chat" => safe_join(&d, &format!("{id}.json")),
        _ => Err(err(400, "This feature has no single-file items")),
    }
}

fn str_of(v: &Value) -> String { match v { Value::String(s) => s.clone(), Value::Null => String::new(), other => other.to_string() } }

pub fn list_records(p: &Project, f: &ProjectFeature) -> Vec<Value> {
    let d = match feature_dir(p, f) { Ok(d) => d, Err(_) => return vec![] };
    let tf = def(f)["title_field"].as_str().unwrap_or("title").to_string();
    let mut out = vec![];
    for e in fs::read_dir(&d).map(|r| r.flatten().collect::<Vec<_>>()).unwrap_or_default() {
        let n = e.file_name().to_string_lossy().to_string();
        if !e.path().is_file() || hidden(&n) || !(n.ends_with(".yaml") || n.ends_with(".yml")) { continue; }
        let (data, error) = match fs::read_to_string(e.path()).ok().map(|t| yaml::parse(&t)) {
            Some(Ok(Value::Object(o))) => (Value::Object(o), Value::Null),
            Some(Ok(Value::Null)) => (json!({}), Value::Null),
            Some(Ok(other)) => (json!({ "value": other }), Value::Null),
            Some(Err(er)) => (json!({}), json!(er.to_string())),
            None => (json!({}), json!("cannot read")),
        };
        let id = n.trim_end_matches(".yaml").trim_end_matches(".yml").to_string();
        let title = [tf.as_str(), "title", "name"].iter().find_map(|k| data.get(*k).filter(|v| !v.is_null()).map(str_of)).unwrap_or_else(|| w::prettify(&id));
        out.push(json!({ "id": id, "title": title, "data": data, "error": error, "modified": w::mtime_ms(&e.path()), "file": w::rel(&p.dir, &e.path()) }));
    }
    out.sort_by(|a, b| a["title"].as_str().unwrap_or("").cmp(b["title"].as_str().unwrap_or("")));
    out
}
pub fn list_diagrams(p: &Project, f: &ProjectFeature) -> Vec<Value> {
    let d = match feature_dir(p, f) { Ok(d) => d, Err(_) => return vec![] };
    let folder = def(f)["folder"].as_str().unwrap_or("").to_string();
    let mut out: Vec<Value> = fs::read_dir(&d).map(|r| r.flatten().filter_map(|e| {
        let n = e.file_name().to_string_lossy().to_string();
        if !n.ends_with(".mmd") || n.starts_with('.') { return None; }
        let text = fs::read_to_string(e.path()).unwrap_or_default();
        let id = n.trim_end_matches(".mmd").to_string();
        let title = text.lines().find_map(|l| l.strip_prefix("%%").map(|t| t.trim().to_string()).filter(|t| !t.is_empty())).unwrap_or_else(|| w::prettify(&id));
        Some(json!({ "id": id, "title": title, "modified": w::mtime_ms(&e.path()), "file": format!("{folder}/{n}") }))
    }).collect()).unwrap_or_default();
    out.sort_by(|a, b| a["title"].as_str().unwrap_or("").cmp(b["title"].as_str().unwrap_or("")));
    out
}
pub fn list_chats(p: &Project, f: &ProjectFeature) -> Vec<Value> {
    let d = match feature_dir(p, f) { Ok(d) => d, Err(_) => return vec![] };
    let mut out: Vec<Value> = fs::read_dir(&d).map(|r| r.flatten().filter_map(|e| {
        let n = e.file_name().to_string_lossy().to_string();
        if !n.ends_with(".json") { return None; }
        let id = n.trim_end_matches(".json").to_string();
        Some(match fs::read_to_string(e.path()).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()) {
            Some(c) => json!({ "id": id, "title": c.get("title").cloned().unwrap_or(json!("Chat")), "created": c["created"], "updated": if c["updated"].is_null() { c["created"].clone() } else { c["updated"].clone() }, "count": c["messages"].as_array().map(|a| a.len()).unwrap_or(0) }),
            None => json!({ "id": id, "title": n, "error": true }),
        })
    }).collect()).unwrap_or_default();
    out.sort_by(|a, b| str_of(&b["updated"]).cmp(&str_of(&a["updated"])));
    out
}

// ---------- pictures and files ----------
/// The EXIF "date taken" of a JPEG (DateTimeOriginal, else DateTime), like app/lib/exif.js.
pub fn date_taken(file: &Path) -> Option<String> {
    let n = file.to_string_lossy().to_lowercase();
    if !(n.ends_with(".jpg") || n.ends_with(".jpeg")) { return None; }
    let mut buf = vec![0u8; 256 * 1024];
    let len = { use std::io::Read; let mut f = fs::File::open(file).ok()?; f.read(&mut buf).ok()? };
    let b = &buf[..len];
    if b.len() < 4 || b[0] != 0xff || b[1] != 0xd8 { return None; }
    let mut o = 2usize;
    while o + 4 < b.len() && b[o] == 0xff {
        let marker = b[o + 1]; let size = u16::from_be_bytes([b[o + 2], b[o + 3]]) as usize;
        if marker == 0xe1 && b.get(o + 4..o + 10) == Some(b"Exif\0\0") { return parse_tiff(b, o + 10).and_then(|s| to_iso(&s)); }
        if marker == 0xda { break; }
        o += 2 + size;
    }
    None
}
fn parse_tiff(b: &[u8], start: usize) -> Option<String> {
    let le = b.get(start..start + 2)? == b"II";
    let u16_ = |o: usize| -> Option<u32> { let x = b.get(o..o + 2)?; Some(if le { u16::from_le_bytes([x[0], x[1]]) } else { u16::from_be_bytes([x[0], x[1]]) } as u32) };
    let u32_ = |o: usize| -> Option<u32> { let x = b.get(o..o + 4)?; Some(if le { u32::from_le_bytes([x[0], x[1], x[2], x[3]]) } else { u32::from_be_bytes([x[0], x[1], x[2], x[3]]) }) };
    if u16_(start + 2)? != 42 { return None; }
    let mut tags: std::collections::HashMap<u32, String> = Default::default();
    let mut exif_ifd: Option<u32> = None;
    let read_ifd = |rel: u32, wanted: &[u32], tags: &mut std::collections::HashMap<u32, String>, exif_ifd: &mut Option<u32>| -> Option<()> {
        let at = start + rel as usize; let n = u16_(at)? as usize;
        for i in 0..n {
            let e = at + 2 + i * 12; if e + 12 > b.len() { return None; }
            let (tag, typ, count) = (u16_(e)?, u16_(e + 2)?, u32_(e + 4)? as usize);
            if !wanted.contains(&tag) { continue; }
            if typ == 2 { let off = if count > 4 { start + u32_(e + 8)? as usize } else { e + 8 }; if let Some(s) = b.get(off..off + count) { tags.insert(tag, String::from_utf8_lossy(s).split('\0').next().unwrap_or("").to_string()); } }
            else if typ == 4 && tag == 0x8769 { *exif_ifd = u32_(e + 8); }
        }
        Some(())
    };
    let first = u32_(start + 4)?;
    read_ifd(first, &[0x0132u32, 0x8769][..], &mut tags, &mut exif_ifd);
    if let Some(x) = exif_ifd { read_ifd(x, &[0x9003u32, 0x9004][..], &mut tags, &mut exif_ifd); }
    tags.get(&0x9003).or(tags.get(&0x9004)).or(tags.get(&0x0132)).cloned()
}
fn to_iso(s: &str) -> Option<String> {
    if !s.is_ascii() { return None; }
    let c: Vec<char> = s.chars().collect();
    if c.len() < 19 || c[4] != ':' || c[7] != ':' || &s[0..4] == "0000" { return None; }
    if !(c[10] == ' ' || c[10] == 'T') { return None; }
    let digits = |r: std::ops::Range<usize>| c[r].iter().all(|x| x.is_ascii_digit());
    if !(digits(0..4) && digits(5..7) && digits(8..10) && digits(11..13) && digits(14..16) && digits(17..19)) { return None; }
    Some(format!("{}-{}-{}T{}:{}:{}", &s[0..4], &s[5..7], &s[8..10], &s[11..13], &s[14..16], &s[17..19]))
}
fn file_entry(folder: &str, full: &Path, rel: &str, name: &str, album: &str) -> Value {
    let md = fs::metadata(full).ok(); let mt = w::mtime_ms(full);
    let taken = if is_image(name) { date_taken(full) } else { None };
    let date = taken.clone().unwrap_or_else(|| iso_from_ms(mt));
    json!({ "name": name, "path": format!("{folder}/{rel}"), "album": album, "size": md.map(|m| m.len()).unwrap_or(0), "modified": mt,
        "taken": taken, "date": date, "image": is_image(name) })
}
pub fn list_folder(p: &Project, f: &ProjectFeature, sub: &str, all: bool) -> Result<Value> {
    let base = feature_dir(p, f)?;
    let d = if sub.is_empty() { base.clone() } else { safe_join(&base, sub)? };
    if !d.exists() { return Ok(json!({ "folders": [], "files": [] })); }
    let images_only = stores(f) == "images";
    let folder = def(f)["folder"].as_str().unwrap_or("").to_string();
    fn walk(dir: &Path, rel_dir: &str, deep: bool, images_only: bool, folder: &str) -> Vec<Value> {
        let mut out = vec![];
        for e in fs::read_dir(dir).map(|r| r.flatten().collect::<Vec<_>>()).unwrap_or_default() {
            let n = e.file_name().to_string_lossy().to_string();
            if hidden(&n) { continue; }
            let rel = if rel_dir.is_empty() { n.clone() } else { format!("{rel_dir}/{n}") };
            if e.path().is_dir() { if deep { out.extend(walk(&e.path(), &rel, true, images_only, folder)); } }
            else if !images_only || is_image(&n) { out.push(file_entry(folder, &e.path(), &rel, &n, rel_dir)); }
        }
        out
    }
    let mut folders = vec![];
    for e in fs::read_dir(&d).map(|r| r.flatten().collect::<Vec<_>>()).unwrap_or_default() {
        let n = e.file_name().to_string_lossy().to_string();
        if !e.path().is_dir() || hidden(&n) { continue; }
        let rel = if sub.is_empty() { n.clone() } else { format!("{sub}/{n}") };
        let inside = walk(&e.path(), &rel, true, images_only, &folder);
        let mut dates: Vec<String> = inside.iter().map(|x| str_of(&x["date"])).collect(); dates.sort();
        let mut imgs: Vec<&Value> = inside.iter().filter(|x| x["image"] == true).collect();
        imgs.sort_by(|a, b| str_of(&a["date"]).cmp(&str_of(&b["date"])));
        folders.push(json!({ "id": rel, "title": n, "count": inside.len(), "first": dates.first(), "latest": dates.last(),
            "size": inside.iter().map(|x| x["size"].as_u64().unwrap_or(0)).sum::<u64>(), "cover": imgs.first().map(|c| c["path"].clone()) }));
    }
    let mut files = walk(&d, sub, all, images_only, &folder);
    folders.sort_by(|a, b| str_of(&a["title"]).cmp(&str_of(&b["title"])));
    files.sort_by(|a, b| str_of(&a["name"]).cmp(&str_of(&b["name"])));
    Ok(json!({ "folders": folders, "files": files }))
}
fn find_map_image(p: &Project, f: &ProjectFeature) -> Value {
    let folder = def(f)["folder"].as_str().unwrap_or("").to_string();
    feature_dir(p, f).ok().and_then(|d| fs::read_dir(d).ok()).and_then(|rd| rd.flatten().map(|e| e.file_name().to_string_lossy().to_string())
        .find(|n| n.to_lowercase().starts_with("_map.") && is_image(n))).map(|n| json!(format!("{folder}/{n}"))).unwrap_or(Value::Null)
}

pub fn clean_record(data: &Map<String, Value>, d: &Value) -> Map<String, Value> {
    let mut out = Map::new();
    for (k, v) in data {
        let empty = match v { Value::Null => true, Value::String(s) => s.is_empty(), Value::Array(a) => a.is_empty(), Value::Object(o) => o.is_empty(), _ => false };
        if empty { continue; }
        let is_num = d["fields"].as_array().and_then(|fs| fs.iter().find(|x| x["name"] == k.as_str())).map(|x| x["type"] == "number").unwrap_or(false);
        if let (true, Value::String(s)) = (is_num, v) {
            if let Ok(n) = s.trim().parse::<f64>() {
                out.insert(k.clone(), if n.fract() == 0.0 && n.abs() < 1e15 { json!(n as i64) } else { json!(n) });
                continue;
            }
        }
        out.insert(k.clone(), v.clone());
    }
    out
}
pub(crate) fn skill_stub(id: &str, title: &str, description: Option<&str>) -> String {
    format!("---\nname: {id}\ndescription: {}\n---\n\n# {title}\n\n## Instructions\n\n1. ...\n", description.unwrap_or("Describe when Claude should use this skill."))
}

impl Workspace {
    pub fn list_items(&self, slug: &str, key: &str, folder: &str, all: bool) -> Result<Value> {
        let p = self.load_project(slug)?; let f = p.feature(key)?;
        Ok(match stores(f) {
            "markdown" => json!({ "items": w::list_markdown(&p, def(f), &feature_dir(&p, f)?) }),
            "records" => { let mut r = json!({ "items": list_records(&p, f) }); if def(f)["layout"] == "map" { r["mapImage"] = find_map_image(&p, f); } r }
            "diagram" => json!({ "items": list_diagrams(&p, f) }),
            "chat" => json!({ "items": list_chats(&p, f) }),
            _ => list_folder(&p, f, folder, all)?,
        })
    }
    pub fn read_item(&self, slug: &str, key: &str, id: &str) -> Result<Value> {
        let p = self.load_project(slug)?; let f = p.feature(key)?;
        let file = item_path(&p, f, id)?;
        let text = fs::read_to_string(&file).map_err(|_| err(404, format!("Item \"{id}\" not found")))?;
        let mut base = json!({ "project": slug, "feature": key, "id": id, "file": w::rel(&p.dir, &file), "modified": w::mtime_ms(&file) });
        match stores(f) {
            "records" => match yaml::parse(&text) {
                Ok(v) => { base["data"] = if v.is_null() { json!({}) } else { v }; base["content"] = json!(text); }
                Err(e) => { base["content"] = json!(text); base["error"] = json!(e.to_string()); }
            },
            "chat" => { base["chat"] = serde_json::from_str(&text).map_err(|e| err(500, e.to_string()))?; }
            _ => { base["content"] = json!(text); }
        }
        Ok(base)
    }
    pub fn write_item(&self, slug: &str, key: &str, id: &str, content: Option<&str>, data: Option<&Value>) -> Result<Value> {
        let p = self.load_project(slug)?; let f = p.feature(key)?;
        let file = item_path(&p, f, id)?;
        match stores(f) {
            "records" => {
                let text = match data.and_then(|d| d.as_object()) {
                    Some(d) => {
                        let clean = clean_record(d, def(f));
                        match fs::read_to_string(&file) { Ok(old) => yaml::update_mapping(&old, &clean), Err(_) => yaml::stringify(&Value::Object(clean)) }
                    }
                    None => { let t = content.unwrap_or("").to_string(); yaml::parse(&t).map_err(|e| err(400, format!("Record YAML: {e}")))?; t }
                };
                write_text(&file, &text)?;
            }
            "chat" => write_text(&file, &serde_json::to_string_pretty(data.unwrap_or(&json!({}))).unwrap())?,
            _ => write_text(&file, content.unwrap_or(""))?,
        }
        if def(f)["for_claude"] == "mcp" { self.write_mcp_json(&self.load_project(slug)?); }
        self.read_item(slug, key, id)
    }
    pub fn create_item(&self, slug: &str, key: &str, body: &Value) -> Result<Value> {
        let p = self.load_project(slug)?; let f = p.feature(key)?; let d = def(f);
        let dir = feature_dir(&p, f)?; let _ = fs::create_dir_all(&dir);
        let tf = d["title_field"].as_str().unwrap_or("title");
        let title = body["title"].as_str().map(|s| s.to_string()).or_else(|| body["data"].get(tf).map(str_of)).filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "Untitled".into());
        let title = title.trim().to_string();
        let base = w::slugify(&title);
        let content = body["content"].as_str().filter(|s| !s.is_empty());
        match stores(f) {
            "markdown" if d["for_claude"] == "skills" => {
                let id = unique_name(&dir, &base, "");
                write_text(&dir.join(&id).join("SKILL.md"), &content.map(|c| c.to_string()).unwrap_or_else(|| skill_stub(&id, &title, body["data"]["description"].as_str())))?;
                Ok(json!({ "id": id }))
            }
            "markdown" => {
                let id = unique_name(&dir, &base, ".md");
                write_text(&dir.join(format!("{id}.md")), &content.map(|c| c.to_string()).unwrap_or_else(|| format!("# {title}\n\n")))?;
                Ok(json!({ "id": id }))
            }
            "records" => {
                let id = unique_name(&dir, &base, ".yaml");
                let mut rec = body["data"].as_object().cloned().unwrap_or_default();
                if rec.get(tf).map(|v| v.is_null() || v == "").unwrap_or(true) { rec.insert(tf.to_string(), json!(title)); }
                write_text(&dir.join(format!("{id}.yaml")), &yaml::stringify(&Value::Object(clean_record(&rec, d))))?;
                if d["for_claude"] == "mcp" { self.write_mcp_json(&self.load_project(slug)?); }
                Ok(json!({ "id": id }))
            }
            "diagram" => {
                let id = unique_name(&dir, &base, ".mmd");
                write_text(&dir.join(format!("{id}.mmd")), &content.map(|c| c.to_string()).unwrap_or_else(|| format!("%% {title}\nflowchart LR\n  A[Start] --> B[Next step]\n")))?;
                Ok(json!({ "id": id }))
            }
            "images" | "files" => {
                let folder = body["folder"].as_str().unwrap_or("");
                let parent = if folder.is_empty() { dir.clone() } else { safe_join(&dir, folder)? };
                let id = unique_name(&parent, &base, "");
                fs::create_dir_all(parent.join(&id)).map_err(|e| err(500, e.to_string()))?;
                Ok(json!({ "id": if folder.is_empty() { id } else { format!("{folder}/{id}") } }))
            }
            "chat" => {
                let now = now_iso();
                let short: String = base.chars().take(40).collect();
                let id = unique_name(&dir, &format!("{}-{short}", &now[..10]), ".json");
                let chat = json!({ "title": title, "created": now, "updated": now, "sessionId": null, "allowedTools": [], "messages": [] });
                write_text(&dir.join(format!("{id}.json")), &serde_json::to_string_pretty(&chat).unwrap())?;
                Ok(json!({ "id": id }))
            }
            _ => Err(err(400, "Cannot create items here")),
        }
    }
    /// Nothing is deleted for real: items move to <project>/.trash/<feature>/.
    pub fn trash_item(&self, slug: &str, key: &str, id: Option<&str>, rel_path: Option<&str>) -> Result<Value> {
        let p = self.load_project(slug)?; let f = p.feature(key)?;
        let src = match rel_path {
            Some(r) => { let s = safe_join(&p.dir, r)?; if !s.starts_with(feature_dir(&p, f)?) { return Err(err(400, "Outside feature")); } s }
            None => { let s = item_path(&p, f, id.unwrap_or(""))?; if def(f)["for_claude"] == "skills" { s.parent().unwrap().to_path_buf() } else { s } }
        };
        if !src.exists() { return Err(err(404, "Not found")); }
        let t = p.dir.join(TRASH).join(key); fs::create_dir_all(&t).map_err(|e| err(500, e.to_string()))?;
        fs::rename(&src, t.join(format!("{}-{}", now_ms(), src.file_name().unwrap().to_string_lossy()))).map_err(|e| err(500, e.to_string()))?;
        if def(f)["for_claude"] == "mcp" { self.write_mcp_json(&self.load_project(slug)?); }
        Ok(json!({ "ok": true }))
    }
    pub fn save_upload(&self, slug: &str, key: &str, folder: &str, filename: &str, bytes: &[u8], map_image: bool) -> Result<Value> {
        let p = self.load_project(slug)?; let f = p.feature(key)?;
        let base = feature_dir(&p, f)?;
        let mut d = if folder.is_empty() { base.clone() } else { safe_join(&base, folder)? };
        fs::create_dir_all(&d).map_err(|e| err(500, e.to_string()))?;
        let raw = Path::new(filename).file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "upload.bin".into());
        let mut clean: String = String::new(); let mut last_bad = false;
        for c in raw.chars() { if c.is_alphanumeric() || "_.- ()".contains(c) { clean.push(c); last_bad = false; } else if !last_bad { clean.push('_'); last_bad = true; } }
        if map_image {
            if !is_image(&clean) { return Err(err(400, "The map must be an image")); }
            for e in fs::read_dir(&base).map(|r| r.flatten().collect::<Vec<_>>()).unwrap_or_default() {
                let n = e.file_name().to_string_lossy().to_string();
                if n.to_lowercase().starts_with("_map.") { let _ = fs::rename(e.path(), base.join(format!(".old-{}-{n}", now_ms()))); }
            }
            let ext = Path::new(&clean).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            clean = format!("_map.{ext}"); d = base.clone();
        } else if stores(f) == "images" && !is_image(&clean) {
            return Err(err(400, format!("Only images can go into {}", def(f)["name"].as_str().unwrap_or(key))));
        }
        let (stem, ext) = match clean.rfind('.') { Some(i) if i > 0 => (clean[..i].to_string(), clean[i..].to_string()), _ => (clean.clone(), String::new()) };
        let mut name = clean.clone(); let mut n = 2;
        while !map_image && d.join(&name).exists() { name = format!("{stem}-{n}{ext}"); n += 1; }
        fs::write(d.join(&name), bytes).map_err(|e| err(500, e.to_string()))?;
        Ok(json!({ "ok": true, "name": name }))
    }
    /// A file of a project (for /files/<project>/<path>).
    pub fn file_path(&self, slug: &str, rel: &str) -> Result<PathBuf> { safe_join(&self.load_project(slug)?.dir, rel) }

    /// .mcp.json in the project folder (read by Claude CLI). ${secret:x} becomes ${PW_SECRET_X}.
    pub fn write_mcp_json(&self, p: &Project) {
        let feats: Vec<&ProjectFeature> = p.features.iter().filter(|f| f.def.as_ref().map(|d| d["for_claude"] == "mcp").unwrap_or(false)).collect();
        if feats.is_empty() { return; }
        let mut servers = Map::new();
        for f in feats {
            for it in list_records(p, f) {
                let r = &it["data"];
                let name = w::slugify(&r.get("name").map(str_of).filter(|s| !s.is_empty()).unwrap_or_else(|| str_of(&it["id"])));
                let transport = r.get("transport").or(r.get("type")).map(str_of).filter(|s| !s.is_empty())
                    .or_else(|| if r.get("url").map(|v| !v.is_null()).unwrap_or(false) { Some("http".into()) } else if r.get("command").map(|v| !v.is_null()).unwrap_or(false) { Some("stdio".into()) } else { None });
                let mut s = Map::new();
                match transport.as_deref() {
                    Some("stdio") if r.get("command").map(|v| !v.is_null()).unwrap_or(false) => {
                        let args: Vec<Value> = match r.get("args") { Some(Value::Array(a)) => a.iter().map(|x| json!(str_of(x))).collect(), Some(v) if !v.is_null() => str_of(v).split_whitespace().map(|x| json!(x)).collect(), _ => vec![] };
                        s.insert("type".into(), json!("stdio")); s.insert("command".into(), json!(str_of(&r["command"]))); s.insert("args".into(), json!(args));
                    }
                    Some(t @ ("http" | "sse")) if r.get("url").map(|v| !v.is_null()).unwrap_or(false) => {
                        s.insert("type".into(), json!(t)); s.insert("url".into(), json!(str_of(&r["url"])));
                        if let Some(h) = r.get("headers").filter(|h| h.is_object()) { s.insert("headers".into(), h.clone()); }
                    }
                    _ => continue,
                }
                if let Some(e) = r.get("env").and_then(|e| e.as_object()).filter(|e| !e.is_empty()) { s.insert("env".into(), Value::Object(e.clone())); }
                servers.insert(name, Value::Object(s));
            }
        }
        let json = serde_json::to_string_pretty(&json!({ "mcpServers": crate::secrets::to_env_refs(&Value::Object(servers)) })).unwrap() + "\n";
        let file = p.dir.join(".mcp.json");
        if fs::read_to_string(&file).ok().as_deref() != Some(json.as_str()) { let _ = fs::write(file, json); }
    }
}
