//! Full VS Code inside the app (app/lib/ide.js): starts a browser VS Code (default: `code serve-web`)
//! and shows it through the app's own address under /ide (reverse proxy incl. WebSockets), so the
//! browser treats it as the same site. The proxy hands VS Code its connection token as the
//! "vscode-tkn" cookie — only for requests from the app itself; other sites can't frame it.
use axum::body::Body;
use axum::http::{header, HeaderMap, HeaderValue, Request, Response, StatusCode};
use pw_core::workspace::Workspace;
use regex::Regex;
use serde_json::{json, Value};
use std::path::Path;
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const DEF_PORT: u16 = 8740;
const DEF_BASE: &str = "/ide";
const DEF_COMMAND: &str = "code serve-web --host 127.0.0.1 --port {port} --connection-token {token} --server-base-path {base} --accept-server-license-terms";
const DEF_URL: &str = "{base}/?tkn={token}&folder={folder}";
const COOKIE: &str = "vscode-tkn";

fn template() -> String {
    format!(r#"# Workspace settings
ide:
  # The "VS Code" tab runs the full VS Code in the browser.
  # Default: the installed VS Code's own web server (needs internet once to download it).
  # {{port}}, {{token}}, {{host}} and {{folder}} are filled in by the app.
  # It is shown through the app's own address under {{base}} (default /ide), so browsers don't block it.
  # Keep the quotes: in YAML a value that starts with {{ would be read as a mapping.
  command: "{DEF_COMMAND}"
  port: {DEF_PORT}
  url: "{DEF_URL}"
  # code-server instead (serves at its root, so the app strips /ide):
  #   command: "code-server --bind-addr 127.0.0.1:{{port}} --auth none --disable-telemetry"
  #   url: "{{base}}/?folder={{folder}}"
  #   strip_base: true
  # OpenVSCode Server instead:
  #   command: "openvscode-server --host 127.0.0.1 --port {{port}} --connection-token {{token}} --server-base-path {{base}}"
  #   url: "{{base}}/?tkn={{token}}&folder={{folder}}"
"#)
}

/// Settings files of v0.1–v0.6.0 have `url: {base}/…` without quotes (a broken mapping in YAML): quote them once.
pub fn repair_settings(text: &str) -> String {
    let re = Regex::new(r#"(?m)^(\s*#?\s*(?:url|command):[ \t]*)(\{[^\n"']*?)[ \t]*$"#).unwrap();
    re.replace_all(text, |c: &regex::Captures| format!("{}\"{}\"", &c[1], c[2].replace('"', "\\\""))).into_owned()
}
#[derive(Clone)]
pub struct Settings { pub port: u16, pub base: String, pub command: String, pub url: String, pub strip: bool }
pub fn settings(ws: &Workspace) -> Settings {
    let f = ws.root.join("settings.yaml");
    let mut s = json!({});
    match std::fs::read_to_string(&f) {
        Ok(mut text) => {
            let fixed = repair_settings(&text);
            if fixed != text && std::fs::write(&f, &fixed).is_ok() { text = fixed; }
            s = pw_core::yaml::parse(&text).ok().map(|v| v["ide"].clone()).filter(|v| v.is_object()).unwrap_or(json!({}));
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => { let _ = std::fs::write(&f, template()); }
        Err(_) => {}
    }
    let text = |k: &str| s[k].as_str().map(|x| x.to_string());
    let env = |k: &str| std::env::var(k).ok().filter(|v| !v.is_empty());
    let port = env("IDE_PORT").and_then(|p| p.parse().ok()).or_else(|| s["port"].as_u64().map(|p| p as u16)).or_else(|| text("port").and_then(|p| p.parse().ok())).unwrap_or(DEF_PORT);
    let base = format!("/{}", text("base").unwrap_or_else(|| DEF_BASE.into()).trim_matches('/'));
    let mut command = env("IDE_COMMAND").or_else(|| text("command")).unwrap_or_else(|| DEF_COMMAND.into());
    let mut url = env("IDE_URL").or_else(|| text("url")).unwrap_or_else(|| DEF_URL.into());
    if (command.contains("serve-web") || command.contains("openvscode-server")) && !command.contains("--server-base-path") { command.push_str(" --server-base-path {base}"); }
    url = Regex::new(r"^https?://\{host\}:\{port\}/?").unwrap().replace(&url, "{base}/").into_owned();
    Settings { port, base, command, url, strip: s["strip_base"] == true }
}
/// A stable random token in the data folder (so a VS Code started earlier still matches).
pub fn token(ws: &Workspace) -> String {
    let f = ws.root.join(".ide-token");
    if let Ok(t) = std::fs::read_to_string(&f) { let t = t.trim(); if t.len() >= 32 && t.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()) { return t.to_string(); } }
    let mut b = [0u8; 24]; getrandom::getrandom(&mut b).expect("random numbers");
    let t: String = b.iter().map(|x| format!("{x:02x}")).collect();
    let _ = std::fs::write(&f, &t);
    t
}
fn fill(tpl: &str, vars: &[(&str, &str)]) -> String {
    Regex::new(r"\{(\w+)\}").unwrap().replace_all(tpl, |c: &regex::Captures| vars.iter().find(|(k, _)| *k == &c[1]).map(|(_, v)| v.to_string()).unwrap_or_else(|| c[0].to_string())).into_owned()
}
fn hide_tokens(s: &str) -> String { Regex::new(r"[a-f0-9]{32,}").unwrap().replace_all(s, "•••").into_owned() }

struct Run { pid: Option<u32>, starting: bool, log: Vec<String> }
fn run() -> &'static Mutex<Run> { static R: OnceLock<Mutex<Run>> = OnceLock::new(); R.get_or_init(|| Mutex::new(Run { pid: None, starting: false, log: vec![] })) }

async fn ping(port: u16) -> bool {
    let go = async {
        let mut s = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.ok()?;
        s.write_all(b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n").await.ok()?;
        let mut b = [0u8; 12]; let n = s.read(&mut b).await.ok()?;
        (n > 0 && b.starts_with(b"HTTP/")).then_some(())
    };
    matches!(tokio::time::timeout(Duration::from_millis(1500), go).await, Ok(Some(())))
}

pub async fn status(ws: &Workspace) -> Value {
    let s = settings(ws); let tkn = token(ws);
    let running = ping(s.port).await;
    let port = s.port.to_string();
    let r = run().lock().unwrap();
    json!({ "running": running, "starting": r.starting, "managed": r.pid.is_some(), "port": s.port, "base": s.base,
        "command": fill(&s.command, &[("port", &port), ("token", "•••"), ("base", &s.base)]),
        "url": fill(&s.url, &[("port", &port), ("token", &tkn), ("base", &s.base)]),
        "log": r.log[r.log.len().saturating_sub(12)..].to_vec() })
}
/// Folder path as VS Code's web UI expects it (?folder=/C:/Users/... on Windows), URL-encoded.
pub fn folder_param(abs: &Path) -> String {
    let p = abs.to_string_lossy().replace('\\', "/");
    let p = if p.len() > 2 && p.as_bytes()[1] == b':' && p.as_bytes()[2] == b'/' { format!("/{p}") } else { p };
    let mut out = String::new();
    for b in p.bytes() { if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) { out.push(b as char); } else { out.push_str(&format!("%{b:02X}")); } }
    out
}

fn shell(cmd: &str) -> tokio::process::Command {
    #[cfg(windows)]
    {
        let mut c = tokio::process::Command::new("cmd.exe");
        c.raw_arg(format!("/S /C \"{cmd}\"")).creation_flags(0x0800_0000);
        c
    }
    #[cfg(not(windows))]
    {
        let mut c = tokio::process::Command::new("/bin/sh");
        c.arg("-c").arg(cmd).process_group(0);
        c
    }
}
fn take_log(line: &str) {
    if line.trim().is_empty() { return; }
    let mut r = run().lock().unwrap();
    r.log.push(hide_tokens(line).chars().take(300).collect());
    if r.log.len() > 200 { let n = r.log.len() - 100; r.log.drain(..n); }
}

pub async fn start(ws: &Workspace) -> Value {
    let s = settings(ws);
    if ping(s.port).await { return status(ws).await; }
    let busy = { let mut r = run().lock().unwrap(); if r.starting { true } else { r.starting = true; r.log.clear(); false } };
    if busy { return status(ws).await; }
    let port = s.port.to_string(); let tkn = token(ws);
    let cmd = fill(&s.command, &[("port", &port), ("token", &tkn), ("base", &s.base)]);
    let mut c = shell(&cmd);
    c.current_dir(&ws.root).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    match c.spawn() {
        Ok(mut child) => {
            run().lock().unwrap().pid = child.id();
            for out in [child.stdout.take().map(|o| Box::new(o) as Box<dyn tokio::io::AsyncRead + Unpin + Send>), child.stderr.take().map(|o| Box::new(o) as Box<dyn tokio::io::AsyncRead + Unpin + Send>)].into_iter().flatten() {
                tokio::spawn(async move {
                    use tokio::io::AsyncBufReadExt;
                    let mut lines = tokio::io::BufReader::new(out).lines();
                    while let Ok(Some(l)) = lines.next_line().await { take_log(&l); }
                });
            }
            tokio::spawn(async move {
                let st = child.wait().await;
                let mut r = run().lock().unwrap();
                if let Ok(st) = st { if !st.success() { r.log.push(format!("(stopped with exit code {})", st.code().unwrap_or(-1))); } }
                r.pid = None; r.starting = false;
            });
        }
        Err(e) => { let mut r = run().lock().unwrap(); r.log.push(e.to_string()); r.pid = None; r.starting = false; }
    }
    // wait until it answers (the first start downloads the VS Code server, which can take a while)
    let until = Instant::now() + Duration::from_secs(120);
    while Instant::now() < until && run().lock().unwrap().pid.is_some() {
        if ping(s.port).await { break; }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    run().lock().unwrap().starting = false;
    let mut st = status(ws).await;
    let r = run().lock().unwrap();
    if st["running"] == false && r.pid.is_none() && r.log.is_empty() { st["log"] = json!([format!("Could not start: {}", hide_tokens(&cmd))]); }
    st
}
pub fn stop() -> Value {
    let pid = run().lock().unwrap().pid.take();
    let Some(pid) = pid else { return json!({ "ok": true, "managed": false }) };
    if cfg!(windows) {
        let mut c = std::process::Command::new("taskkill");
        c.args(["/pid", &pid.to_string(), "/T", "/F"]).stdout(Stdio::null()).stderr(Stdio::null());
        #[cfg(windows)]
        { use std::os::windows::process::CommandExt; c.creation_flags(0x0800_0000); }
        let _ = c.status();
    } else {
        let _ = std::process::Command::new("kill").args(["-TERM", &format!("-{pid}")]).stdout(Stdio::null()).stderr(Stdio::null()).status();
    }
    json!({ "ok": true })
}

// ---------- reverse proxy ----------
pub fn is_ide_path(base: &str, path: &str) -> bool { path == base || path.starts_with(&format!("{base}/")) }
fn target_path(path_q: &str, s: &Settings) -> String {
    if !s.strip { return path_q.to_string(); }
    let rest = &path_q[s.base.len().min(path_q.len())..];
    if rest.starts_with('/') { rest.to_string() } else { format!("/{rest}") }
}
/// VS Code's redirects can point at the server root ("/?folder=…"): keep every redirect under /ide.
pub fn rewrite_location(loc: &str, base: &str) -> String {
    let l = Regex::new(r"(?i)^https?://(127\.0\.0\.1|localhost|\[::1\]):\d+").unwrap().replace(loc, "").into_owned();
    if !l.starts_with('/') || l.starts_with("//") { return l; }
    if l == base || l.starts_with(&format!("{base}/")) || l.starts_with(&format!("{base}?")) { return l; }
    format!("{base}{l}")
}
pub fn with_token(cookie: &str, token: &str) -> String {
    let mut rest: Vec<&str> = cookie.split(';').map(|c| c.trim()).filter(|c| !c.is_empty() && !c.starts_with(&format!("{COOKIE}="))).collect();
    let t = format!("{COOKIE}={token}"); rest.push(&t);
    rest.join("; ")
}
fn from_app(h: &HeaderMap) -> bool { matches!(h.get("sec-fetch-site").and_then(|v| v.to_str().ok()), None | Some("same-origin") | Some("none")) }
fn page(code: StatusCode, html: &str) -> Response<Body> {
    let mut r = Response::new(Body::from(format!("<div style=\"font:14px system-ui,sans-serif;padding:20px;max-width:640px;line-height:1.5\">{html}</div>")));
    *r.status_mut() = code;
    r.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("text/html; charset=utf-8"));
    r.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    r
}
type Client = hyper_util::client::legacy::Client<hyper_util::client::legacy::connect::HttpConnector, Body>;
fn client() -> &'static Client {
    static C: OnceLock<Client> = OnceLock::new();
    C.get_or_init(|| hyper_util::client::legacy::Client::builder(hyper_util::rt::TokioExecutor::new()).build_http())
}

pub async fn proxy(ws: &Workspace, mut req: Request<Body>) -> Response<Body> {
    let s = settings(ws); let tkn = token(ws);
    let pq = req.uri().path_and_query().map(|p| p.as_str().to_string()).unwrap_or_else(|| "/".into());
    let app = from_app(req.headers());
    if req.headers().contains_key(header::UPGRADE) { return upgrade(req, &s, &tkn, &pq, app).await; }
    let nav = matches!(req.headers().get("sec-fetch-dest").and_then(|v| v.to_str().ok()), Some("iframe") | Some("document"));
    if app {
        let c = req.headers().get(header::COOKIE).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        if let Ok(v) = HeaderValue::from_str(&with_token(&c, &tkn)) { req.headers_mut().insert(header::COOKIE, v); }
    }
    let uri: axum::http::Uri = match format!("http://127.0.0.1:{}{}", s.port, target_path(&pq, &s)).parse() { Ok(u) => u, Err(_) => return page(StatusCode::BAD_REQUEST, "Bad address") };
    *req.uri_mut() = uri;
    *req.version_mut() = axum::http::Version::HTTP_11;
    let r = match client().request(req).await {
        Ok(r) => r,
        Err(_) => return page(StatusCode::BAD_GATEWAY, "VS Code is not running. Start it from the VS Code tab of a project."),
    };
    if r.status() == StatusCode::FORBIDDEN && nav {
        return page(StatusCode::FORBIDDEN, "<b>VS Code refused the connection token.</b><br>It is probably still running from an earlier start with another token. Close VS Code's web server (or restart the computer), then click <b>Start VS Code</b> in the VS Code tab again.<br><span style=\"color:#888\">If you set your own <code>ide:</code> command in data/settings.yaml, make sure it uses <code>--connection-token {token}</code>.</span>");
    }
    let (mut parts, body) = r.into_parts();
    let h = &mut parts.headers;
    h.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("SAMEORIGIN"));
    for k in [header::CONTENT_SECURITY_POLICY, header::CONTENT_SECURITY_POLICY_REPORT_ONLY] {
        if let Some(v) = h.get(&k).and_then(|v| v.to_str().ok()).map(|v| v.to_string()) {
            let kept: Vec<&str> = v.split(';').filter(|x| !x.trim_start().to_lowercase().starts_with("frame-ancestors")).collect();
            let kept = kept.join(";");
            let nv = if kept.trim().is_empty() { "frame-ancestors 'self'".to_string() } else { format!("{kept}; frame-ancestors 'self'") };
            if let Ok(v) = HeaderValue::from_str(&nv) { h.insert(k, v); }
        }
    }
    if !h.contains_key(header::CONTENT_SECURITY_POLICY) { h.insert(header::CONTENT_SECURITY_POLICY, HeaderValue::from_static("frame-ancestors 'self'")); }
    if let Some(l) = h.get(header::LOCATION).and_then(|v| v.to_str().ok()).map(|l| rewrite_location(l, &s.base)) {
        if let Ok(v) = HeaderValue::from_str(&l) { h.insert(header::LOCATION, v); }
    }
    Response::from_parts(parts, Body::new(body))
}

/// WebSockets: the request goes to VS Code as raw bytes (with the token cookie), then both sides are joined.
async fn upgrade(mut req: Request<Body>, s: &Settings, tkn: &str, pq: &str, app: bool) -> Response<Body> {
    let refuse = || { let mut r = Response::new(Body::empty()); *r.status_mut() = StatusCode::FORBIDDEN; r };
    if !app { return refuse(); }
    let Ok(mut up) = tokio::net::TcpStream::connect(("127.0.0.1", s.port)).await else { return refuse() };
    let mut raw = format!("{} {} HTTP/1.1\r\n", req.method(), target_path(pq, s));
    for (k, v) in req.headers() { if k != header::COOKIE { raw.push_str(&format!("{}: {}\r\n", k.as_str(), String::from_utf8_lossy(v.as_bytes()))); } }
    let c = req.headers().get(header::COOKIE).and_then(|v| v.to_str().ok()).unwrap_or("");
    raw.push_str(&format!("Cookie: {}\r\n\r\n", with_token(c, tkn)));
    if up.write_all(raw.as_bytes()).await.is_err() { return refuse(); }
    // the answer's head
    let mut buf = Vec::new(); let mut chunk = [0u8; 4096];
    let head_end = loop {
        let Ok(n) = up.read(&mut chunk).await else { return refuse() };
        if n == 0 { return refuse(); }
        buf.extend_from_slice(&chunk[..n]);
        if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") { break i + 4; }
        if buf.len() > 64 * 1024 { return refuse(); }
    };
    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
    let rest = buf[head_end..].to_vec();
    let mut lines = head.split("\r\n");
    let code = lines.next().and_then(|l| l.split_whitespace().nth(1)).and_then(|c| c.parse::<u16>().ok()).unwrap_or(502);
    let mut res = Response::new(Body::empty());
    *res.status_mut() = StatusCode::from_u16(code).unwrap_or(StatusCode::BAD_GATEWAY);
    for l in lines { if let Some((k, v)) = l.split_once(':') {
        if let (Ok(k), Ok(v)) = (header::HeaderName::from_bytes(k.trim().as_bytes()), HeaderValue::from_str(v.trim())) { res.headers_mut().append(k, v); }
    } }
    if code != 101 { return res; }
    let on = hyper::upgrade::on(&mut req);
    tokio::spawn(async move {
        if let Ok(client) = on.await {
            let mut client = hyper_util::rt::TokioIo::new(client);
            if !rest.is_empty() && client.write_all(&rest).await.is_err() { return; }
            let _ = tokio::io::copy_bidirectional(&mut client, &mut up).await;
        }
    });
    res
}
