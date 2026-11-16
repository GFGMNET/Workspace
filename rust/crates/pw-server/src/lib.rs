//! HTTP API on 127.0.0.1 (same routes and answers as app/server.js; checked by tests/contract).
//! Phase 1 prototype: info, features, projects, Markdown pages, static files, live-refresh stream;
//! the other routes answer with empty data so the screens work.
use axum::{
    body::Body,
    extract::{Path, Request, State},
    http::{header, HeaderValue, StatusCode},
    middleware::{self, Next},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Json, Router,
};
use pw_core::workspace::{self, HttpError, Workspace};
use serde_json::{json, Value};
use std::{convert::Infallible, path::PathBuf, sync::Arc, time::Duration};
use tokio_stream::{wrappers::IntervalStream, StreamExt};

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
    Router::new()
        .route("/api/info", get(info))
        .route("/api/claude", get(|| async { Json(json!({ "ok": false, "command": "claude", "error": "Chat is not in the Rust prototype yet" })) }))
        .route("/api/examples", post(examples))
        .route("/api/features", get(features))
        .route("/api/projects", get(projects))
        .route("/api/projects/{p}", get(project))
        .route("/api/projects/{p}/overview", get(overview))
        .route("/api/projects/{p}/index", get(|| async { Json(json!([])) }))
        .route("/api/projects/{p}/backlinks", get(|| async { Json(json!([])) }))
        .route("/api/projects/{p}/f/{f}/items", get(items))
        .route("/api/projects/{p}/f/{f}/items/{id}", get(item).put(write_item))
        .route("/api/search", get(|| async { Json(json!([])) }))
        .route("/api/due", get(|| async { Json(json!({ "today": today(), "days": 14, "items": [], "total": 0 })) }))
        .route("/api/templates", get(|| async { Json(json!([])) }))
        .route("/api/archive", get(|| async { Json(json!([])) }))
        .route("/api/secrets", get(|| async { Json(json!({ "protection": "none", "available": false, "locked": null, "items": [] })) }))
        .route("/api/update", get(|| async { Json(json!({ "current": VERSION, "enabled": false, "repo": "GFGMNET/Workspace", "lastCheck": null, "latest": null, "available": false, "snoozedUntil": null, "snoozed": false, "error": null })) }))
        .route("/api/ide", get(|| async { Json(json!({ "running": false, "starting": false, "managed": false, "port": 8740, "base": "/ide", "command": "", "url": "/ide/", "log": ["The VS Code tab is not in the Rust prototype yet"] })) }))
        .route("/api/events", get(events))
        .fallback(static_files)
        .layer(middleware::from_fn(guard))
        .with_state(ws)
}

/// Same checks as app/server.js: only localhost (DNS rebinding), changes only from the app itself (CSRF).
async fn guard(req: Request, next: Next) -> Response {
    let host = req.headers().get(header::HOST).and_then(|h| h.to_str().ok()).unwrap_or("");
    let host_name = if host.starts_with('[') { host.split(']').next().map(|h| format!("{h}]")).unwrap_or_default() } else { host.split(':').next().unwrap_or("").to_string() };
    if !["127.0.0.1", "localhost", "[::1]"].contains(&host_name.as_str()) {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Forbidden host" }))).into_response();
    }
    if req.method() != axum::http::Method::GET {
        if let Some(o) = req.headers().get(header::ORIGIN).and_then(|h| h.to_str().ok()) {
            let ok = ["http://localhost", "http://127.0.0.1", "http://[::1]", "https://localhost", "https://127.0.0.1"].iter()
                .any(|p| o == *p || (o.starts_with(p) && o[p.len()..].starts_with(':') && o[p.len() + 1..].chars().all(|c| c.is_ascii_digit())));
            if !ok { return (StatusCode::FORBIDDEN, Json(json!({ "error": "Forbidden origin" }))).into_response(); }
        }
    }
    next.run(req).await
}

fn today() -> String {
    // UTC date; good enough for the prototype's empty lists
    let days = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() / 86400).unwrap_or(0) as i64;
    let (y, m, d) = civil(days);
    format!("{y:04}-{m:02}-{d:02}")
}
fn civil(z: i64) -> (i64, u32, u32) {
    let z = z + 719468; let era = z.div_euclid(146097); let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

async fn info(State(ws): S) -> Json<Value> {
    Json(json!({
        "version": VERSION, "root": ws.root.to_string_lossy(), "examples": ws.list_examples().len(),
        "projectsDir": ws.projects_dir().to_string_lossy(), "featuresDir": ws.features_dir().to_string_lossy(),
        "stores": workspace::STORES, "layouts": workspace::layouts(), "fieldTypes": workspace::FIELD_TYPES,
        "platform": if cfg!(windows) { "win32" } else if cfg!(target_os = "macos") { "darwin" } else { "linux" },
        "mcpScript": null, "exe": std::env::current_exe().ok().map(|p| p.to_string_lossy().to_string()),
        "wiki": "https://github.com/GFGMNET/Workspace/wiki", "mcpCommand": "", "mcpEnv": null, "desktop": true, "prototype": true
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
async fn overview(State(ws): S, Path(p): Path<String>) -> ApiResult {
    let pr = ws.load_project(&p)?;
    let list = ws.list_projects();
    let counts = list.iter().find(|x| x["slug"] == p.as_str()).map(|x| x["features"].clone()).unwrap_or(json!([]));
    let tiles: Vec<Value> = pr.features.iter().map(|f| match &f.def {
        None => json!({ "key": f.key, "name": workspace::prettify(&f.key), "missing": true }),
        Some(d) => json!({ "key": f.key, "name": d["name"], "layout": d["layout"], "icon": d["icon"], "stores": d["stores"],
            "count": counts.as_array().and_then(|a| a.iter().find(|x| x["key"] == f.key.as_str())).map(|x| x["count"].clone()).unwrap_or(json!(0)) }),
    }).collect();
    Ok(Json(json!({ "name": pr.name, "meta": pr.meta, "today": today(), "days": 30, "tiles": tiles, "upcoming": [], "open": [], "openTotal": 0, "recent": [] })))
}
async fn items(State(ws): S, Path((p, f)): Path<(String, String)>) -> ApiResult { Ok(Json(ws.list_items(&p, &f)?)) }
async fn item(State(ws): S, Path((p, f, id)): Path<(String, String, String)>) -> ApiResult { Ok(Json(ws.read_item(&p, &f, &id)?)) }
async fn write_item(State(ws): S, Path((p, f, id)): Path<(String, String, String)>, Json(body): Json<Value>) -> ApiResult {
    let content = body["content"].as_str().ok_or_else(|| ApiError(workspace::err(400, "content is missing")))?;
    Ok(Json(ws.write_item(&p, &f, &id, content)?))
}
async fn events() -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    // live refresh: the prototype only keeps the connection open (file watching comes in phase 2)
    let s = IntervalStream::new(tokio::time::interval(Duration::from_secs(25))).map(|_| Ok(Event::default().comment("ping")));
    Sse::new(s).keep_alive(KeepAlive::default())
}

fn mime(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
        "html" => "text/html; charset=utf-8", "js" => "text/javascript; charset=utf-8", "css" => "text/css; charset=utf-8",
        "json" => "application/json", "svg" => "image/svg+xml", "png" => "image/png", "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif", "webp" => "image/webp", "ico" => "image/x-icon", "woff2" => "font/woff2", _ => "application/octet-stream",
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
    axum::serve(listener, router(ws)).await
}
