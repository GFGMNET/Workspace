//! Project Workspace desktop app (Tauri): runs the server in the same program and shows it in a
//! window that uses the system's browser engine (WebView2 on Windows, WebKitGTK on Linux).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{net::TcpStream, thread, time::{Duration, Instant}};

fn main() {
    let port: u16 = std::env::args().skip(1).find_map(|a| a.parse().ok()).or_else(|| std::env::var("PORT").ok().and_then(|p| p.parse().ok())).unwrap_or(4321);
    let ws = pw_server::workspace_from_env();
    thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread().enable_all().build().expect("runtime");
        if let Err(e) = rt.block_on(pw_server::serve(ws, port)) { eprintln!("server: {e}"); }
    });
    let until = Instant::now() + Duration::from_secs(20);
    while TcpStream::connect(("127.0.0.1", port)).is_err() && Instant::now() < until { thread::sleep(Duration::from_millis(100)); }
    let url = format!("http://localhost:{port}/");
    tauri::Builder::default()
        .setup(move |app| {
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url.parse().expect("url")))
                .title("Project Workspace (Rust prototype)")
                .inner_size(1360.0, 880.0)
                .min_inner_size(720.0, 480.0)
                .disable_drag_drop_handler() // the page handles dropped files itself
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("could not start the window");
}
