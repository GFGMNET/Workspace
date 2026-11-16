//! HTTP API on 127.0.0.1 (same routes and answers as app/server.js; checked by tests/contract).
//! Phase 1 prototype: info, features, projects, Markdown pages, static files, live-refresh stream;
//! the other routes answer with empty data so the screens work.
use axum::{
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Path, Query, Request, State},
    http::{header, HeaderValue, StatusCode},
    middleware::{self, Next},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post, put},
    Json, Router,
};
use pw_core::workspace::{self, HttpError, Workspace};
use serde_json::{json, Value};
use std::{collections::HashMap, convert::Infallible, path::PathBuf, sync::Arc, time::Duration};
type Q = Query<HashMap<String, String>>;
use tokio_stream::StreamExt;

pub mod chat;
pub mod github;
pub mod ide;
pub mod updater;
pub mod live;
pub mod mcp;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

struct ApiError(HttpError);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let code = StatusCode::from_u16(self.0.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        (code, Json(json!({ "error": self.0.message }))).into_response()
    }
}
impl From<HttpError> for ApiError {
    fn from(e: HttpError) -> Self { ApiError(e) }
}
type ApiResult = Result<Json<Value>, ApiError>;
type S = State<Arc<Workspace>>;

/// Where the program and the data live: PW_INSTALL (default: the program's folder), WORKSPACE_DIR (default: <install>/data).
pub fn workspace_from_env() -> Workspace {
    let install = std::env::var_os("PW_INSTALL").map(PathBuf::from).unwrap_or_else(|| {
        std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())).unwrap_or_else(|| PathBuf::from("."))
    });
    let root = std::env::var_os("WORKSPACE_DIR").map(PathBuf::from).unwrap_or_else(|| install.join("data"));
    Workspace { install, root }
}

pub fn router(ws: Workspace) -> Router {
    ws.ensure();
    let ws = Arc::new(ws);
    live::start(ws.clone());
    Router::new()
        .route("/api/info", get(info))
        .route("/api/claude", get(|| async { Json(chat::claude_version().await) }))
        .route("/api/projects/{p}/f/{f}/chat", post(chat_turn))
        .route("/api/chat-permission/{turn}", post(chat_permission))
        .route("/api/chat-permission/{turn}/{req}/answer", post(chat_answer))
        .route("/api/examples", post(examples))
        .route("/api/features", get(features))
        .route("/api/features/{k}", put(feature_save).delete(feature_delete))
        .route("/api/projects", get(projects).post(project_create))
        .route("/api/projects/{p}", get(project).patch(project_rename).delete(project_delete))
        .route("/api/projects/{p}/archive", post(project_archive))
        .route("/api/projects/{p}/template", post(template_save))
        .route("/api/projects/{p}/yaml", put(project_yaml))
        .route("/api/projects/{p}/features", post(project_add_feature))
        .route("/api/projects/{p}/features/{k}", axum::routing::delete(project_remove_feature))
        .route("/api/projects/{p}/overview", get(overview))
        .route("/api/projects/{p}/index", get(index))
        .route("/api/projects/{p}/backlinks", get(backlinks))
        .route("/api/projects/{p}/f/{f}/items", get(items).post(create_item))
        .route("/api/projects/{p}/f/{f}/items/{id}", get(item).put(write_item).delete(delete_item))
        .route("/api/projects/{p}/f/{f}/trash", post(trash))
        .route("/api/projects/{p}/f/{f}/upload", post(upload))
        .route("/files/{p}/{*rest}", get(project_file))
        .route("/api/search", get(search))
        .route("/api/due", get(due))
        .route("/api/fs/tree", get(fs_tree))
        .route("/api/fs/file", get(fs_file).put(fs_write))
        .route("/api/fs/raw", get(fs_raw))
        .route("/api/fs/mkdir", post(fs_mkdir))
        .route("/api/fs/rename", post(fs_rename))
        .route("/api/fs/trash", post(fs_trash))
        .route("/api/fs/upload", post(fs_upload))
        .route("/api/fs/vscode", post(fs_vscode))
        .route("/api/templates", get(templates))
        .route("/api/templates/{id}", axum::routing::delete(template_delete))
        .route("/api/archive", get(archive))
        .route("/api/archive/{p}", axum::routing::delete(archive_delete))
        .route("/api/archive/{p}/restore", post(archive_restore))
        .route("/api/secrets", get(secrets).delete(secrets_clear))
        .route("/api/secrets/{name}", put(secret_put).delete(secret_delete))
        .route("/api/update", get(update_status))
        .route("/api/update/check", post(update_check))
        .route("/api/update/skip", post(update_skip))
        .route("/api/update/later", post(update_later))
        .route("/api/update/apply", post(update_apply))
        .route("/api/ide", get(ide_status))
        .route("/api/ide/start", post(ide_start))
        .route("/api/ide/stop", post(|| async { Json(ide::stop()) }))
        .route("/api/projects/{p}/ide", get(project_ide))
        .route("/api/projects/{p}/f/{f}/github", get(github_issues))
        .route("/api/events", get(events))
        .fallback(static_files)
        .layer(DefaultBodyLimit::max(200 * 1024 * 1024))
        .layer(middleware::from_fn_with_state(ws.clone(), guard))
        .with_state(ws)
}

/// Same checks as app/server.js: only localhost (DNS rebinding), changes only from the app itself (CSRF).
fn local_origin(o: &str) -> bool {
    let rest = o.strip_prefix("http://").or_else(|| o.strip_prefix("https://")).unwrap_or("-");
    ["localhost", "127.0.0.1", "[::1]"].iter().any(|h| rest == *h || (rest.starts_with(h) && rest[h.len()..].starts_with(':') && rest.len() > h.len() + 1 && rest[h.len() + 1..].chars().all(|c| c.is_ascii_digit())))
}
/// Same checks as app/server.js: only localhost (DNS rebinding), changes and WebSockets only from the app
/// itself (CSRF); then VS Code under /ide, and a frame that left /ide is sent back there.
async fn guard(State(ws): S, req: Request, next: Next) -> Response {
    let host = req.headers().get(header::HOST).and_then(|h| h.to_str().ok()).unwrap_or("");
    let host_name = if host.starts_with('[') { host.split(']').next().map(|h| format!("{h}]")).unwrap_or_default() } else { host.split(':').next().unwrap_or("").to_string() };
    if !["127.0.0.1", "localhost", "[::1]"].contains(&host_name.as_str()) {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Forbidden host" }))).into_response();
    }
    let upgrade = req.headers().contains_key(header::UPGRADE);
    if req.method() != axum::http::Method::GET || upgrade {
        if let Some(o) = req.headers().get(header::ORIGIN).and_then(|h| h.to_str().ok()) {
            if !local_origin(o) { return (StatusCode::FORBIDDEN, Json(json!({ "error": "Forbidden origin" }))).into_response(); }
        }
    }
    let path = req.uri().path().to_string();
    let base = ide::settings(&ws).base;
    if ide::is_ide_path(&base, &path) { return ide::proxy(&ws, req).await; }
    if req.method() == axum::http::Method::GET && req.headers().get("sec-fetch-dest").map(|v| v == "iframe").unwrap_or(false) && !path.starts_with("/api/") {
        let q = req.uri().query().map(|q| format!("?{q}")).unwrap_or_default();
        let loc = format!("{base}{}{q}", if path == "/" { "/" } else { &path });
        let mut r = Response::new(Body::empty());
        *r.status_mut() = StatusCode::FOUND;
        if let Ok(v) = HeaderValue::from_str(&loc) { r.headers_mut().insert(header::LOCATION, v); }
        r.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        return r;
    }
    next.run(req).await
}

async fn update_status(State(ws): S) -> Json<Value> { Json(updater::check(&ws, false).await) }
async fn update_check(State(ws): S) -> Json<Value> { Json(updater::check(&ws, true).await) }
async fn update_skip(State(ws): S, b: Bytes) -> ApiResult { let body = body_json(&b)?; Ok(Json(updater::skip(&ws, &body["version"].as_str().map(|s| s.to_string()).unwrap_or_else(|| body["version"].to_string())))) }
async fn update_later(State(ws): S) -> Json<Value> { Json(updater::later(&ws)) }
async fn update_apply(State(ws): S) -> ApiResult {
    let mut r = updater::apply(&ws).await?;
    let swap = r["swap"].as_str().map(PathBuf::from);
    r["restarting"] = json!(true);
    let ws2 = ws.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(600)).await;
        let _ = ide::stop();
        if let Some(s) = swap { updater::run_swap(&ws2, &s); }
        std::process::exit(0);
    });
    Ok(Json(r))
}
async fn ide_status(State(ws): S) -> Json<Value> { Json(ide::status(&ws).await) }
async fn ide_start(State(ws): S) -> Json<Value> { Json(ide::start(&ws).await) }
async fn project_ide(State(ws): S, Path(p): Path<String>) -> ApiResult {
    let pr = ws.load_project(&p)?;
    let mut st = ide::status(&ws).await;
    st["folder"] = json!(ide::folder_param(&pr.dir));
    Ok(Json(st))
}
async fn github_issues(State(ws): S, Path((p, f)): Path<(String, String)>, Query(q): Q) -> ApiResult {
    let pr = ws.load_project(&p)?;
    let feat = pr.feature(&f)?;
    let d = feat.def.clone().unwrap_or(json!({}));
    let state = Some(qs(&q, "state")).filter(|s| !s.is_empty()).map(|s| s.to_string()).or_else(|| d["state"].as_str().map(|s| s.to_string())).unwrap_or_else(|| "open".into());
    Ok(Json(github::issues(&ws, d["repo"].as_str().unwrap_or(""), &state, qs(&q, "refresh") == "1").await?))
}

async fn info(State(ws): S) -> Json<Value> {
    let exe = std::env::var("PW_EXE").ok().or_else(|| std::env::current_exe().ok().map(|p| p.to_string_lossy().to_string()));
    Json(json!({
        "version": VERSION, "root": ws.root.to_string_lossy(), "examples": ws.list_examples().len(),
        "projectsDir": ws.projects_dir().to_string_lossy(), "featuresDir": ws.features_dir().to_string_lossy(),
        "stores": workspace::STORES, "layouts": workspace::layouts(), "fieldTypes": workspace::FIELD_TYPES,
        "platform": if cfg!(windows) { "win32" } else if cfg!(target_os = "macos") { "darwin" } else { "linux" },
        "mcpScript": null, "exe": exe.clone(),
        "wiki": "https://github.com/GFGMNET/Workspace/wiki", "mcpCommand": format!("\"{}\" mcp", exe.clone().unwrap_or_default()), "mcpEnv": null, "desktop": std::env::var_os("PW_EXE").is_some()
    }))
}
async fn examples(State(ws): S) -> Json<Value> { Json(json!({ "added": ws.add_examples() })) }
async fn features(State(ws): S) -> Json<Value> {
    let projects = ws.list_projects();
    let list: Vec<Value> = ws.list_features().into_iter().map(|mut f| {
        let key = f["key"].clone();
        f["usedBy"] = json!(projects.iter().filter(|p| p["features"].as_array().map(|a| a.iter().any(|x| x["feature"] == key)).unwrap_or(false))
            .map(|p| json!({ "slug": p["slug"], "name": p["name"] })).collect::<Vec<_>>());
        f
    }).collect();
    Json(json!(list))
}
async fn projects(State(ws): S) -> Json<Value> { Json(json!(ws.list_projects())) }
async fn project(State(ws): S, Path(p): Path<String>) -> ApiResult { Ok(Json(ws.load_project(&p)?.view())) }
async fn feature_save(State(ws): S, Path(k): Path<String>, b: Bytes) -> ApiResult { let body = body_json(&b)?; Ok(Json(ws.save_feature(&k, body["yaml"].as_str().unwrap_or(""))?)) }
async fn feature_delete(State(ws): S, Path(k): Path<String>) -> ApiResult { Ok(Json(ws.delete_feature(&k)?)) }
async fn project_create(State(ws): S, b: Bytes) -> ApiResult { Ok(Json(ws.create_project(&body_json(&b)?)?.view())) }
async fn project_rename(State(ws): S, Path(p): Path<String>, b: Bytes) -> ApiResult { Ok(Json(ws.rename_project(&p, &body_json(&b)?)?.view())) }
async fn project_delete(State(ws): S, Path(p): Path<String>) -> ApiResult { Ok(Json(ws.delete_project(&p, false)?)) }
async fn project_archive(State(ws): S, Path(p): Path<String>) -> ApiResult { Ok(Json(ws.archive_project(&p)?)) }
async fn template_save(State(ws): S, Path(p): Path<String>, b: Bytes) -> ApiResult { Ok(Json(ws.save_template(&p, &body_json(&b)?)?)) }
async fn project_yaml(State(ws): S, Path(p): Path<String>, b: Bytes) -> ApiResult { let body = body_json(&b)?; Ok(Json(ws.save_project_yaml(&p, body["yaml"].as_str().unwrap_or(""))?.view())) }
async fn project_add_feature(State(ws): S, Path(p): Path<String>, b: Bytes) -> ApiResult {
    let body = body_json(&b)?;
    Ok(Json(ws.add_feature_to_project(&p, body["key"].as_str().unwrap_or(""), body.get("settings"))?.view()))
}
async fn project_remove_feature(State(ws): S, Path((p, k)): Path<(String, String)>) -> ApiResult { Ok(Json(ws.remove_feature_from_project(&p, &k)?.view())) }
async fn templates(State(ws): S) -> Json<Value> { Json(json!(ws.list_templates())) }
async fn template_delete(State(ws): S, Path(id): Path<String>) -> ApiResult { Ok(Json(ws.delete_template(&id)?)) }
async fn archive(State(ws): S) -> Json<Value> { Json(json!(ws.list_archived())) }
async fn archive_delete(State(ws): S, Path(p): Path<String>) -> ApiResult { Ok(Json(ws.delete_project(&p, true)?)) }
async fn archive_restore(State(ws): S, Path(p): Path<String>) -> ApiResult { Ok(Json(ws.restore_project(&p)?.view())) }
async fn overview(State(ws): S, Path(p): Path<String>) -> ApiResult { Ok(Json(ws.project_overview(&p, 30)?)) }
async fn index(State(ws): S, Path(p): Path<String>) -> ApiResult { Ok(Json(json!(ws.project_index_of(&p)?))) }
async fn backlinks(State(ws): S, Path(p): Path<String>, Query(q): Q) -> ApiResult {
    Ok(Json(json!(ws.backlinks(&p, qs(&q, "feature"), qs(&q, "id"))?)))
}
async fn search(State(ws): S, Query(q): Q) -> Json<Value> {
    Json(json!(ws.search(qs(&q, "q"), Some(qs(&q, "project")).filter(|x| !x.is_empty()))))
}
async fn due(State(ws): S, Query(q): Q) -> Json<Value> {
    let days = qs(&q, "days").parse::<i64>().ok().filter(|d| *d != 0).unwrap_or(14).clamp(1, 90);
    Json(ws.due_all(days))
}
fn qs<'a>(q: &'a HashMap<String, String>, k: &str) -> &'a str { q.get(k).map(|s| s.as_str()).unwrap_or("") }
// ---------- file explorer ----------
async fn fs_tree(State(ws): S, Query(q): Q) -> ApiResult { Ok(Json(ws.fs_tree(qs(&q, "scope"), qs(&q, "path"))?)) }
async fn fs_file(State(ws): S, Query(q): Q) -> ApiResult { Ok(Json(ws.fs_read(qs(&q, "scope"), qs(&q, "path"))?)) }
async fn fs_write(State(ws): S, Query(q): Q, b: Bytes) -> ApiResult {
    let body = body_json(&b)?;
    Ok(Json(ws.fs_write(qs(&q, "scope"), qs(&q, "path"), body["content"].as_str().unwrap_or(""), qs(&q, "create") == "1")?))
}
async fn fs_mkdir(State(ws): S, Query(q): Q) -> ApiResult { Ok(Json(ws.fs_mkdir(qs(&q, "scope"), qs(&q, "path"))?)) }
async fn fs_rename(State(ws): S, Query(q): Q, b: Bytes) -> ApiResult {
    let body = body_json(&b)?;
    Ok(Json(ws.fs_rename(qs(&q, "scope"), body["from"].as_str().unwrap_or(""), body["to"].as_str().unwrap_or(""))?))
}
async fn fs_trash(State(ws): S, Query(q): Q) -> ApiResult { Ok(Json(ws.fs_trash(qs(&q, "scope"), qs(&q, "path"))?)) }
async fn fs_upload(State(ws): S, Query(q): Q, b: Bytes) -> ApiResult {
    let name = Some(qs(&q, "filename")).filter(|x| !x.is_empty()).unwrap_or("upload.bin");
    Ok(Json(ws.fs_upload(qs(&q, "scope"), qs(&q, "path"), name, &b)?))
}
async fn fs_vscode(State(ws): S, Query(q): Q) -> ApiResult { Ok(Json(ws.fs_open_vscode(qs(&q, "scope"), qs(&q, "path"))?)) }
async fn fs_raw(State(ws): S, Query(q): Q) -> Response {
    let f = match ws.fs_abs(qs(&q, "scope"), qs(&q, "path")) { Ok(f) => f, Err(e) => return ApiError(e).into_response() };
    if !f.is_file() { return ApiError(workspace::err(404, "Not a file")).into_response(); }
    match tokio::fs::read(&f).await {
        Ok(bytes) => {
            let mut res = Response::new(Body::from(bytes));
            res.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static(mime(&f.to_string_lossy())));
            res.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
            if !qs(&q, "download").is_empty() {
                let name = f.file_name().map(|n| n.to_string_lossy().replace(['"', '\r', '\n'], "")).unwrap_or_default();
                if let Ok(v) = HeaderValue::from_str(&format!("attachment; filename=\"{name}\"")) { res.headers_mut().insert(header::CONTENT_DISPOSITION, v); }
            }
            res
        }
        Err(_) => ApiError(workspace::err(404, "Not found")).into_response(),
    }
}
async fn items(State(ws): S, Path((p, f)): Path<(String, String)>, Query(q): Q) -> ApiResult {
    Ok(Json(ws.list_items(&p, &f, q.get("folder").map(|s| s.as_str()).unwrap_or(""), q.get("all").map(|s| s == "1").unwrap_or(false))?))
}
fn body_json(b: &Bytes) -> Result<Value, ApiError> {
    if b.is_empty() { return Ok(json!({})); }
    serde_json::from_slice(b).map_err(|_| ApiError(workspace::err(400, "Bad JSON")))
}
async fn create_item(State(ws): S, Path((p, f)): Path<(String, String)>, b: Bytes) -> ApiResult { Ok(Json(ws.create_item(&p, &f, &body_json(&b)?)?)) }
async fn item(State(ws): S, Path((p, f, id)): Path<(String, String, String)>) -> ApiResult { Ok(Json(ws.read_item(&p, &f, &id)?)) }
async fn write_item(State(ws): S, Path((p, f, id)): Path<(String, String, String)>, b: Bytes) -> ApiResult {
    let body = body_json(&b)?;
    let data = body.get("data").filter(|d| !d.is_null());
    Ok(Json(ws.write_item(&p, &f, &id, body["content"].as_str(), data)?))
}
async fn delete_item(State(ws): S, Path((p, f, id)): Path<(String, String, String)>) -> ApiResult { Ok(Json(ws.trash_item(&p, &f, Some(&id), None)?)) }
async fn trash(State(ws): S, Path((p, f)): Path<(String, String)>, b: Bytes) -> ApiResult {
    let body = body_json(&b)?;
    Ok(Json(ws.trash_item(&p, &f, None, Some(body["path"].as_str().unwrap_or("")))?))
}
async fn upload(State(ws): S, Path((p, f)): Path<(String, String)>, Query(q): Q, b: Bytes) -> ApiResult {
    let g = |k: &str| q.get(k).map(|s| s.as_str()).unwrap_or("");
    let name = if g("filename").is_empty() { "upload.bin" } else { g("filename") };
    Ok(Json(ws.save_upload(&p, &f, g("folder"), name, &b, g("map") == "1")?))
}
/// App-private files are never served (CLAUDE.md, security).
fn private(rel: &str) -> bool {
    rel.split(['/', '\\']).any(|part| [".secrets.json", ".ide-token", ".app"].contains(&part))
}
async fn project_file(State(ws): S, Path((p, rest)): Path<(String, String)>) -> Response {
    let not_found = || (StatusCode::NOT_FOUND, [(header::CONTENT_TYPE, "text/plain")], "Not found").into_response();
    if private(&rest) { return not_found(); }
    let file = match ws.file_path(&p, &rest) { Ok(f) if f.is_file() => f, Ok(_) => return not_found(), Err(e) => return ApiError(e).into_response() };
    match tokio::fs::read(&file).await {
        Ok(bytes) => {
            let mut res = Response::new(Body::from(bytes));
            res.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static(mime(&file.to_string_lossy())));
            res.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
            res
        }
        Err(_) => not_found(),
    }
}
async fn secrets(State(ws): S) -> Json<Value> { Json(ws.secrets_status()) }
async fn secrets_clear(State(ws): S) -> ApiResult { Ok(Json(ws.secrets_remove_all()?)) }
async fn secret_put(State(ws): S, Path(name): Path<String>, b: Bytes) -> ApiResult {
    let body = body_json(&b)?;
    let r = ws.secret_set(&name, body["value"].as_str().unwrap_or(""))?;
    for x in ws.list_projects() { if let Some(s) = x["slug"].as_str() { if let Ok(pr) = ws.load_project(s) { ws.write_mcp_json(&pr); } } }
    Ok(Json(r))
}
async fn secret_delete(State(ws): S, Path(name): Path<String>) -> ApiResult { Ok(Json(ws.secret_remove(&name)?)) }
async fn chat_turn(State(ws): S, Path((p, f)): Path<(String, String)>, b: Bytes) -> Response {
    let rx = body_json(&b).map_err(|e| e.0).and_then(|body| chat::run_turn(ws.clone(), &p, &f, &body));
    let stream: std::pin::Pin<Box<dyn tokio_stream::Stream<Item = Result<Event, Infallible>> + Send>> = match rx {
        Ok(rx) => Box::pin(tokio_stream::wrappers::UnboundedReceiverStream::new(rx).map(|v| Ok(Event::default().data(v.to_string())))),
        Err(e) => Box::pin(tokio_stream::once(Ok(Event::default().data(json!({ "type": "error", "message": e.message }).to_string())))),
    };
    let mut res = Sse::new(stream).into_response();
    res.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    res
}
async fn chat_permission(Path(turn): Path<String>, headers: axum::http::HeaderMap, b: Bytes) -> ApiResult {
    let token = headers.get("x-pw-token").and_then(|h| h.to_str().ok()).unwrap_or("").to_string();
    Ok(Json(chat::request_permission(&turn, &token, &body_json(&b)?).await))
}
async fn chat_answer(Path((turn, req)): Path<(String, String)>, b: Bytes) -> ApiResult { Ok(Json(chat::answer_permission(&turn, &req, &body_json(&b)?)?)) }
async fn events() -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let hello = tokio_stream::once(Ok(Event::default().comment("hello")));
    type Events = std::pin::Pin<Box<dyn tokio_stream::Stream<Item = Result<Event, Infallible>> + Send>>;
    let changes: Events = match live::subscribe() {
        Some(rx) => Box::pin(tokio_stream::wrappers::BroadcastStream::new(rx).filter_map(|m| m.ok()).map(|d| Ok(Event::default().data(d)))),
        None => Box::pin(tokio_stream::pending()),
    };
    Sse::new(hello.chain(changes)).keep_alive(KeepAlive::new().interval(Duration::from_secs(25)).text("ping"))
}

fn mime(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
        "html" => "text/html; charset=utf-8", "js" => "text/javascript; charset=utf-8", "css" => "text/css; charset=utf-8",
        "json" => "application/json", "svg" => "image/svg+xml", "png" => "image/png", "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif", "webp" => "image/webp", "ico" => "image/x-icon", "woff2" => "font/woff2", "avif" => "image/avif", "bmp" => "image/bmp",
        "md" | "txt" | "yaml" | "yml" | "mmd" => "text/plain; charset=utf-8", "pdf" => "application/pdf", "mp4" => "video/mp4", "webm" => "video/webm", "mp3" => "audio/mpeg",
        _ => "application/octet-stream",
    }
}
async fn static_files(State(ws): S, req: Request) -> Response {
    let raw = req.uri().path().to_string();
    let path = percent_decode(raw.trim_start_matches('/'));
    if path.starts_with("api/") { return (StatusCode::NOT_FOUND, Json(json!({ "error": "Not found" }))).into_response(); }
    let public = ws.public_dir();
    let rel = if path.is_empty() { "index.html".to_string() } else { path };
    let file = workspace::safe_join(&public, &rel).ok().filter(|f| f.is_file()).unwrap_or_else(|| public.join("index.html"));
    match tokio::fs::read(&file).await {
        Ok(bytes) => {
            let mut res = Response::new(Body::from(bytes));
            res.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static(mime(&file.to_string_lossy())));
            res.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
            res
        }
        Err(_) => (StatusCode::NOT_FOUND, "Not found").into_response(),
    }
}
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes(); let mut out = Vec::with_capacity(b.len()); let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() && b[i + 1].is_ascii_hexdigit() && b[i + 2].is_ascii_hexdigit() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) { out.push(v); i += 3; continue; }
        }
        out.push(b[i]); i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// Runs the server on 127.0.0.1:<port> until the process ends.
pub async fn serve(ws: Workspace, port: u16) -> std::io::Result<()> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
    let _ = chat::PORT.set(listener.local_addr().map(|a| a.port()).unwrap_or(port));
    // stop a VS Code we started when the program is closed
    tokio::spawn(async {
        #[cfg(unix)]
        {
            let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).expect("signal");
            tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = term.recv() => {} }
        }
        #[cfg(not(unix))]
        { let _ = tokio::signal::ctrl_c().await; }
        let _ = ide::stop();
        std::process::exit(0);
    });
    axum::serve(listener, router(ws)).await
}
