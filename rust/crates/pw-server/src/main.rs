//! project-workspace-server: the workspace without a window (and helpers for the tests).
//!   project-workspace-server [port]          serve on 127.0.0.1:<port> (default 4321)
//!   project-workspace-server yaml parse <f>  print how the app reads a YAML file (tests/yaml-corpus)
use serde_json::json;

fn sort(v: serde_json::Value) -> serde_json::Value {
    // serde_json's map is ordered by key already; this keeps the output stable
    v
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(|s| s.as_str()) == Some("yaml") {
        let file = args.get(2).cloned().unwrap_or_default();
        let text = std::fs::read_to_string(&file).unwrap_or_default();
        match args.get(1).map(|s| s.as_str()) {
            Some("parse") => {
                let out = match pw_core::yaml::parse_with_info(&text) {
                    Ok((v, w)) => json!({ "value": sort(v), "warning": w }),
                    Err(e) => json!({ "error": true, "line": e.line }),
                };
                print!("{out}");
            }
            _ => { eprintln!("not in the prototype yet"); std::process::exit(3); }
        }
        return;
    }
    let port: u16 = args.iter().find_map(|a| a.parse().ok()).or_else(|| std::env::var("PORT").ok().and_then(|p| p.parse().ok())).unwrap_or(4321);
    let ws = pw_server::workspace_from_env();
    println!("\n  Project Workspace {} (Rust prototype)\n  → http://localhost:{port}\n  Your data: {}\n", pw_server::VERSION, ws.root.display());
    if let Err(e) = pw_server::serve(ws, port).await {
        eprintln!("  Could not start on port {port}: {e}");
        std::process::exit(1);
    }
}
