//! Search, links between features (index, [[wiki links]], backlinks), project overview and what's due
//! (app/lib/workspace.js: search … dueAll).
use crate::files::natural_cmp;
use crate::items::{feature_dir, list_chats, list_diagrams, list_folder, list_records};
use crate::workspace::{self as w, safe_join, Project, ProjectFeature, Result, Workspace};
use regex::Regex;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

fn s(v: &Value) -> String { match v { Value::String(s) => s.clone(), Value::Null => String::new(), o => o.to_string() } }
fn def(f: &ProjectFeature) -> &Value { f.def.as_ref().unwrap() }
fn md_items(p: &Project, f: &ProjectFeature) -> Vec<Value> { feature_dir(p, f).map(|d| w::list_markdown(p, def(f), &d)).unwrap_or_default() }
fn lc(a: &str, b: &str) -> std::cmp::Ordering { natural_cmp(a, b) }

/// Local date as YYYY-MM-DD, `days` from today.
pub fn local_day(days: i64) -> String { (chrono::Local::now().date_naive() + chrono::Duration::days(days)).format("%Y-%m-%d").to_string() }

fn snippet(text: &str, at_byte: usize) -> String {
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let at = chars.iter().position(|(i, _)| *i >= at_byte).unwrap_or(0);
    let from = at.saturating_sub(60); let to = (at + 110).min(chars.len());
    let raw: String = chars[from..to].iter().map(|(_, c)| *c).collect();
    raw.split_whitespace().collect::<Vec<_>>().join(" ")
}
fn find_lower(text: &str, q: &str) -> Option<usize> { text.to_lowercase().find(q).map(|i| i.min(text.len())) }

impl Workspace {
    pub fn search(&self, query: &str, only: Option<&str>) -> Vec<Value> {
        let q = query.to_lowercase(); let q = q.trim();
        if q.chars().count() < 2 { return vec![]; }
        let slugs: Vec<String> = match only { Some(x) => vec![x.to_string()], None => self.list_projects().iter().filter_map(|x| x["slug"].as_str().map(|s| s.to_string())).collect() };
        let mut hits = vec![];
        for slug in slugs {
            let Ok(p) = self.load_project(&slug) else { continue };
            if p.name.to_lowercase().contains(q) {
                hits.push(json!({ "project": slug, "projectName": p.name, "title": p.name, "snippet": p.meta.get("description").map(s).unwrap_or_default(), "kind": "project" }));
            }
            for f in p.features.iter().filter(|f| !f.missing) {
                let d = def(f); let st = d["stores"].as_str().unwrap_or("");
                let base = |id: &Value, title: &Value, snip: String| json!({ "project": slug, "projectName": p.name, "feature": f.key, "featureName": d["name"], "id": id, "title": title, "snippet": snip });
                match st {
                    "markdown" | "diagram" => {
                        let list = if st == "markdown" { md_items(&p, f) } else { list_diagrams(&p, f) };
                        for it in list {
                            let text = safe_join(&p.dir, it["file"].as_str().unwrap_or("")).ok().and_then(|f| fs::read_to_string(f).ok()).unwrap_or_default();
                            let at = find_lower(&text, q);
                            if at.is_some() || s(&it["title"]).to_lowercase().contains(q) {
                                hits.push(base(&it["id"], &it["title"], at.map(|a| snippet(&text, a)).unwrap_or_default()));
                            }
                        }
                    }
                    "records" => for it in list_records(&p, f) {
                        let text = it["data"].as_object().map(|o| o.iter().map(|(k, v)| format!("{k}: {}", if v.is_object() || v.is_array() { v.to_string() } else { s(v) })).collect::<Vec<_>>().join(" · ")).unwrap_or_default();
                        if let Some(a) = find_lower(&text, q) { hits.push(base(&it["id"], &it["title"], snippet(&text, a))); }
                    },
                    "images" | "files" => {
                        fn walk(d: &Path, rel: &str, q: &str, out: &mut Vec<(String, String, String)>) {
                            for e in fs::read_dir(d).map(|r| r.flatten().collect::<Vec<_>>()).unwrap_or_default() {
                                let n = e.file_name().to_string_lossy().to_string();
                                if n.starts_with('.') || n.starts_with('_') { continue; }
                                let r = if rel.is_empty() { n.clone() } else { format!("{rel}/{n}") };
                                if e.path().is_dir() { walk(&e.path(), &r, q, out); } else if n.to_lowercase().contains(q) { out.push((rel.to_string(), n, r)); }
                            }
                        }
                        let mut found = vec![];
                        if let Ok(dir) = feature_dir(&p, f) { walk(&dir, "", q, &mut found); }
                        for (id, name, r) in found { hits.push(base(&json!(id), &json!(name), r)); }
                    }
                    _ => {}
                }
            }
        }
        hits.truncate(200);
        hits
    }

    /// Every linkable item of a project: pages, records and diagrams.
    pub fn project_index(&self, p: &Project) -> Vec<Value> {
        let mut out = vec![];
        for f in p.features.iter().filter(|f| !f.missing) {
            let st = def(f)["stores"].as_str().unwrap_or("");
            let items = match st { "markdown" => md_items(p, f), "records" => list_records(p, f), "diagram" => list_diagrams(p, f), _ => vec![] };
            for it in items { out.push(json!({ "feature": f.key, "featureName": def(f)["name"], "stores": st, "id": it["id"], "title": it["title"] })); }
        }
        out
    }
    pub fn project_index_of(&self, slug: &str) -> Result<Vec<Value>> { let p = self.load_project(slug)?; Ok(self.project_index(&p)) }

    pub fn backlinks(&self, slug: &str, feature: &str, id: &str) -> Result<Vec<Value>> {
        let p = self.load_project(slug)?;
        let index = self.project_index(&p);
        if !index.iter().any(|x| x["feature"] == feature && x["id"] == id) { return Ok(vec![]); }
        let mut hits: Vec<(String, Value)> = vec![];
        let me = format!("{feature}/{id}");
        let mut add = |src: &Value, how: &Value| {
            let k = format!("{}/{}", s(&src["feature"]), s(&src["id"]));
            if k != me && !hits.iter().any(|(x, _)| *x == k) {
                hits.push((k, json!({ "feature": src["feature"], "featureName": src["featureName"], "id": src["id"], "title": src["title"], "how": how })));
            }
        };
        let is_target = |r: Option<&Value>| r.map(|r| r["feature"] == feature && r["id"] == id).unwrap_or(false);
        let scan = |text: &str, from: &str| wiki_re().captures_iter(text).any(|m| is_target(resolve_ref(&index, &m[1], from)));
        for f in p.features.iter().filter(|f| !f.missing) {
            let d = def(f);
            match d["stores"].as_str().unwrap_or("") {
                "markdown" => for it in md_items(&p, f) {
                    let text = safe_join(&p.dir, it["file"].as_str().unwrap_or("")).ok().and_then(|f| fs::read_to_string(f).ok()).unwrap_or_default();
                    let src = json!({ "feature": f.key, "featureName": d["name"], "id": it["id"], "title": it["title"] });
                    if scan(&text, &f.key) { add(&src, &json!("link")); }
                },
                "records" => {
                    let link_fields: Vec<&Value> = d["fields"].as_array().map(|a| a.iter().filter(|x| x["type"] == "link").collect()).unwrap_or_default();
                    for r in list_records(&p, f) {
                        let src = json!({ "feature": f.key, "featureName": d["name"], "id": r["id"], "title": r["title"] });
                        for lf in &link_fields {
                            let name = s(&lf["name"]);
                            let vals: Vec<String> = match &r["data"][&name] { Value::Array(a) => a.iter().map(s).collect(), Value::Null => vec![], v if s(v).is_empty() => vec![], v => vec![s(v)] };
                            let to = lf["to"].as_str().filter(|t| !t.is_empty());
                            for v in vals {
                                let rf = match to { Some(t) if !v.contains('/') => format!("{t}/{v}"), _ => v };
                                if is_target(resolve_ref(&index, &rf, to.unwrap_or(&f.key))) {
                                    add(&src, &json!(lf["label"].as_str().filter(|l| !l.is_empty()).unwrap_or(&name)));
                                }
                            }
                        }
                        if let Some(o) = r["data"].as_object() {
                            for v in o.values() { if let Some(t) = v.as_str() { if t.contains("[[") && scan(t, &f.key) { add(&src, &json!("link")); } } }
                        }
                    }
                }
                _ => {}
            }
        }
        let mut out: Vec<Value> = hits.into_iter().map(|(_, v)| v).collect();
        out.sort_by(|a, b| lc(&s(&a["featureName"]), &s(&b["featureName"])).then_with(|| lc(&s(&a["title"]), &s(&b["title"]))));
        Ok(out)
    }

    pub fn project_overview(&self, slug: &str, days: i64) -> Result<Value> {
        let p = self.load_project(slug)?;
        let (t0, t1) = (local_day(0), local_day(days));
        let (mut tiles, mut upcoming, mut open, mut recent) = (vec![], vec![], vec![], vec![]);
        for f in &p.features {
            let Some(d) = &f.def else { tiles.push(json!({ "key": f.key, "name": w::prettify(&f.key), "missing": true })); continue };
            tiles.push(json!({ "key": f.key, "name": d["name"], "layout": d["layout"], "icon": d["icon"], "stores": d["stores"], "count": w::count_items(&p, f) }));
            let item = |title: &Value, id: &Value, modified: Value| json!({ "title": title, "feature": f.key, "featureName": d["name"], "id": id, "modified": modified });
            match d["stores"].as_str().unwrap_or("") {
                "records" => {
                    let fields: Vec<Value> = d["fields"].as_array().cloned().unwrap_or_default();
                    let date_fields: Vec<String> = fields.iter().filter(|x| x["type"] == "date" || x["type"] == "datetime").map(|x| s(&x["name"])).collect();
                    let cols: Vec<Value> = d["columns"].as_array().cloned().unwrap_or_default();
                    let done_col = if d["layout"] == "kanban" { cols.last().cloned() } else { None };
                    let sf = s(&d["status_field"]);
                    for r in list_records(&p, f) {
                        let done = done_col.as_ref().map(|c| r["data"][&sf] == *c).unwrap_or(false);
                        for fld in &date_fields {
                            let v = &r["data"][fld]; if v.is_null() || s(v).is_empty() || v == false { continue; }
                            let day: String = s(v).chars().take(10).collect();
                            let overdue = d["layout"] == "kanban" && !done && day.as_str() < t0.as_str();
                            if (day >= t0 && day <= t1 && !done) || overdue {
                                let label = fields.iter().find(|x| s(&x["name"]) == *fld).and_then(|x| x["label"].as_str().filter(|l| !l.is_empty())).unwrap_or(fld.as_str());
                                upcoming.push(json!({ "date": day, "title": r["title"], "feature": f.key, "featureName": d["name"], "id": r["id"], "field": label, "overdue": overdue }));
                            }
                        }
                        if done_col.is_some() && !done {
                            let status = if r["data"][&sf].is_null() || r["data"][&sf] == "" { cols.first().cloned().unwrap_or(Value::Null) } else { r["data"][&sf].clone() };
                            let owner = if r["data"]["owner"].is_null() || r["data"]["owner"] == "" { Value::Null } else { r["data"]["owner"].clone() };
                            open.push(json!({ "title": r["title"], "feature": f.key, "featureName": d["name"], "id": r["id"], "status": status, "owner": owner }));
                        }
                        recent.push(item(&r["title"], &r["id"], r["modified"].clone()));
                    }
                }
                "markdown" => for it in md_items(&p, f) { recent.push(item(&it["title"], &it["id"], it["modified"].clone())); },
                "diagram" => for it in list_diagrams(&p, f) { recent.push(item(&it["title"], &it["id"], it["modified"].clone())); },
                "chat" => for it in list_chats(&p, f) {
                    let ms = chrono::DateTime::parse_from_rfc3339(&s(&it["updated"])).map(|t| t.timestamp_millis()).unwrap_or(0);
                    recent.push(item(&it["title"], &it["id"], json!(ms)));
                },
                "images" | "files" => if let Ok(l) = list_folder(&p, f, "", true) {
                    for x in l["files"].as_array().cloned().unwrap_or_default() { recent.push(item(&x["name"], &json!(s(&x["album"])), x["modified"].clone())); }
                },
                _ => {}
            }
        }
        upcoming.sort_by(|a, b| s(&a["date"]).cmp(&s(&b["date"])));
        open.sort_by(|a, b| lc(&s(&a["status"]), &s(&b["status"])));
        recent.sort_by(|a, b| b["modified"].as_f64().unwrap_or(0.0).partial_cmp(&a["modified"].as_f64().unwrap_or(0.0)).unwrap_or(std::cmp::Ordering::Equal));
        let open_total = open.len();
        upcoming.truncate(30); open.truncate(20); recent.truncate(12);
        Ok(json!({ "name": p.name, "meta": p.meta, "today": t0, "days": days, "tiles": tiles, "upcoming": upcoming, "open": open, "openTotal": open_total, "recent": recent }))
    }

    /// What's due in every project (home page, reminders): overdue tasks and the next days.
    pub fn due_all(&self, days: i64) -> Value {
        let mut items = vec![]; let mut today = Value::Null;
        for p in self.list_projects() {
            if !p["error"].is_null() { continue; }
            let Some(slug) = p["slug"].as_str() else { continue };
            if let Ok(o) = self.project_overview(slug, days) {
                today = o["today"].clone();
                for mut it in o["upcoming"].as_array().cloned().unwrap_or_default() {
                    it["project"] = json!(slug); it["projectName"] = p["name"].clone(); items.push(it);
                }
            }
        }
        items.sort_by(|a, b| (b["overdue"] == true).cmp(&(a["overdue"] == true)).then_with(|| s(&a["date"]).cmp(&s(&b["date"]))).then_with(|| lc(&s(&a["projectName"]), &s(&b["projectName"]))));
        let total = items.len(); items.truncate(100);
        json!({ "today": today, "days": days, "items": items, "total": total })
    }
}

fn wiki_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]").unwrap())
}
/// "[[Router]]", "[[devices/router]]" or a link-field value → index entry (same feature first).
pub fn resolve_ref<'a>(index: &'a [Value], r: &str, from: &str) -> Option<&'a Value> {
    let r = r.trim(); if r.is_empty() { return None; }
    if let Some(i) = r.find('/').filter(|i| *i > 0) {
        let (fk, rest) = (&r[..i], &r[i + 1..]);
        if let Some(h) = index.iter().find(|x| x["feature"] == fk && (x["id"] == rest || s(&x["title"]).to_lowercase() == rest.to_lowercase())) { return Some(h); }
    }
    let low = r.to_lowercase(); let slug = w::slugify(r);
    let order: Vec<&Value> = index.iter().filter(|x| x["feature"] == from).chain(index.iter().filter(|x| x["feature"] != from)).collect();
    order.iter().find(|x| x["id"] == r).or_else(|| order.iter().find(|x| s(&x["title"]).to_lowercase() == low)).or_else(|| order.iter().find(|x| x["id"] == slug.as_str())).copied()
}
