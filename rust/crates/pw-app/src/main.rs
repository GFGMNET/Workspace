//! Workspace desktop app (Tauri): runs the server in the same program and shows it in a
//! window that uses the system's browser engine (WebView2 on Windows, WebKitGTK on Linux).
//! Like the 0.x app (app/electron/main.js + desktop.js):
//!   Workspace                   open the window (starts the server, or uses one already running on the port)
//!   Workspace        4322       use another port
//!   Workspace        --browser  open in the normal browser instead of the app window
//!   Workspace        --hidden   start in the tray (used when it starts with the computer)
//!   Workspace        --version  print the version
//!   Workspace        mcp        the workspace MCP server for Claude CLI (no window)
//! Tray icon, reminders for what is due and "start with the computer" are set in the tray menu;
//! they are kept in data/.desktop.json, the window size in data/.window.json.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

const CHECK_EVERY: Duration = Duration::from_secs(30 * 60);

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let has = |f: &str| args.iter().any(|a| a == f);
    // modes without a window
    match args.first().map(|s| s.as_str()) {
        Some("permission-mcp") => { pw_server::chat::permission_mcp_main(); return; }
        Some("mcp") | Some("--mcp") => { pw_server::mcp::main(); return; }
        Some("--version") => { println!("{}", pw_server::VERSION); return; }
        _ => {}
    }
    if let Ok(exe) = std::env::current_exe() { std::env::set_var("PW_EXE", exe); }
    #[cfg(target_os = "linux")]
    pw_core::secrets::set_protector(Box::new(keyring_protector::Keyring));

    let wanted: u16 = args.iter().find_map(|a| a.parse().ok()).or_else(|| std::env::var("PORT").ok().and_then(|p| p.parse().ok())).unwrap_or(4321);
    let ws = pw_server::workspace_from_env();
    let data_dir = ws.root.clone();
    let _ = std::fs::create_dir_all(&data_dir);
    // Reuse a workspace on the port only if it is this same program with this same data folder
    // (e.g. started with the computer). Anything else there — like a running 0.x app with its own
    // data — is left alone: we take the next free port instead.
    let mut port = wanted; let mut reuse = false;
    for p in wanted..wanted.saturating_add(30) {
        match info(p) {
            Some(i) if same_workspace(&i, &data_dir) => { port = p; reuse = true; break; }
            Some(_) => continue,
            None if std::net::TcpListener::bind(("127.0.0.1", p)).is_ok() => { port = p; break; }
            None => continue,
        }
    }
    let url = format!("http://localhost:{port}");
    if !reuse {
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread().enable_all().build().expect("runtime");
            if let Err(e) = rt.block_on(pw_server::serve(ws, port)) { eprintln!("server: {e}"); }
        });
        let until = Instant::now() + Duration::from_secs(60);
        while !answers(port) && Instant::now() < until { std::thread::sleep(Duration::from_millis(200)); }
    }
    std::env::remove_var("PW_RESTARTED");
    let desktop = Arc::new(Desktop::new(data_dir.clone()));
    let quitting = Arc::new(Mutex::new(false));
    let (browser, hidden) = (has("--browser"), has("--hidden"));

    let d2 = desktop.clone(); let url2 = url.clone(); let q2 = quitting.clone();
    let app = tauri::Builder::default()
        // a second start shows the window of the first one
        .plugin(tauri_plugin_single_instance::init({ let url = url.clone(); move |app, _argv, _cwd| show_window(app, &url, None) }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .setup(move |app| {
            let h = app.handle().clone();
            d2.apply_autostart(&h);
            d2.refresh_tray(&h, &url2, &q2)?;
            // reminders: first after a few seconds, then every 30 minutes
            { let d = d2.clone(); let h = h.clone(); std::thread::spawn(move || { std::thread::sleep(Duration::from_secs(8)); loop { d.check(&h, port); std::thread::sleep(CHECK_EVERY); } }); }
            if !answers(port) { fail(&h, &format!("The workspace did not start on {url2}. Is another program using port {port}?")); return Ok(()); }
            if browser { let _ = h.opener().open_url(&url2, None::<&str>); return Ok(()); }
            if hidden { return Ok(()); } // started with the computer: wait in the tray
            open_window(&h, &url2, None);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("could not start the app");
    let d3 = desktop.clone(); let q3 = quitting.clone();
    app.run(move |h, event| match event {
        // with the tray icon on, closing the window keeps the workspace (and its reminders) running
        // X quits the app (decided 2026-11-17); reminders run while the app runs
        RunEvent::WindowEvent { label, event: WindowEvent::CloseRequested { .. }, .. } if label == "main" => {
            *q3.lock().unwrap() = true;
            if let Some(w) = h.get_webview_window("main") { save_window(&d3.dir, &w); }
            let _ = pw_server::ide::stop();
        }
        RunEvent::ExitRequested { api, code, .. } => { if code.is_none() && !*q3.lock().unwrap() { api.prevent_exit(); } }
        RunEvent::WindowEvent { label, event: WindowEvent::Resized(_) | WindowEvent::Moved(_), .. } if label == "main" => {
            if let Some(w) = h.get_webview_window("main") { if w.is_visible().unwrap_or(false) { save_window(&d3.dir, &w); } }
        }
        _ => {}
    });
}

/// Does a workspace answer on this port?
fn answers(port: u16) -> bool { info(port).is_some() }
fn info(port: u16) -> Option<Value> { http_get(port, "/api/info").filter(|v| !v["version"].is_null()) }
fn same_workspace(i: &Value, data: &std::path::Path) -> bool {
    let canon = |p: &std::path::Path| std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    i["version"] == pw_server::VERSION && i["root"].as_str().map(|r| canon(std::path::Path::new(r)) == canon(data)).unwrap_or(false)
}
fn http_get(port: u16, path: &str) -> Option<Value> {
    let mut s = TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(1500)).ok()?;
    let _ = s.set_read_timeout(Some(Duration::from_secs(10)));
    s.write_all(format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n").as_bytes()).ok()?;
    let mut out = Vec::new(); let _ = s.read_to_end(&mut out);
    let text = String::from_utf8_lossy(&out);
    let (head, body) = text.split_once("\r\n\r\n")?;
    let body = if head.to_lowercase().contains("transfer-encoding: chunked") { dechunk(body) } else { body.to_string() };
    serde_json::from_str(&body).ok()
}
fn dechunk(s: &str) -> String {
    let mut out = String::new(); let mut rest = s;
    while let Some((size, after)) = rest.split_once("\r\n") {
        let n = usize::from_str_radix(size.trim(), 16).unwrap_or(0);
        if n == 0 || after.len() < n { break; }
        out.push_str(&after[..n]); rest = after[n..].trim_start_matches("\r\n");
    }
    out
}
fn fail(h: &AppHandle, msg: &str) {
    eprintln!("{msg}");
    let _ = h.notification().builder().title("Workspace").body(msg).show();
    h.exit(1);
}

// ---------- the window ----------
fn local(u: &tauri::Url, base: &str) -> bool {
    let b = tauri::Url::parse(base).ok();
    ["localhost", "127.0.0.1"].contains(&u.host_str().unwrap_or("")) && b.map(|b| u.port_or_known_default() == b.port_or_known_default()).unwrap_or(false)
}
fn open_window(h: &AppHandle, url: &str, hash: Option<&str>) {
    let dir = pw_server::workspace_from_env().root;
    let st: Value = std::fs::read_to_string(dir.join(".window.json")).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(json!({}));
    let target = format!("{url}/{}", hash.unwrap_or(""));
    let Ok(parsed) = target.parse() else { return };
    let h2 = h.clone(); let h3 = h.clone(); let base = url.to_string();
    let mut b = WebviewWindowBuilder::new(h, "main", WebviewUrl::External(parsed))
        .title("Workspace")
        .inner_size(st["width"].as_f64().unwrap_or(1360.0), st["height"].as_f64().unwrap_or(880.0))
        .min_inner_size(720.0, 480.0)
        .disable_drag_drop_handler() // the page handles dropped files itself
        // pages of this workspace stay in the app; everything else (wiki, GitHub, websites) opens in the browser
        .on_navigation(move |u| {
            if local(u, &base) { return true; }
            if ["http", "https", "mailto"].contains(&u.scheme()) { let _ = h2.opener().open_url(u.as_str(), None::<&str>); }
            false
        })
        // links with target="_blank" (Help & wiki, help links, GitHub) and window.open ask for a new window: open them in the
        // browser instead; without this the app ignores them (#82)
        .on_new_window(move |u, _features| {
            if ["http", "https", "mailto"].contains(&u.scheme()) { let _ = h3.opener().open_url(u.as_str(), None::<&str>); }
            tauri::webview::NewWindowResponse::Deny
        });
    if let (Some(x), Some(y)) = (st["x"].as_f64(), st["y"].as_f64()) { b = b.position(x, y); }
    if let Ok(w) = b.build() { if st["maximized"] == true { let _ = w.maximize(); } }
}
/// Like encodeURIComponent, for the parts of a screen address.
fn enc(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}
fn show_window(h: &AppHandle, url: &str, hash: Option<&str>) {
    match h.get_webview_window("main") {
        None => open_window(h, url, hash),
        Some(w) => {
            let _ = w.unminimize(); let _ = w.show(); let _ = w.set_focus();
            if let Some(hash) = hash { let _ = w.eval(&format!("location.hash = {}", json!(hash))); }
        }
    }
}
fn save_window(dir: &std::path::Path, w: &tauri::WebviewWindow) {
    if w.is_minimized().unwrap_or(false) { return; }
    let f = dir.join(".window.json");
    let mut st: Value = std::fs::read_to_string(&f).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(json!({}));
    let max = w.is_maximized().unwrap_or(false);
    st["maximized"] = json!(max);
    if !max {
        let scale = w.scale_factor().unwrap_or(1.0);
        if let Ok(s) = w.inner_size() { let l = s.to_logical::<f64>(scale); st["width"] = json!(l.width); st["height"] = json!(l.height); }
        if let Ok(p) = w.outer_position() { let l = p.to_logical::<f64>(scale); st["x"] = json!(l.x); st["y"] = json!(l.y); }
    }
    let _ = std::fs::write(f, st.to_string());
}

// ---------- tray, reminders, start with the computer (desktop.js) ----------
struct Desktop { dir: PathBuf, tray: Mutex<Option<TrayIcon>>, due: Mutex<Vec<Value>> }
impl Desktop {
    fn new(dir: PathBuf) -> Self { Desktop { dir, tray: Mutex::new(None), due: Mutex::new(vec![]) } }
    fn file(&self) -> PathBuf { self.dir.join(".desktop.json") }
    fn settings(&self) -> Value {
        let mut s = json!({ "tray": true, "notifications": true, "autostart": false });
        if let Some(Value::Object(o)) = std::fs::read_to_string(self.file()).ok().and_then(|t| serde_json::from_str(&t).ok()) { for (k, v) in o { s[k] = v; } }
        s
    }
    fn set(&self, k: &str, v: Value) { let mut s = self.settings(); s[k] = v; let _ = std::fs::write(self.file(), serde_json::to_string_pretty(&s).unwrap() + "\n"); }
    fn apply_autostart(&self, h: &AppHandle) {
        let al = h.autolaunch();
        let _ = if self.settings()["autostart"] == true { al.enable() } else if al.is_enabled().unwrap_or(false) { al.disable() } else { Ok(()) };
    }
    fn os() -> &'static str { if cfg!(windows) { "Windows" } else if cfg!(target_os = "macos") { "macOS" } else { "the computer" } }
    fn menu(&self, h: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
        let st = self.settings(); let n = self.due.lock().unwrap().len();
        let open = MenuItem::with_id(h, "open", "Open Workspace", true, None::<&str>)?;
        let due = MenuItem::with_id(h, "due", if n > 0 { format!("Due today: {n}") } else { "Nothing due today".into() }, n > 0, None::<&str>)?;
        let rem = CheckMenuItem::with_id(h, "notifications", "Remind me of what is due", true, st["notifications"] == true, None::<&str>)?;
        let auto = CheckMenuItem::with_id(h, "autostart", format!("Start with {}", Self::os()), true, st["autostart"] == true, None::<&str>)?;
        let browser = MenuItem::with_id(h, "browser", "Open in browser", true, None::<&str>)?;
        let folder = MenuItem::with_id(h, "folder", "Open data folder", true, None::<&str>)?;
        let wiki = MenuItem::with_id(h, "wiki", "Wiki", true, None::<&str>)?;
        let ver = MenuItem::with_id(h, "version", format!("Version {}", pw_server::VERSION), false, None::<&str>)?;
        let quit = MenuItem::with_id(h, "quit", "Quit", true, None::<&str>)?;
        let (s1, s2, s3) = (PredefinedMenuItem::separator(h)?, PredefinedMenuItem::separator(h)?, PredefinedMenuItem::separator(h)?);
        // the due items themselves (a click opens it; notifications can't be clicked on Windows/Linux, #75)
        let list: Vec<MenuItem<tauri::Wry>> = self.due.lock().unwrap().iter().take(8).enumerate().map(|(i, d)| {
            let t = |k: &str| d[k].as_str().unwrap_or("").to_string();
            let label: String = format!("{}{} — {}", if d["overdue"] == true { "⚠ " } else { "   " }, t("title"), t("projectName")).chars().take(70).collect();
            MenuItem::with_id(h, format!("due:{i}"), label, true, None::<&str>)
        }).collect::<tauri::Result<_>>()?;
        let mut items: Vec<&dyn IsMenuItem<tauri::Wry>> = vec![&open, &due];
        items.extend(list.iter().map(|m| m as &dyn IsMenuItem<tauri::Wry>));
        items.extend([&s1 as &dyn IsMenuItem<tauri::Wry>, &rem, &auto, &s2, &browser, &folder, &wiki, &ver, &s3, &quit]);
        Menu::with_items(h, &items)
    }
    fn refresh_tray(self: &Arc<Self>, h: &AppHandle, url: &str, quitting: &Arc<Mutex<bool>>) -> tauri::Result<()> {
        let n = self.due.lock().unwrap().len();
        let tip = if n > 0 { format!("Workspace — {n} due today") } else { "Workspace".into() };
        let mut t = self.tray.lock().unwrap();
        if let Some(tray) = t.as_ref() {
            tray.set_menu(Some(self.menu(h)?))?; tray.set_tooltip(Some(&tip))?;
            return Ok(());
        }
        let me = self.clone(); let url_m = url.to_string(); let url_c = url.to_string(); let q = quitting.clone();
        let mut b = TrayIconBuilder::with_id("main").tooltip(&tip).menu(&self.menu(h)?).show_menu_on_left_click(false)
            .on_menu_event(move |app, e| {
                match e.id.as_ref() {
                    "open" => show_window(app, &url_m, None),
                    "due" => show_window(app, &url_m, Some("#/")),
                    id if id.starts_with("due:") => {
                        let d = id[4..].parse::<usize>().ok().and_then(|i| me.due.lock().unwrap().get(i).cloned());
                        if let Some(d) = d {
                            let part = |k: &str| enc(d[k].as_str().unwrap_or(""));
                            show_window(app, &url_m, Some(&format!("#/p/{}/{}/{}", part("project"), part("feature"), part("id"))));
                        }
                    }
                    "notifications" => { let v = me.settings()["notifications"] != true; me.set("notifications", json!(v)); }
                    "autostart" => { let v = me.settings()["autostart"] != true; me.set("autostart", json!(v)); me.apply_autostart(app); }
                    "browser" => { let _ = app.opener().open_url(&url_m, None::<&str>); }
                    "folder" => { let _ = app.opener().open_path(me.dir.to_string_lossy(), None::<&str>); }
                    "wiki" => { let _ = app.opener().open_url("https://github.com/GFGMNET/Workspace/wiki", None::<&str>); }
                    "quit" => { *q.lock().unwrap() = true; let _ = pw_server::ide::stop(); app.exit(0); }
                    _ => {}
                }
                if let Some(t) = me.tray.lock().unwrap().as_ref() { if let Ok(m) = me.menu(app) { let _ = t.set_menu(Some(m)); } }
            })
            .on_tray_icon_event(move |tray, e| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e { show_window(tray.app_handle(), &url_c, None); }
            });
        if let Some(icon) = h.default_window_icon() { b = b.icon(icon.clone()); }
        *t = Some(b.build(h)?);
        Ok(())
    }
    /// What is due today (and overdue), as a reminder once per item and date.
    fn check(self: &Arc<Self>, h: &AppHandle, port: u16) {
        let Some(o) = http_get(port, "/api/due?days=1") else { return };
        let today = o["today"].as_str().unwrap_or("").to_string();
        let items: Vec<Value> = o["items"].as_array().cloned().unwrap_or_default().into_iter().filter(|i| i["overdue"] == true || i["date"].as_str().unwrap_or("") <= today.as_str()).collect();
        *self.due.lock().unwrap() = items.clone();
        if let Some(t) = self.tray.lock().unwrap().as_ref() {
            let n = items.len();
            let _ = t.set_tooltip(Some(if n > 0 { format!("Workspace — {n} due today") } else { "Workspace".into() }));
            if let Ok(m) = self.menu(h) { let _ = t.set_menu(Some(m)); }
        }
        let st = self.settings();
        if st["notifications"] != true { return; }
        let key = |i: &Value| format!("{}|{}|{}|{}", i["project"].as_str().unwrap_or(""), i["feature"].as_str().unwrap_or(""), i["id"].as_str().unwrap_or(""), i["date"].as_str().unwrap_or(""));
        let seen = st["notified"].clone();
        let fresh: Vec<&Value> = items.iter().filter(|i| seen.get(key(i)).is_none()).collect();
        let keep: serde_json::Map<String, Value> = items.iter().map(|i| (key(i), json!(today))).collect();
        self.set("notified", Value::Object(keep));
        if fresh.is_empty() { return; }
        let s = |v: &Value| v.as_str().unwrap_or("").to_string();
        if fresh.len() > 3 {
            let body = fresh.iter().take(3).map(|i| format!("{} ({})", s(&i["title"]), s(&i["projectName"]))).collect::<Vec<_>>().join("\n") + "\n…";
            let _ = h.notification().builder().title(format!("{} things are due", fresh.len())).body(body).show();
            return;
        }
        for i in fresh {
            let title = format!("{}{}", if i["overdue"] == true { "Overdue: " } else { "Due today: " }, s(&i["title"]));
            let _ = h.notification().builder().title(title).body(format!("{} · {} · {}", s(&i["projectName"]), s(&i["featureName"]), s(&i["field"]))).show();
        }
    }
}

/// Linux: the secrets' key is kept in the system keyring (Secret Service), one entry per data folder.
#[cfg(target_os = "linux")]
mod keyring_protector {
    pub struct Keyring;
    impl pw_core::secrets::Protector for Keyring {
        fn name(&self) -> &'static str { "keyring" }
        fn protect(&self, key: &[u8]) -> Result<String, String> {
            use base64::Engine;
            let id = format!("key-{}", hex_id());
            keyring::Entry::new("Project Workspace", &id).and_then(|e| e.set_password(&base64::engine::general_purpose::STANDARD.encode(key))).map_err(|e| e.to_string())?;
            Ok(id)
        }
        fn unprotect(&self, data: &str) -> Result<Vec<u8>, String> {
            use base64::Engine;
            let p = keyring::Entry::new("Project Workspace", data).and_then(|e| e.get_password()).map_err(|e| e.to_string())?;
            base64::engine::general_purpose::STANDARD.decode(p).map_err(|e| e.to_string())
        }
    }
    fn hex_id() -> String {
        let mut b = [0u8; 8];
        getrandom::getrandom(&mut b).expect("random numbers");
        b.iter().map(|x| format!("{x:02x}")).collect()
    }
}
