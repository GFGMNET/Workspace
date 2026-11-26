//! ComfyUI tab (plan docs/plans/COMFYUI.md): the project's workflows (`<folder>/workflows/*.json`, saved in ComfyUI with
//! "Export (API)"), the text boxes the app finds in them (one field each, positive / negative), Run → ComfyUI at `url:`,
//! "Running…" / Cancel, and the results (pictures, video, audio). Each result is kept once: in the Gallery's album KI_Pictures
//! when the project has a Gallery, otherwise in `<folder>/results/`. Claude is not used.
use crate::github::http;
use pw_core::items::{is_image, media_kind};
use pw_core::workspace::{err, safe_join, HttpError, Project, Workspace};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

type R<T> = Result<T, HttpError>;
pub const ALBUM: &str = "KI_Pictures";

fn feature_folder(p: &Project, key: &str) -> R<PathBuf> {
    let f = p.feature(key)?;
    let d = f.def.as_ref().unwrap();
    if d["stores"] != "comfyui" { return Err(err(400, "Not a ComfyUI feature")); }
    safe_join(&p.dir, d["folder"].as_str().unwrap_or(key))
}
fn url_of(p: &Project, key: &str) -> R<String> {
    let d = p.feature(key)?.def.clone().unwrap_or(json!({}));
    let u = d["url"].as_str().unwrap_or("").trim().trim_end_matches('/').to_string();
    if u.is_empty() { return Err(err(400, "Set the address of ComfyUI in project.yaml, e.g.  comfyui: { url: http://127.0.0.1:8188 }")); }
    if !(u.starts_with("http://") || u.starts_with("https://")) { return Err(err(400, "url: must start with http:// or https://")); }
    Ok(u)
}
/// Where the results are kept: the Gallery's album KI_Pictures, or <folder>/results/. Also moves earlier results into
/// KI_Pictures once when a Gallery was added later (decision 14).
pub fn results_dir(p: &Project, key: &str) -> R<(PathBuf, String)> {
    let own = feature_folder(p, key)?.join("results");
    let gallery = p.features.iter().find(|f| f.def.as_ref().map(|d| d["stores"] == "images").unwrap_or(false));
    match gallery {
        Some(g) => {
            let gdir = safe_join(&p.dir, g.def.as_ref().unwrap()["folder"].as_str().unwrap_or(&g.key))?.join(ALBUM);
            let _ = std::fs::create_dir_all(&gdir);
            if own.is_dir() {
                for e in std::fs::read_dir(&own).map(|r| r.flatten().collect::<Vec<_>>()).unwrap_or_default() {
                    if e.path().is_file() { let _ = std::fs::rename(e.path(), unique(&gdir, &e.file_name().to_string_lossy())); }
                }
                let _ = std::fs::remove_dir(&own);
            }
            Ok((gdir, g.key.clone()))
        }
        None => { let _ = std::fs::create_dir_all(&own); Ok((own, key.to_string())) }
    }
}
fn unique(dir: &Path, name: &str) -> PathBuf {
    let (stem, ext) = match name.rfind('.') { Some(i) if i > 0 => (&name[..i], &name[i..]), _ => (name, "") };
    let mut p = dir.join(name); let mut n = 2;
    while p.exists() { p = dir.join(format!("{stem}-{n}{ext}")); n += 1; }
    p
}
fn enc(s: &str) -> String { s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect() }
fn rel(p: &Project, f: &Path) -> String { f.strip_prefix(&p.dir).map(|r| r.to_string_lossy().replace('\\', "/")).unwrap_or_default() }

// ---------- the text boxes of a workflow ----------
fn object_info_cache() -> &'static Mutex<HashMap<String, Value>> { static C: OnceLock<Mutex<HashMap<String, Value>>> = OnceLock::new(); C.get_or_init(Default::default) }
async fn object_info(url: &str) -> Option<Value> {
    if let Some(v) = object_info_cache().lock().unwrap().get(url).cloned() { return Some(v); }
    let v: Value = http().get(format!("{url}/object_info")).timeout(Duration::from_secs(20)).send().await.ok()?.json().await.ok()?;
    object_info_cache().lock().unwrap().insert(url.to_string(), v.clone());
    Some(v)
}
fn is_text_input(info: Option<&Value>, cls: &str, k: &str) -> bool {
    if let Some(i) = info.and_then(|i| i.get(cls)) {
        let sp = i["input"]["required"].get(k).or_else(|| i["input"]["optional"].get(k));
        return sp.map(|s| s[0] == "STRING" && s[1]["multiline"] == true).unwrap_or(false);
    }
    // ComfyUI not reachable: the usual names of prompt boxes
    ["text", "prompt", "value", "clip_l", "t5xxl", "text_g", "text_l", "positive_prompt", "negative_prompt"].contains(&k)
}
/// One field per text box: node, input, title (box title, + input name if one box has two), role positive / negative / prompt.
pub fn find_fields(wf: &Map<String, Value>, info: Option<&Value>) -> Vec<Value> {
    let mut out = vec![];
    let mut ids: Vec<&String> = wf.keys().collect();
    ids.sort_by(|a, b| a.parse::<i64>().unwrap_or(i64::MAX).cmp(&b.parse::<i64>().unwrap_or(i64::MAX)).then(a.cmp(b)));
    for id in ids {
        let n = &wf[id];
        let cls = n["class_type"].as_str().unwrap_or("");
        let texts: Vec<(&String, &str)> = n["inputs"].as_object().map(|o| o.iter().filter_map(|(k, v)| v.as_str().filter(|_| is_text_input(info, cls, k)).map(|s| (k, s))).collect()).unwrap_or_default();
        for (k, v) in &texts {
            // follow the links forward until an input called positive or negative
            let mut role = "prompt"; let mut seen = vec![id.clone()]; let mut front = vec![id.clone()];
            'search: while !front.is_empty() {
                let mut next = vec![];
                for (id2, n2) in wf {
                    for (k2, v2) in n2["inputs"].as_object().into_iter().flatten() {
                        let from = v2.as_array().and_then(|a| a.first()).map(|x| x.as_str().map(|s| s.to_string()).unwrap_or_else(|| x.to_string()));
                        if let Some(from) = from { if front.contains(&from) {
                            if k2 == "positive" || k2 == "negative" { role = if k2 == "positive" { "positive" } else { "negative" }; break 'search; }
                            if !seen.contains(id2) { seen.push(id2.clone()); next.push(id2.clone()); }
                        } }
                    }
                }
                front = next;
            }
            let title = n["_meta"]["title"].as_str().unwrap_or(cls).to_string();
            let title = if texts.len() > 1 { format!("{title} · {k}") } else { title };
            out.push(json!({ "id": format!("{id}:{k}"), "node": id, "input": k, "title": title, "role": role, "text": v }));
        }
    }
    out
}
fn guess_label(wf: &Map<String, Value>) -> &'static str {
    let classes: Vec<String> = wf.values().filter_map(|n| n["class_type"].as_str().map(|s| s.to_lowercase())).collect();
    if classes.iter().any(|c| c.contains("video") || c.contains("webm") || c.contains("animated")) { "video" }
    else if classes.iter().any(|c| c.contains("saveaudio") || c.contains("audio")) { "audio" } else { "picture" }
}
fn parse_api(text: &str) -> R<Map<String, Value>> {
    let v: Value = serde_json::from_str(text).map_err(|_| err(400, "This is not a workflow file (JSON)."))?;
    let o = v.as_object().cloned().unwrap_or_default();
    if o.is_empty() || o.contains_key("nodes") || !o.values().all(|n| n["class_type"].is_string()) {
        return Err(err(400, "This workflow is not in API format. Save it in ComfyUI with Workflow → Export (API)."));
    }
    Ok(o)
}
fn labels_file(dir: &Path) -> PathBuf { dir.join("workflows").join("labels.json") }
fn labels(dir: &Path) -> Map<String, Value> { std::fs::read_to_string(labels_file(dir)).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).and_then(|v| v.as_object().cloned()).unwrap_or_default() }

/// GET …/comfyui/workflows
pub async fn workflows(ws: &Workspace, slug: &str, key: &str) -> R<Value> {
    let p = ws.load_project(slug)?; let dir = feature_folder(&p, key)?;
    let url = url_of(&p, key).ok();
    let info = match &url { Some(u) => object_info(u).await, None => None };
    let wdir = dir.join("workflows"); let _ = std::fs::create_dir_all(&wdir);
    let lab = labels(&dir);
    let mut out = vec![];
    let mut names: Vec<String> = std::fs::read_dir(&wdir).map(|r| r.flatten().map(|e| e.file_name().to_string_lossy().to_string()).filter(|n| n.ends_with(".json") && n != "labels.json").collect()).unwrap_or_default();
    names.sort();
    for n in names {
        let text = std::fs::read_to_string(wdir.join(&n)).unwrap_or_default();
        match parse_api(&text) {
            Ok(wf) => out.push(json!({ "name": n, "label": lab.get(&n).and_then(|v| v.as_str()).unwrap_or(guess_label(&wf)), "fields": find_fields(&wf, info.as_ref()) })),
            Err(e) => out.push(json!({ "name": n, "label": "picture", "fields": [], "error": e.message })),
        }
    }
    Ok(json!({ "url": url, "reachable": info.is_some(), "workflows": out }))
}
/// POST …/comfyui/workflows?filename= (the file itself as the body)
pub fn upload(ws: &Workspace, slug: &str, key: &str, filename: &str, body: &[u8]) -> R<Value> {
    let p = ws.load_project(slug)?; let dir = feature_folder(&p, key)?;
    let text = String::from_utf8_lossy(body).to_string();
    let wf = parse_api(&text)?;
    let mut name: String = Path::new(filename).file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "workflow.json".into())
        .chars().map(|c| if c.is_alphanumeric() || "_.- ()".contains(c) { c } else { '_' }).collect();
    if !name.to_lowercase().ends_with(".json") { name.push_str(".json"); }
    if name == "labels.json" { name = "labels-workflow.json".into(); }
    let wdir = dir.join("workflows"); std::fs::create_dir_all(&wdir).map_err(|e| err(500, e.to_string()))?;
    let target = unique(&wdir, &name);
    std::fs::write(&target, text).map_err(|e| err(500, e.to_string()))?;
    let n = target.file_name().unwrap().to_string_lossy().to_string();
    let mut lab = labels(&dir); lab.insert(n.clone(), json!(guess_label(&wf)));
    let _ = std::fs::write(labels_file(&dir), serde_json::to_string_pretty(&Value::Object(lab)).unwrap());
    Ok(json!({ "ok": true, "name": n }))
}
/// PUT …/comfyui/workflows/<name>/label { label: picture | video | audio }
pub fn set_label(ws: &Workspace, slug: &str, key: &str, name: &str, label: &str) -> R<Value> {
    let p = ws.load_project(slug)?; let dir = feature_folder(&p, key)?;
    if !["picture", "video", "audio"].contains(&label) { return Err(err(400, "label must be picture, video or audio")); }
    if !safe_join(&dir.join("workflows"), name)?.is_file() { return Err(err(404, "Workflow not found")); }
    let mut lab = labels(&dir); lab.insert(name.to_string(), json!(label));
    std::fs::write(labels_file(&dir), serde_json::to_string_pretty(&Value::Object(lab)).unwrap()).map_err(|e| err(500, e.to_string()))?;
    Ok(json!({ "ok": true }))
}

// ---------- run ----------
fn saved_runs() -> &'static Mutex<HashMap<String, Value>> { static C: OnceLock<Mutex<HashMap<String, Value>>> = OnceLock::new(); C.get_or_init(Default::default) }
fn comfy_error(v: &Value) -> String {
    let mut parts = vec![];
    if let Some(m) = v["error"]["message"].as_str() { parts.push(m.to_string()); }
    if let Some(d) = v["error"]["details"].as_str().filter(|d| !d.is_empty()) { parts.push(d.to_string()); }
    for (id, ne) in v["node_errors"].as_object().into_iter().flatten() {
        for e in ne["errors"].as_array().into_iter().flatten() { parts.push(format!("box {id} ({}): {} {}", ne["class_type"].as_str().unwrap_or(""), e["message"].as_str().unwrap_or(""), e["details"].as_str().unwrap_or(""))); }
    }
    if parts.is_empty() { v.to_string().chars().take(400).collect() } else { parts.join(" · ") }
}
/// POST …/comfyui/run { workflow, fields: { "<node>:<input>": text } } → { id }
pub async fn run(ws: &Workspace, slug: &str, key: &str, body: &Value) -> R<Value> {
    let p = ws.load_project(slug)?; let dir = feature_folder(&p, key)?; let url = url_of(&p, key)?;
    let name = body["workflow"].as_str().unwrap_or("");
    let file = safe_join(&dir.join("workflows"), name)?;
    let mut wf = parse_api(&std::fs::read_to_string(&file).map_err(|_| err(404, "Workflow not found"))?)?;
    for (id, text) in body["fields"].as_object().into_iter().flatten() {
        let Some((node, input)) = id.split_once(':') else { continue };
        if let Some(n) = wf.get_mut(node) { if n["inputs"].get(input).map(|v| v.is_string()).unwrap_or(false) { n["inputs"][input] = json!(text.as_str().unwrap_or("")); } }
    }
    let r = http().post(format!("{url}/prompt")).json(&json!({ "prompt": wf, "client_id": "workspace" })).timeout(Duration::from_secs(30)).send().await
        .map_err(|e| err(502, format!("ComfyUI can't be reached at {url}. Start ComfyUI and check url: in project.yaml. ({e})")))?;
    let code = r.status().as_u16();
    let v: Value = r.json().await.unwrap_or(json!({}));
    if code != 200 { return Err(err(400, format!("ComfyUI refused the workflow: {}", comfy_error(&v)))); }
    let id = v["prompt_id"].as_str().ok_or_else(|| err(502, "ComfyUI gave no run id"))?.to_string();
    Ok(json!({ "id": id }))
}
/// GET …/comfyui/run/<id>: running / waiting, or done with the saved results (fetched and saved once)
pub async fn status(ws: &Workspace, slug: &str, key: &str, id: &str) -> R<Value> {
    if let Some(v) = saved_runs().lock().unwrap().get(id).cloned() { return Ok(v); }
    let p = ws.load_project(slug)?; let url = url_of(&p, key)?;
    let h: Value = http().get(format!("{url}/history/{id}")).timeout(Duration::from_secs(20)).send().await.map_err(|e| err(502, format!("ComfyUI can't be reached at {url}: {e}")))?.json().await.unwrap_or(json!({}));
    let e = &h[id];
    if e.is_null() || e["status"]["completed"].is_null() {
        let q: Value = match http().get(format!("{url}/queue")).timeout(Duration::from_secs(10)).send().await { Ok(r) => r.json().await.unwrap_or(json!({})), Err(_) => json!({}) };
        let has = |k: &str| q[k].as_array().map(|a| a.iter().any(|x| x[1] == id)).unwrap_or(false);
        let state = if has("queue_running") { "running" } else if has("queue_pending") { "waiting" } else { "running" };
        return Ok(json!({ "done": false, "state": state }));
    }
    if e["status"]["status_str"] == "error" {
        let msg: Vec<String> = e["status"]["messages"].as_array().into_iter().flatten().filter(|m| m[0] == "execution_error").map(|m| format!("{} ({})", m[1]["exception_message"].as_str().unwrap_or("error").trim(), m[1]["node_type"].as_str().unwrap_or(""))).collect();
        let v = json!({ "done": true, "error": format!("ComfyUI: {}", if msg.is_empty() { "the run failed".to_string() } else { msg.join(" · ") }) });
        saved_runs().lock().unwrap().insert(id.to_string(), v.clone());
        return Ok(v);
    }
    if e["status"]["completed"] != true { return Ok(json!({ "done": false, "state": "running" })); }
    let (rdir, _) = results_dir(&p, key)?;
    let mut files = vec![];
    for out in e["outputs"].as_object().into_iter().flatten().map(|(_, o)| o) {
        for arr in out.as_object().into_iter().flatten().filter_map(|(_, v)| v.as_array()) {
            for x in arr {
                let Some(fname) = x["filename"].as_str() else { continue };
                if x["type"] == "temp" { continue; }
                let r = http().get(format!("{url}/view?filename={}&subfolder={}&type={}", enc(fname), enc(x["subfolder"].as_str().unwrap_or("")), enc(x["type"].as_str().unwrap_or("output"))))
                    .timeout(Duration::from_secs(300)).send().await.map_err(|e| err(502, e.to_string()))?;
                let bytes = r.bytes().await.map_err(|e| err(502, e.to_string()))?;
                let base = Path::new(fname).file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "result".into());
                let target = unique(&rdir, &base);
                std::fs::write(&target, &bytes).map_err(|e| err(500, e.to_string()))?;
                files.push(rel(&p, &target));
            }
        }
    }
    let v = json!({ "done": true, "files": files });
    saved_runs().lock().unwrap().insert(id.to_string(), v.clone());
    Ok(v)
}
/// POST …/comfyui/run/<id>/cancel
pub async fn cancel(ws: &Workspace, slug: &str, key: &str, id: &str) -> R<Value> {
    let p = ws.load_project(slug)?; let url = url_of(&p, key)?;
    let _ = http().post(format!("{url}/queue")).json(&json!({ "delete": [id] })).timeout(Duration::from_secs(10)).send().await;
    let _ = http().post(format!("{url}/interrupt")).json(&json!({ "prompt_id": id })).timeout(Duration::from_secs(10)).send().await;
    saved_runs().lock().unwrap().insert(id.to_string(), json!({ "done": true, "cancelled": true, "files": [] }));
    Ok(json!({ "ok": true }))
}
/// GET …/comfyui/results: pictures, videos and sounds, newest first
pub fn results(ws: &Workspace, slug: &str, key: &str) -> R<Value> {
    let p = ws.load_project(slug)?; let (dir, from) = results_dir(&p, key)?;
    let mut list: Vec<(f64, Value)> = std::fs::read_dir(&dir).map(|r| r.flatten().filter(|e| e.path().is_file()).filter_map(|e| {
        let n = e.file_name().to_string_lossy().to_string();
        let kind = if is_image(&n) { "picture" } else { media_kind(&n).map(|m| if m == "video" { "video" } else { "audio" })? };
        let mt = e.metadata().ok().and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs_f64()).unwrap_or(0.0);
        Some((mt, json!({ "name": n, "path": rel(&p, &e.path()), "kind": kind })))
    }).collect()).unwrap_or_default();
    list.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    Ok(json!({ "in": if from == key { "comfyui/results".to_string() } else { format!("{from} → {ALBUM}") }, "results": list.into_iter().map(|x| x.1).collect::<Vec<_>>() }))
}
/// POST …/comfyui/results/delete { path } → the project's .trash
pub fn delete_result(ws: &Workspace, slug: &str, key: &str, path: &str) -> R<Value> {
    let p = ws.load_project(slug)?; let (dir, _) = results_dir(&p, key)?;
    let f = safe_join(&p.dir, path)?;
    if f.parent() != Some(dir.as_path()) || !f.is_file() { return Err(err(404, "Result not found")); }
    let trash = p.dir.join(".trash").join("comfyui"); std::fs::create_dir_all(&trash).map_err(|e| err(500, e.to_string()))?;
    std::fs::rename(&f, unique(&trash, &f.file_name().unwrap().to_string_lossy())).map_err(|e| err(500, e.to_string()))?;
    Ok(json!({ "ok": true }))
}
