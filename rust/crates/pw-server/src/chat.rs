//! Chat (app/lib/chat.js): runs Claude CLI (`claude -p … --output-format stream-json`) in the project
//! folder, streams its answer to the screen and saves the conversation as JSON in the chat feature.
//! Permission questions (mode "ask") come back through a tiny MCP helper (`permission-mcp`, below)
//! that asks this server over HTTP; the question is shown in the chat and waits for the answer.
use pw_core::items::now_iso;
use pw_core::workspace::{err, HttpError, Workspace};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot};

const EDIT_TOOLS: [&str; 4] = ["Write", "Edit", "MultiEdit", "NotebookEdit"];
pub static PORT: OnceLock<u16> = OnceLock::new();

pub fn claude_command() -> String { std::env::var("CLAUDE_COMMAND").ok().filter(|c| !c.is_empty()).unwrap_or_else(|| "claude".into()) }

fn hex(n: usize) -> String {
    let mut b = vec![0u8; n];
    getrandom::getrandom(&mut b).expect("random numbers");
    b.iter().map(|x| format!("{x:02x}")).collect()
}

// ---------- environment and finding the program ----------
/// Windows: read the current PATH from the registry (Claude CLI may have been installed while the app runs).
fn fresh_windows_path() -> Option<String> {
    if !cfg!(windows) { return None; }
    static CACHE: Mutex<Option<(Instant, Option<String>)>> = Mutex::new(None);
    let mut c = CACHE.lock().unwrap();
    if let Some((at, v)) = c.as_ref() { if at.elapsed() < Duration::from_secs(60) { return v.clone(); } }
    let q = |key: &str| -> String {
        let mut cmd = std::process::Command::new("reg");
        cmd.args(["query", key, "/v", "Path"]).stdin(Stdio::null()).stderr(Stdio::null());
        #[cfg(windows)]
        { use std::os::windows::process::CommandExt; cmd.creation_flags(0x0800_0000); }
        let out = cmd.output().map(|o| String::from_utf8_lossy(&o.stdout).to_string()).unwrap_or_default();
        out.lines().find_map(|l| { let t = l.trim(); if !t.to_lowercase().starts_with("path") { return None; } let i = t.find("REG_")?; let rest = &t[i..]; rest.find(char::is_whitespace).map(|j| rest[j..].trim().to_string()) }).unwrap_or_default()
    };
    let expand = |v: String| -> String {
        let re = regex::Regex::new(r"%([^%]+)%").unwrap();
        re.replace_all(&v, |c: &regex::Captures| std::env::vars().find(|(k, _)| k.eq_ignore_ascii_case(&c[1])).map(|(_, v)| v).unwrap_or_else(|| c[0].to_string())).into_owned()
    };
    let fresh: Vec<String> = [q(r"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment"), q(r"HKCU\Environment")].into_iter().filter(|x| !x.is_empty()).map(expand).collect();
    let v = if fresh.is_empty() { None } else { Some(fresh.join(";")) };
    *c = Some((Instant::now(), v.clone()));
    v
}
pub fn current_env() -> Vec<(String, String)> {
    let mut env: Vec<(String, String)> = std::env::vars().collect();
    if let Some(fresh) = fresh_windows_path() {
        let k = env.iter().find(|(k, _)| k.eq_ignore_ascii_case("path")).map(|(k, _)| k.clone()).unwrap_or_else(|| "Path".into());
        let old = env.iter().find(|(x, _)| *x == k).map(|(_, v)| v.clone()).unwrap_or_default();
        let mut seen = std::collections::HashSet::new();
        let joined: Vec<String> = old.split(';').chain(fresh.split(';')).filter(|x| !x.is_empty() && seen.insert(x.to_lowercase())).map(|x| x.to_string()).collect();
        env.retain(|(x, _)| *x != k);
        env.push((k, joined.join(";")));
    }
    env
}
/// The program to start: a path as given, otherwise searched in PATH (on Windows also .cmd/.bat, like a shell).
pub fn find_program(name: &str, env: &[(String, String)]) -> PathBuf {
    if name.contains('/') || name.contains('\\') { return PathBuf::from(name); }
    let path = env.iter().find(|(k, _)| k.eq_ignore_ascii_case("path")).map(|(_, v)| v.clone()).unwrap_or_default();
    let exts: Vec<String> = if cfg!(windows) {
        env.iter().find(|(k, _)| k.eq_ignore_ascii_case("pathext")).map(|(_, v)| v.split(';').map(|e| e.to_lowercase()).collect()).unwrap_or_else(|| vec![".exe".into(), ".cmd".into(), ".bat".into()])
    } else { vec![String::new()] };
    for dir in std::env::split_paths(&path) {
        for e in &exts {
            let p = dir.join(format!("{name}{e}"));
            if p.is_file() { return p; }
        }
    }
    PathBuf::from(name)
}
fn command(program: &Path) -> tokio::process::Command {
    #[allow(unused_mut)]
    let mut c = tokio::process::Command::new(program);
    #[cfg(windows)]
    c.creation_flags(0x0800_0000);
    c
}

/// GET /api/claude. A working answer is kept for 5 minutes and only one check runs at a time,
/// so switching projects doesn't start Claude CLI again and again (its first start can be slow).
pub async fn claude_version() -> Value {
    static LAST: tokio::sync::Mutex<Option<(Instant, Value)>> = tokio::sync::Mutex::const_new(None);
    let mut last = LAST.lock().await;
    if let Some((at, v)) = last.as_ref() { if v["ok"] == true && at.elapsed() < Duration::from_secs(300) { return v.clone(); } }
    let env = current_env(); let name = claude_command();
    let mut c = command(&find_program(&name, &env));
    c.arg("--version").env_clear().envs(env).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    let v = match tokio::time::timeout(Duration::from_secs(45), c.output()).await {
        Ok(Ok(o)) if o.status.success() => json!({ "ok": true, "command": name, "version": String::from_utf8_lossy(&o.stdout).trim() }),
        Ok(Ok(o)) => json!({ "ok": false, "command": name, "error": String::from_utf8_lossy(&o.stderr).trim().lines().next().unwrap_or("Claude CLI failed") }),
        Ok(Err(e)) => json!({ "ok": false, "command": name, "error": e.to_string() }),
        Err(_) => json!({ "ok": false, "command": name, "error": "Claude CLI did not answer in time" }),
    };
    *last = Some((Instant::now(), v.clone()));
    v
}

fn login_hint(msg: &str) -> String {
    let re = regex::Regex::new(r"(?i)/login|not logged in|log in|invalid api key|authentication|unauthorized|oauth").unwrap();
    if !re.is_match(msg) { return msg.to_string(); }
    format!("{msg}\n\nClaude CLI says it is not signed in. Run `claude` in a terminal and sign in with /login. If you already did, start a new message; if it still fails, restart the app (Workspace → Quit, then start it again).")
}
fn permission_args(mode: &str, allowed: &[String]) -> Vec<String> {
    let mut a = vec![];
    if mode == "auto" { a.extend(["--permission-mode".into(), "acceptEdits".into()]); }
    if mode == "read-only" { a.extend(["--disallowedTools".into(), EDIT_TOOLS.iter().chain(["Bash"].iter()).copied().collect::<Vec<_>>().join(",")]); }
    let mut allow: Vec<String> = vec![];
    for t in allowed {
        let ok = !t.is_empty() && t.chars().all(|c| c.is_ascii_alphanumeric() || "_*():.- ".contains(c));
        if ok && !allow.contains(t) && !(mode == "read-only" && EDIT_TOOLS.contains(&t.as_str())) { allow.push(t.clone()); }
    }
    if !allow.is_empty() { a.extend(["--allowedTools".into(), allow.join(",")]); }
    a
}
fn summarize(input: &Value) -> String {
    if !input.is_object() { return String::new(); }
    let v = ["file_path", "path", "command", "pattern", "url", "query", "description"].iter().find_map(|k| input.get(*k).filter(|v| !v.is_null() && *v != "" && *v != false));
    let s = match v { Some(Value::String(s)) => s.clone(), Some(o) => o.to_string(), None => input.to_string() };
    s.chars().take(200).collect()
}
fn detail(tool: &str, input: &Value) -> String {
    let t = |v: &Value, n: usize| -> String { match v { Value::String(s) => s.chars().take(n).collect(), Value::Null => String::new(), o => o.to_string().chars().take(n).collect() } };
    match tool {
        "Bash" if !input["command"].is_null() => t(&input["command"], 2000),
        "Edit" | "MultiEdit" if !input["old_string"].is_null() => format!("- {}\n+ {}", t(&input["old_string"], 600), t(&input["new_string"], 600)),
        "Write" if !input["content"].is_null() => t(&input["content"], 1200),
        _ => String::new(),
    }
}

// ---------- the chat file ----------
struct ChatFile { path: PathBuf, chat: Value }
impl ChatFile {
    fn save(&mut self) {
        self.chat["updated"] = json!(now_iso());
        let _ = std::fs::write(&self.path, serde_json::to_string_pretty(&self.chat).unwrap());
    }
    fn allow_always(&mut self, tool: &str) {
        let list = self.chat["allowedTools"].as_array_mut();
        if let Some(l) = list { if !l.iter().any(|x| x == tool) { l.push(json!(tool)); self.save(); } }
    }
}

// ---------- turns that run in the background ----------
/// A turn keeps running when the screen goes to another page; its answer so far is kept here
/// (GET …/chat/<id> shows it, POST …/chat/<id>/stop stops it).
struct Live { reply: Value, permissions: Vec<Value>, stop: Option<oneshot::Sender<()>> }
fn live_map() -> &'static Mutex<HashMap<String, Live>> {
    static L: OnceLock<Mutex<HashMap<String, Live>>> = OnceLock::new();
    L.get_or_init(Default::default)
}
fn live_key(slug: &str, key: &str, id: &str) -> String { format!("{slug}/{key}/{id}") }
/// Sends an event to the screen (if it is still listening) and keeps the live answer up to date.
#[derive(Clone)]
struct Emitter { tx: mpsc::UnboundedSender<Value>, key: String }
impl Emitter {
    fn send(&self, ev: Value) -> Result<(), ()> {
        {
            let mut all = live_map().lock().unwrap();
            match ev["type"].as_str().unwrap_or("") {
                "done" | "error" => { all.remove(&self.key); }
                t => if let Some(l) = all.get_mut(&self.key) {
                    match t {
                        "text" => { let s = l.reply["text"].as_str().unwrap_or("").to_string() + ev["delta"].as_str().unwrap_or(""); l.reply["text"] = json!(s); }
                        "tool" => { if let Some(a) = l.reply["tools"].as_array_mut() { a.push(json!({ "id": ev["id"], "name": ev["name"], "input": ev["input"] })); } }
                        "tool_result" => { if let Some(x) = l.reply["tools"].as_array_mut().and_then(|a| a.iter_mut().find(|x| x["id"] == ev["id"])) { x["error"] = ev["error"].clone(); x["done"] = json!(true); } }
                        "permission" => l.permissions.push(ev.clone()),
                        "permission_done" => l.permissions.retain(|p| p["req"] != ev["req"]),
                        _ => {}
                    }
                },
            }
        }
        self.tx.send(ev).map_err(|_| ())
    }
}
/// GET /api/projects/<p>/f/<chat>/chat/<id>: is Claude still working on it, and what it has said so far.
pub fn live_status(slug: &str, key: &str, id: &str) -> Value {
    match live_map().lock().unwrap().get(&live_key(slug, key, id)) {
        Some(l) => json!({ "running": true, "reply": l.reply, "permissions": l.permissions }),
        None => json!({ "running": false }),
    }
}
/// POST /api/projects/<p>/f/<chat>/chat/<id>/stop
pub fn stop_turn(slug: &str, key: &str, id: &str) -> Value {
    let s = live_map().lock().unwrap().get_mut(&live_key(slug, key, id)).and_then(|l| l.stop.take());
    json!({ "ok": true, "stopped": s.map(|s| s.send(()).is_ok()).unwrap_or(false) })
}

// ---------- permission questions ----------
struct Turn {
    token: String,
    tx: Emitter,
    pending: HashMap<String, (String, oneshot::Sender<Value>)>,
    chat: Arc<Mutex<ChatFile>>,
}
fn turns() -> &'static Mutex<HashMap<String, Turn>> {
    static T: OnceLock<Mutex<HashMap<String, Turn>>> = OnceLock::new();
    T.get_or_init(Default::default)
}
/// POST /api/chat-permission/<turn> (from the helper, with the turn's token): waits for the answer.
pub async fn request_permission(turn: &str, token: &str, body: &Value) -> Value {
    let req = hex(6);
    let rx = {
        let mut all = turns().lock().unwrap();
        let Some(t) = all.get_mut(turn).filter(|t| !token.is_empty() && t.token == token) else { return json!({ "allow": false, "message": "This chat turn is over." }) };
        let (stx, srx) = oneshot::channel();
        let tool = body["tool"].as_str().unwrap_or("").to_string();
        // "Always allow in this chat" counts at once, also for the rest of this answer (e.g. every website for WebFetch)
        if !tool.is_empty() && t.chat.lock().unwrap().chat["allowedTools"].as_array().map(|a| a.iter().any(|x| x == tool.as_str())).unwrap_or(false) { return json!({ "allow": true }); }
        let input = body.get("input").cloned().unwrap_or(json!({}));
        t.pending.insert(req.clone(), (tool.clone(), stx));
        let _ = t.tx.send(json!({ "type": "permission", "turn": turn, "req": req, "tool": tool, "input": summarize(&input), "detail": detail(&tool, &input) }));
        srx
    };
    match tokio::time::timeout(Duration::from_secs(600), rx).await {
        Ok(Ok(a)) => a,
        Ok(Err(_)) => json!({ "allow": false, "message": "The chat turn ended." }),
        Err(_) => {
            if let Some(t) = turns().lock().unwrap().get_mut(turn) { t.pending.remove(&req); let _ = t.tx.send(json!({ "type": "permission_done", "req": req })); }
            json!({ "allow": false, "message": "No answer in time." })
        }
    }
}
/// POST /api/chat-permission/<turn>/<req>/answer (from the chat screen).
pub fn answer_permission(turn: &str, req: &str, body: &Value) -> Result<Value, HttpError> {
    let mut all = turns().lock().unwrap();
    let t = all.get_mut(turn).ok_or_else(|| err(404, "This question was already answered or has expired"))?;
    let (tool, tx) = t.pending.remove(req).ok_or_else(|| err(404, "This question was already answered or has expired"))?;
    let allow = body["allow"] == true;
    if allow && body["always"] == true && !tool.is_empty() { t.chat.lock().unwrap().allow_always(&tool); }
    let _ = tx.send(if allow { json!({ "allow": true }) } else { json!({ "allow": false, "message": "The person did not allow this." }) });
    let _ = t.tx.send(json!({ "type": "permission_done", "req": req, "allow": allow }));
    Ok(json!({ "ok": true }))
}

// ---------- one turn ----------
/// Starts one turn; the events come out of the returned channel until "done" or "error".
pub fn run_turn(ws: Arc<Workspace>, slug: &str, key: &str, body: &Value) -> Result<mpsc::UnboundedReceiver<Value>, HttpError> {
    let p = ws.load_project(slug)?;
    let f = p.feature(key)?;
    let def = f.def.clone().unwrap();
    if def["stores"] != "chat" { return Err(err(400, "Not a chat feature")); }
    let message = body["message"].as_str().map(|s| s.to_string()).unwrap_or_else(|| body["message"].to_string());
    let id = match body["chatId"].as_str().filter(|s| !s.is_empty()) {
        Some(i) => i.to_string(),
        None => {
            let title: String = message.lines().next().unwrap_or("").chars().take(60).collect();
            let title = if title.is_empty() { "Chat".to_string() } else { title };
            ws.create_item(slug, key, &json!({ "title": title }))?["id"].as_str().unwrap_or("").to_string()
        }
    };
    let file = pw_core::items::item_path(&p, f, &id)?;
    let lk = live_key(slug, key, &id);
    if live_map().lock().unwrap().contains_key(&lk) { return Err(err(409, "Claude is still working on this chat. Wait for the answer or stop it first.")); }
    let mut chat: Value = std::fs::read_to_string(&file).ok().and_then(|t| serde_json::from_str(&t).ok()).ok_or_else(|| err(404, format!("Item \"{id}\" not found")))?;
    let mut allowed: Vec<String> = chat["allowedTools"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
    for t in body["allowTools"].as_array().into_iter().flatten().filter_map(|x| x.as_str()) { if !allowed.iter().any(|a| a == t) { allowed.push(t.to_string()); } }
    chat["allowedTools"] = json!(allowed);
    if !chat["messages"].is_array() { chat["messages"] = json!([]); }
    chat["messages"].as_array_mut().unwrap().push(json!({ "role": "user", "text": message, "time": now_iso() }));
    let mode = def["permissions"].as_str().unwrap_or("ask").to_string();
    let session = chat["sessionId"].as_str().map(|s| s.to_string());
    let title = chat["title"].clone();
    let cf = Arc::new(Mutex::new(ChatFile { path: file, chat }));
    cf.lock().unwrap().save();

    let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
    {
        let mut all = live_map().lock().unwrap();
        all.insert(lk.clone(), Live { reply: json!({ "role": "assistant", "text": "", "tools": [] }), permissions: vec![], stop: Some(stop_tx) });
    }
    let (raw_tx, rx) = mpsc::unbounded_channel::<Value>();
    let tx = Emitter { tx: raw_tx, key: lk.clone() };
    let _ = tx.send(json!({ "type": "chat", "id": id, "title": title, "mode": mode }));

    // the prompt, with the project's notes on the first turn
    let mut prompt = message.clone();
    if session.is_none() {
        let ctx: Vec<String> = match &def["context"] { Value::Array(a) => a.iter().map(|x| x.as_str().unwrap_or("").to_string()).collect(), Value::String(s) if !s.is_empty() => vec![s.clone()], _ => vec![] };
        let folders: Vec<String> = ctx.iter().filter_map(|k| p.features.iter().find(|x| x.key == *k).and_then(|x| x.def.as_ref()).map(|d| format!("{}/", d["folder"].as_str().unwrap_or("")))).collect();
        if !folders.is_empty() { prompt = format!("(Workspace note: this project keeps its main content in {} — look there first when relevant.)\n\n{prompt}", folders.join(", ")); }
        if let Some(i) = def["instructions"].as_str().filter(|i| !i.trim().is_empty()) { prompt = format!("(Project instructions: {})\n\n{prompt}", i.trim()); }
    }
    // engine: lmstudio — a model in LM Studio answers instead of Claude CLI (plan LMSTUDIO)
    if def["engine"].as_str().map(|e| e.trim().eq_ignore_ascii_case("lmstudio")).unwrap_or(false) {
        let first = cf.lock().unwrap().chat["lmHistory"].as_array().map(|a| a.is_empty()).unwrap_or(true);
        let text = if first { prompt } else { message.clone() };
        tokio::spawn(lm_turn(p.dir.clone(), def.clone(), id.clone(), mode.clone(), text, cf.clone(), tx.clone(), stop_rx));
        return Ok(rx);
    }
    let mut args: Vec<String> = ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages"].iter().map(|s| s.to_string()).collect();
    if let Some(s) = &session { args.extend(["--resume".into(), s.clone()]); }
    if let Some(m) = def["model"].as_str().filter(|m| !m.is_empty()) { args.extend(["--model".into(), m.chars().filter(|c| c.is_alphanumeric() || "_.-".contains(*c)).collect()]); }
    // headless runs don't show the "trust project MCP servers" prompt: pass the project's servers explicitly
    let mcp_text = std::fs::read_to_string(p.dir.join(".mcp.json")).unwrap_or_default();
    let mut configs: Vec<String> = vec![];
    if serde_json::from_str::<Value>(&mcp_text).ok().and_then(|v| v["mcpServers"].as_object().map(|o| !o.is_empty())).unwrap_or(false) { configs.push(".mcp.json".into()); }
    let turn_id = hex(8);
    let mut perm_file: Option<PathBuf> = None;
    if mode == "ask" {
        if let Some(port) = PORT.get() {
            let token = hex(16);
            turns().lock().unwrap().insert(turn_id.clone(), Turn { token: token.clone(), tx: tx.clone(), pending: HashMap::new(), chat: cf.clone() });
            let pf = std::env::temp_dir().join(format!("pw-permission-{turn_id}.json"));
            let helper = std::env::current_exe().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
            let cfg = json!({ "mcpServers": { "pw_permission": { "type": "stdio", "command": helper, "args": ["permission-mcp"],
                "env": { "PW_PERMISSION_URL": format!("http://127.0.0.1:{port}/api/chat-permission/{turn_id}"), "PW_PERMISSION_TOKEN": token } } } });
            if write_private(&pf, &cfg.to_string()).is_ok() {
                configs.push(pf.to_string_lossy().to_string());
                perm_file = Some(pf);
                args.extend(["--permission-prompt-tool".into(), "mcp__pw_permission__approve".into()]);
            }
        }
    }
    // programs of the project (`programs:` in project.yaml, e.g. Blender): their MCP servers, and a note where to keep the results
    let mut prog_file: Option<PathBuf> = None;
    let (mut servers, mut notes, mut unknown) = (serde_json::Map::new(), Vec::<String>::new(), Vec::<String>::new());
    for k in pw_core::programs::listed(&p.meta) {
        match pw_core::programs::find(&k) {
            Some(pg) => {
                servers.insert(pg.key.to_string(), (pg.server)());
                let _ = std::fs::create_dir_all(p.dir.join(pg.key));
                notes.push(format!("{} (through its MCP server; keep {} in the folder {}/ of this project)", pg.name, pg.keep, pg.key));
            }
            None => unknown.push(k),
        }
    }
    if !servers.is_empty() {
        let pf = std::env::temp_dir().join(format!("pw-programs-{turn_id}.json"));
        if write_private(&pf, &json!({ "mcpServers": servers }).to_string()).is_ok() { configs.push(pf.to_string_lossy().to_string()); prog_file = Some(pf); }
    }
    if !notes.is_empty() { prompt = format!("(Workspace note: in this project you can work with {}.)\n\n{prompt}", notes.join("; ")); }
    let notice = if unknown.is_empty() { String::new() } else {
        format!("*Note: {} in `programs:` of project.yaml {} not known and is ignored.*\n\n", unknown.iter().map(|u| format!("\"{u}\"")).collect::<Vec<_>>().join(", "), if unknown.len() == 1 { "is" } else { "are" })
    };
    if !configs.is_empty() { args.push("--mcp-config".into()); args.extend(configs); }
    let mut all_allowed: Vec<String> = def["allowed_tools"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
    all_allowed.extend(allowed);
    args.extend(permission_args(&mode, &all_allowed));

    let mut env = current_env();
    env.extend(ws.secrets_env_for(&mcp_text).0);
    env.push(("FORCE_COLOR".into(), "0".into()));
    let name = claude_command();
    let program = find_program(&name, &env);
    let dir = p.dir.clone();

    tokio::spawn(async move {
        let cleanup = |turn_id: &str, perm_file: &Option<PathBuf>| {
            if let Some(t) = turns().lock().unwrap().remove(turn_id) {
                for (_, (_, s)) in t.pending { let _ = s.send(json!({ "allow": false, "message": "The chat turn ended." })); }
            }
            if let Some(f) = perm_file { let _ = std::fs::remove_file(f); }
            if let Some(f) = &prog_file { let _ = std::fs::remove_file(f); }
        };
        let mut reply = json!({ "role": "assistant", "text": "", "tools": [], "time": now_iso() });
        let finish = |reply: &mut Value, extra: Value| {
            if let Value::Object(o) = extra { for (k, v) in o { if !v.is_null() { reply[k] = v; } } }
            let mut c = cf.lock().unwrap();
            let keep = reply["text"] != "" || reply["tools"].as_array().map(|a| !a.is_empty()).unwrap_or(false) || !reply["error"].is_null() || reply["stopped"] == true
                || reply["denials"].as_array().map(|a| !a.is_empty()).unwrap_or(false);
            if keep { c.chat["messages"].as_array_mut().unwrap().push(reply.clone()); }
            c.save();
        };
        let mut cmd = command(&program);
        cmd.args(&args).current_dir(&dir).env_clear().envs(env).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let msg = if e.kind() == std::io::ErrorKind::NotFound { format!("Claude CLI was not found (command \"{name}\"). Install it and sign in, or set CLAUDE_COMMAND.") } else { e.to_string() };
                finish(&mut reply, json!({ "error": msg })); cleanup(&turn_id, &perm_file);
                let _ = tx.send(json!({ "type": "error", "message": msg }));
                return;
            }
        };
        if let Some(mut stdin) = child.stdin.take() { let _ = stdin.write_all(prompt.as_bytes()).await; drop(stdin); }
        let mut err_out = child.stderr.take().unwrap();
        let stderr_task = tokio::spawn(async move { let mut s = String::new(); let _ = err_out.read_to_string(&mut s).await; s });
        let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
        let (mut got_delta, mut finished, mut stopped) = (false, false, false);
        let text_push = |reply: &mut Value, t: &str| { let s = reply["text"].as_str().unwrap_or("").to_string() + t; reply["text"] = json!(s); };
        if !notice.is_empty() { text_push(&mut reply, &notice); let _ = tx.send(json!({ "type": "text", "delta": notice })); }
        loop {
            let line = tokio::select! {
                l = lines.next_line() => match l { Ok(Some(l)) => l, _ => break },
                // only Stop ends a turn early; leaving the page doesn't
                _ = &mut stop_rx => { kill_tree(&mut child).await; stopped = true; break; }
            };
            let Ok(ev) = serde_json::from_str::<Value>(line.trim()) else { continue };
            match ev["type"].as_str().unwrap_or("") {
                "system" if ev["subtype"] == "init" => {
                    if let Some(s) = ev["session_id"].as_str() { cf.lock().unwrap().chat["sessionId"] = json!(s); }
                    let _ = tx.send(json!({ "type": "status", "text": "Claude is working…", "model": ev["model"], "tools": ev["tools"].as_array().map(|a| a.len()) }));
                }
                "stream_event" => {
                    let e = &ev["event"];
                    if e["type"] == "content_block_delta" && e["delta"]["type"] == "text_delta" {
                        let t = e["delta"]["text"].as_str().unwrap_or("");
                        got_delta = true; text_push(&mut reply, t); let _ = tx.send(json!({ "type": "text", "delta": t }));
                    }
                }
                "assistant" => {
                    for b in ev["message"]["content"].as_array().cloned().unwrap_or_default() {
                        if b["type"] == "text" && !got_delta { if let Some(t) = b["text"].as_str().filter(|t| !t.is_empty()) { text_push(&mut reply, t); let _ = tx.send(json!({ "type": "text", "delta": t })); } }
                        if b["type"] == "tool_use" {
                            let t = json!({ "id": b["id"], "name": b["name"], "input": summarize(&b["input"]) });
                            reply["tools"].as_array_mut().unwrap().push(t.clone());
                            let mut e = t; e["type"] = json!("tool"); let _ = tx.send(e);
                        }
                    }
                    if got_delta {
                        got_delta = false;
                        let txt = reply["text"].as_str().unwrap_or("").to_string();
                        if !txt.is_empty() && !txt.ends_with('\n') { text_push(&mut reply, "\n\n"); let _ = tx.send(json!({ "type": "text", "delta": "\n\n" })); }
                    }
                }
                "user" => {
                    for b in ev["message"]["content"].as_array().cloned().unwrap_or_default() {
                        if b["type"] != "tool_result" { continue; }
                        let is_err = b["is_error"] == true;
                        if let Some(t) = reply["tools"].as_array_mut().unwrap().iter_mut().find(|x| x["id"] == b["tool_use_id"]) { t["error"] = json!(is_err); t["done"] = json!(true); }
                        let _ = tx.send(json!({ "type": "tool_result", "id": b["tool_use_id"], "error": is_err }));
                    }
                }
                "result" => {
                    if let Some(s) = ev["session_id"].as_str() { cf.lock().unwrap().chat["sessionId"] = json!(s); }
                    let denials: Vec<Value> = ev["permission_denials"].as_array().cloned().unwrap_or_default().iter().map(|d| json!({ "tool": d["tool_name"], "input": summarize(&d["tool_input"]) })).collect();
                    if reply["text"] == "" { if let Some(r) = ev["result"].as_str() { text_push(&mut reply, r); let _ = tx.send(json!({ "type": "text", "delta": r })); } }
                    let t = reply["text"].as_str().unwrap_or("").trim_end_matches('\n').to_string(); reply["text"] = json!(t);
                    let error = if ev["is_error"] == true { json!(login_hint(ev["result"].as_str().unwrap_or("Claude reported an error"))) } else { Value::Null };
                    if !finished { finished = true; cleanup(&turn_id, &perm_file); finish(&mut reply, json!({ "denials": denials, "cost": ev["total_cost_usd"], "error": error })); }
                    let _ = tx.send(json!({ "type": "done", "id": id, "denials": denials, "cost": ev["total_cost_usd"], "error": error, "mode": mode }));
                    // like 0.x: the stream ends with "done"
                    let _ = tokio::time::timeout(Duration::from_secs(5), child.wait()).await;
                    break;
                }
                _ => {}
            }
        }
        if !finished {
            let status = if stopped { None } else { child.wait().await.ok() };
            // what Claude CLI wrote on stderr (don't wait long: a process it started may still hold the pipe)
            let stderr = tokio::time::timeout(Duration::from_secs(3), stderr_task).await.ok().and_then(|r| r.ok()).unwrap_or_default();
            cleanup(&turn_id, &perm_file);
            let code = status.and_then(|s| s.code());
            if stopped || code.is_none() {
                finish(&mut reply, json!({ "stopped": true }));
                let _ = tx.send(json!({ "type": "done", "id": id, "stopped": true, "mode": mode }));
            } else {
                let tail: Vec<&str> = stderr.trim().lines().collect();
                let last = tail[tail.len().saturating_sub(3)..].join(" ");
                let msg = login_hint(&if last.is_empty() { format!("Claude CLI stopped (exit code {})", code.unwrap()) } else { last });
                finish(&mut reply, json!({ "error": msg }));
                let _ = tx.send(json!({ "type": "error", "message": msg }));
            }
        }
    });
    Ok(rx)
}

/// Stops Claude CLI and everything it started (on Windows `claude` is often a .cmd that starts node).
async fn kill_tree(child: &mut tokio::process::Child) {
    #[cfg(windows)]
    if let Some(pid) = child.id() {
        let mut c = tokio::process::Command::new("taskkill");
        c.args(["/pid", &pid.to_string(), "/T", "/F"]).stdout(Stdio::null()).stderr(Stdio::null()).creation_flags(0x0800_0000);
        let _ = c.status().await;
    }
    let _ = child.kill().await;
}

fn write_private(p: &Path, text: &str) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(p)?;
        f.write_all(text.as_bytes())
    }
    #[cfg(not(unix))]
    { std::fs::write(p, text) }
}

// ---------- the permission helper (`workspace-server permission-mcp`) ----------
/// Tiny MCP server on stdio that Claude CLI calls for `--permission-prompt-tool mcp__pw_permission__approve`.
/// It forwards the question to the app (PW_PERMISSION_URL with PW_PERMISSION_TOKEN) and waits for the answer.
pub fn permission_mcp_main() {
    use std::io::{BufRead, Write};
    let url = std::env::var("PW_PERMISSION_URL").unwrap_or_default();
    let token = std::env::var("PW_PERMISSION_TOKEN").unwrap_or_default();
    let send = |m: Value| { let mut o = std::io::stdout().lock(); let _ = writeln!(o, "{m}"); let _ = o.flush(); };
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let Ok(m) = serde_json::from_str::<Value>(line.trim()) else { continue };
        let id = m["id"].clone();
        match m["method"].as_str().unwrap_or("") {
            "initialize" => send(json!({ "jsonrpc": "2.0", "id": id, "result": { "protocolVersion": m["params"]["protocolVersion"].as_str().unwrap_or("2024-11-05"), "capabilities": { "tools": {} }, "serverInfo": { "name": "pw_permission", "version": "1" } } })),
            "tools/list" => send(json!({ "jsonrpc": "2.0", "id": id, "result": { "tools": [{ "name": "approve", "description": "Asks the person in the Project Workspace chat whether a tool may run.",
                "inputSchema": { "type": "object", "properties": { "tool_name": { "type": "string" }, "input": { "type": "object" }, "tool_use_id": { "type": "string" } }, "required": ["tool_name"] } }] } })),
            "tools/call" => {
                let a = &m["params"]["arguments"];
                let input = if a["input"].is_object() { a["input"].clone() } else { json!({}) };
                let r = ask(&url, &token, &json!({ "tool": a["tool_name"], "input": input, "toolUseId": a["tool_use_id"] }));
                let answer = if r["allow"] == true { json!({ "behavior": "allow", "updatedInput": input }) } else { json!({ "behavior": "deny", "message": r["message"].as_str().unwrap_or("The person did not allow this.") }) };
                send(json!({ "jsonrpc": "2.0", "id": id, "result": { "content": [{ "type": "text", "text": answer.to_string() }] } }));
            }
            _ => if !id.is_null() { send(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": "Method not found" } })) },
        }
    }
}
/// A plain HTTP/1.1 POST to the app on 127.0.0.1 (no TLS, no library needed).
fn ask(url: &str, token: &str, body: &Value) -> Value {
    use std::io::{Read, Write};
    let fail = |m: String| json!({ "allow": false, "message": m });
    let Some(rest) = url.strip_prefix("http://") else { return fail("The workspace could not be asked: bad address".into()) };
    let (host, path) = rest.split_once('/').map(|(h, p)| (h.to_string(), format!("/{p}"))).unwrap_or((rest.to_string(), "/".into()));
    let mut s = match std::net::TcpStream::connect(&host) { Ok(s) => s, Err(e) => return fail(format!("The workspace could not be asked: {e}")) };
    let _ = s.set_read_timeout(Some(Duration::from_secs(15 * 60)));
    let data = body.to_string();
    let req = format!("POST {path} HTTP/1.1\r\nHost: {host}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nX-PW-Token: {token}\r\nConnection: close\r\n\r\n{data}", data.len());
    if s.write_all(req.as_bytes()).is_err() { return fail("The workspace could not be asked.".into()); }
    let mut out = Vec::new();
    if s.read_to_end(&mut out).is_err() && out.is_empty() { return fail("No answer in time.".into()); }
    let text = String::from_utf8_lossy(&out);
    let Some((head, body)) = text.split_once("\r\n\r\n") else { return fail("No answer from the workspace.".into()) };
    let body = if head.to_lowercase().contains("transfer-encoding: chunked") { dechunk(body) } else { body.to_string() };
    serde_json::from_str(&body).unwrap_or_else(|_| fail("No answer from the workspace.".into()))
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


// ---------- engine: lmstudio (plan LMSTUDIO) ----------
// The chat talks to LM Studio's OpenAI-compatible API (/v1/chat/completions, streamed). The model gets the app's own tools:
// read, create/change, delete and list files inside the project folder, and run commands there. `permissions:` works as for
// Claude: ask (Allow · Always allow in this chat · Don't allow), auto (files without asking, commands ask), read-only.

/// (tool name for the model, name shown in the chat and used for "Always allow")
const LM_TOOLS: [(&str, &str); 5] = [("read_file", "Read"), ("write_file", "Write"), ("delete_file", "Delete"), ("list_files", "LS"), ("run_command", "Bash")];

fn lm_tool_defs() -> Value {
    let f = |name: &str, desc: &str, props: Value, req: Vec<&str>| json!({ "type": "function", "function": { "name": name, "description": desc,
        "parameters": { "type": "object", "properties": props, "required": req } } });
    json!([
        f("read_file", "Read a text file of the project. The path is relative to the project folder.", json!({ "path": { "type": "string" } }), vec!["path"]),
        f("write_file", "Create a file or replace its whole content. The path is relative to the project folder; missing folders are created.",
            json!({ "path": { "type": "string" }, "content": { "type": "string" } }), vec!["path", "content"]),
        f("delete_file", "Delete a file or folder of the project (it is moved to the project's .trash folder).", json!({ "path": { "type": "string" } }), vec!["path"]),
        f("list_files", "List the files and folders in a folder of the project (\".\" is the project folder).", json!({ "path": { "type": "string" } }), vec![]),
        f("run_command", "Run a shell command in the project folder and get its output.", json!({ "command": { "type": "string" } }), vec!["command"]),
    ])
}

fn lm_path(dir: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.trim();
    let rel = if rel.is_empty() || rel == "." || rel == "./" { "" } else { rel };
    if Path::new(rel).is_absolute() || rel.starts_with('/') || rel.starts_with('\\') || rel.contains(':') { return Err("Use a path relative to the project folder".into()); }
    pw_core::workspace::safe_join(dir, rel).map_err(|_| "That path is outside the project folder".to_string())
}

async fn lm_run_tool(dir: &Path, name: &str, a: &Value) -> (bool, String) {
    let s = |k: &str| a[k].as_str().unwrap_or("").to_string();
    match name {
        "read_file" => match lm_path(dir, &s("path")) {
            Ok(p) if p.is_dir() => (false, "That is a folder; use list_files".into()),
            Ok(p) => match std::fs::read(&p) {
                Ok(b) => { let t = String::from_utf8_lossy(&b).to_string(); let n = t.chars().count(); (true, if n > 100_000 { t.chars().take(100_000).collect::<String>() + "\n…(cut)" } else { t }) }
                Err(e) => (false, format!("Can't read it: {e}")),
            },
            Err(e) => (false, e),
        },
        "write_file" => match lm_path(dir, &s("path")) {
            Ok(p) if s("path").trim().is_empty() || p.is_dir() => (false, "Give a file path".into()),
            Ok(p) => {
                if let Some(parent) = p.parent() { let _ = std::fs::create_dir_all(parent); }
                let c = s("content");
                match std::fs::write(&p, &c) { Ok(_) => (true, format!("Saved {} ({} bytes)", s("path"), c.len())), Err(e) => (false, format!("Can't save it: {e}")) }
            }
            Err(e) => (false, e),
        },
        "delete_file" => match lm_path(dir, &s("path")) {
            Ok(p) if p == dir => (false, "The project folder itself can't be deleted".into()),
            Ok(p) if !p.exists() => (false, "Not found".into()),
            Ok(p) => {
                let trash = dir.join(".trash"); let _ = std::fs::create_dir_all(&trash);
                let base = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "item".into());
                let mut target = trash.join(&base); let mut n = 2;
                while target.exists() { target = trash.join(format!("{base}-{n}")); n += 1; }
                match std::fs::rename(&p, &target) { Ok(_) => (true, format!("Deleted {} (moved to .trash)", s("path"))), Err(e) => (false, format!("Can't delete it: {e}")) }
            }
            Err(e) => (false, e),
        },
        "list_files" => match lm_path(dir, &s("path")) {
            Ok(p) => match std::fs::read_dir(&p) {
                Ok(rd) => {
                    let mut v: Vec<String> = rd.flatten().map(|e| { let n = e.file_name().to_string_lossy().to_string(); if e.path().is_dir() { n + "/" } else { n } }).collect();
                    v.sort(); v.truncate(500);
                    (true, if v.is_empty() { "(empty)".into() } else { v.join("\n") })
                }
                Err(e) => (false, format!("Can't list it: {e}")),
            },
            Err(e) => (false, e),
        },
        "run_command" => {
            let cmdline = s("command");
            if cmdline.trim().is_empty() { return (false, "No command".into()); }
            let env = current_env();
            let mut c = if cfg!(windows) { let mut c = command(Path::new("cmd")); c.arg("/C").arg(&cmdline); c } else { let mut c = command(Path::new("sh")); c.arg("-c").arg(&cmdline); c };
            c.current_dir(dir).env_clear().envs(env).stdin(Stdio::null()).kill_on_drop(true);
            match tokio::time::timeout(Duration::from_secs(120), c.output()).await {
                Ok(Ok(o)) => {
                    let mut t = String::from_utf8_lossy(&o.stdout).to_string() + &String::from_utf8_lossy(&o.stderr);
                    if t.chars().count() > 20_000 { t = t.chars().take(20_000).collect::<String>() + "\n…(cut)"; }
                    (o.status.success(), format!("exit code {}\n{}", o.status.code().unwrap_or(-1), t))
                }
                Ok(Err(e)) => (false, format!("Can't run it: {e}")),
                Err(_) => (false, "Stopped after 120 seconds".into()),
            }
        }
        _ => (false, format!("Unknown tool \"{name}\"")),
    }
}

async fn lm_turn(dir: PathBuf, def: Value, id: String, mode: String, text: String, cf: Arc<Mutex<ChatFile>>, tx: Emitter, mut stop_rx: oneshot::Receiver<()>) {
    let url = def["url"].as_str().map(|u| u.trim().trim_end_matches('/').to_string()).filter(|u| !u.is_empty()).unwrap_or_else(|| "http://127.0.0.1:1234".into());
    let url = url.trim_end_matches("/v1").to_string();
    let model = def["model"].as_str().unwrap_or("").trim().to_string();
    let mut reply = json!({ "role": "assistant", "text": "", "tools": [], "time": now_iso() });
    let push_text = |reply: &mut Value, t: &str| { let s = reply["text"].as_str().unwrap_or("").to_string() + t; reply["text"] = json!(s); };
    let mut history: Vec<Value> = cf.lock().unwrap().chat["lmHistory"].as_array().cloned().unwrap_or_default();
    if history.is_empty() {
        history.push(json!({ "role": "system", "content": "You work in a project folder of the app Workspace. Use the tools to read, create, change and delete the project's files and to run commands; paths are relative to the project folder. Answer in the language of the user, clearly and briefly." }));
    }
    history.push(json!({ "role": "user", "content": text }));
    // permission questions use the same way as for Claude (POST /api/chat-permission/<turn>/<req>/answer)
    let (turn_id, token) = (hex(8), hex(16));
    turns().lock().unwrap().insert(turn_id.clone(), Turn { token: token.clone(), tx: tx.clone(), pending: HashMap::new(), chat: cf.clone() });
    let (mut error, mut stopped) = (Value::Null, false);
    let _ = tx.send(json!({ "type": "status", "text": "LM Studio is working…", "model": model }));
    if model.is_empty() { error = json!("Set the LM Studio model in project.yaml: model: under the chat (e.g. model: qwen/qwen3-coder-30b)."); }
    let tools = lm_tool_defs();
    let client = reqwest::Client::builder().connect_timeout(Duration::from_secs(10)).build().unwrap_or_else(|_| reqwest::Client::new());
    'turn: for _step in 0..30 {
        if !error.is_null() { break; }
        let req = client.post(format!("{url}/v1/chat/completions")).json(&json!({ "model": model, "messages": history, "tools": tools, "stream": true })).send();
        let resp = tokio::select! { r = req => r, _ = &mut stop_rx => { stopped = true; break 'turn; } };
        let mut resp = match resp {
            Err(e) => { error = json!(format!("LM Studio can't be reached at {url}. Start LM Studio and turn on its server (Developer → Start server), and check url: in project.yaml. ({e})")); break; }
            Ok(r) if !r.status().is_success() => {
                let code = r.status().as_u16(); let body = r.text().await.unwrap_or_default();
                let msg = serde_json::from_str::<Value>(&body).ok().and_then(|v| v["error"]["message"].as_str().or(v["error"].as_str()).map(|s| s.to_string())).unwrap_or(body);
                let low = msg.to_lowercase();
                error = json!(if low.contains("model") && (low.contains("not") || low.contains("load") || low.contains("found")) {
                    format!("The model \"{model}\" is not loaded in LM Studio. Load it in LM Studio (or fix model: in project.yaml) and try again. LM Studio says: {msg}")
                } else { format!("LM Studio answered with an error ({code}): {msg}") });
                break;
            }
            Ok(r) => r,
        };
        let (mut buf, mut content) = (String::new(), String::new());
        let mut calls: Vec<(String, String, String)> = vec![];
        loop {
            let chunk = tokio::select! { c = resp.chunk() => c, _ = &mut stop_rx => { stopped = true; break 'turn; } };
            match chunk { Ok(Some(b)) => buf.push_str(&String::from_utf8_lossy(&b)), _ => break }
            while let Some(i) = buf.find('\n') {
                let line = buf[..i].trim().to_string(); buf = buf[i + 1..].to_string();
                let Some(d) = line.strip_prefix("data:") else { continue };
                let d = d.trim(); if d == "[DONE]" || d.is_empty() { continue; }
                let Ok(v) = serde_json::from_str::<Value>(d) else { continue };
                if let Some(m) = v["error"]["message"].as_str().or(v["error"].as_str()) { error = json!(format!("LM Studio: {m}")); break 'turn; }
                let delta = &v["choices"][0]["delta"];
                if let Some(t) = delta["content"].as_str().filter(|t| !t.is_empty()) { content.push_str(t); push_text(&mut reply, t); let _ = tx.send(json!({ "type": "text", "delta": t })); }
                for tc in delta["tool_calls"].as_array().cloned().unwrap_or_default() {
                    let i = tc["index"].as_u64().unwrap_or(calls.len() as u64) as usize;
                    while calls.len() <= i { calls.push((String::new(), String::new(), String::new())); }
                    if let Some(x) = tc["id"].as_str() { calls[i].0 = x.to_string(); }
                    if let Some(x) = tc["function"]["name"].as_str() { calls[i].1.push_str(x); }
                    if let Some(x) = tc["function"]["arguments"].as_str() { calls[i].2.push_str(x); }
                }
            }
        }
        calls.retain(|c| !c.1.is_empty());
        for (n, c) in calls.iter_mut().enumerate() { if c.0.is_empty() { c.0 = format!("call_{}_{n}", hex(4)); } }
        let mut msg = json!({ "role": "assistant", "content": if content.is_empty() { Value::Null } else { json!(content) } });
        if !calls.is_empty() { msg["tool_calls"] = json!(calls.iter().map(|(i, n, a)| json!({ "id": i, "type": "function", "function": { "name": n, "arguments": a } })).collect::<Vec<_>>()); }
        history.push(msg);
        if calls.is_empty() { break; }
        if !content.is_empty() && !content.ends_with('\n') { push_text(&mut reply, "\n\n"); let _ = tx.send(json!({ "type": "text", "delta": "\n\n" })); }
        for (cid, name, raw) in calls {
            let shown = LM_TOOLS.iter().find(|(t, _)| *t == name).map(|(_, s)| *s).unwrap_or(name.as_str()).to_string();
            let args: Value = serde_json::from_str(if raw.trim().is_empty() { "{}" } else { &raw }).unwrap_or(Value::Null);
            let t = json!({ "id": cid, "name": shown, "input": summarize(&args) });
            reply["tools"].as_array_mut().unwrap().push(t.clone());
            let mut e = t; e["type"] = json!("tool"); let _ = tx.send(e);
            let (ok, out) = if args.is_null() { (false, "The arguments are not valid JSON".to_string()) } else {
                // None = allowed, Some(false) = refused by permissions:, Some(true) = ask
                let ask: Option<bool> = match shown.as_str() {
                    "Read" | "LS" => None,
                    "Write" | "Delete" => if mode == "read-only" { Some(false) } else if mode == "auto" { None } else { Some(true) },
                    _ => if mode == "read-only" { Some(false) } else { Some(true) },
                };
                let allowed = match ask {
                    None => Ok(()),
                    Some(false) => Err("Not allowed: this chat can only read (permissions: read-only).".to_string()),
                    Some(true) => {
                        let ans = tokio::select! { a = request_permission(&turn_id, &token, &json!({ "tool": shown, "input": args })) => a, _ = &mut stop_rx => { stopped = true; break 'turn; } };
                        if ans["allow"] == true { Ok(()) } else { Err(ans["message"].as_str().unwrap_or("Not allowed.").to_string()) }
                    }
                };
                match allowed { Ok(()) => lm_run_tool(&dir, &name, &args).await, Err(m) => (false, m) }
            };
            if let Some(x) = reply["tools"].as_array_mut().unwrap().iter_mut().find(|x| x["id"] == cid.as_str()) { x["error"] = json!(!ok); x["done"] = json!(true); }
            let _ = tx.send(json!({ "type": "tool_result", "id": cid, "error": !ok }));
            history.push(json!({ "role": "tool", "tool_call_id": cid, "content": out }));
        }
    }
    if let Some(t) = turns().lock().unwrap().remove(&turn_id) {
        for (_, (_, s)) in t.pending { let _ = s.send(json!({ "allow": false, "message": "The chat turn ended." })); }
    }
    let t = reply["text"].as_str().unwrap_or("").trim_end_matches('\n').to_string(); reply["text"] = json!(t);
    if !error.is_null() { reply["error"] = error.clone(); }
    if stopped { reply["stopped"] = json!(true); }
    {
        let mut c = cf.lock().unwrap();
        let keep = reply["text"] != "" || reply["tools"].as_array().map(|a| !a.is_empty()).unwrap_or(false) || !error.is_null() || stopped;
        if keep { c.chat["messages"].as_array_mut().unwrap().push(reply.clone()); }
        // keep the conversation for the next turn (the system message and the last 200 messages)
        if history.len() > 201 { let sys = history[0].clone(); let tail = history.split_off(history.len() - 200); history = std::iter::once(sys).chain(tail).collect(); }
        c.chat["lmHistory"] = json!(history);
        c.chat["engine"] = json!("lmstudio");
        c.save();
    }
    let _ = tx.send(json!({ "type": "done", "id": id, "error": error, "stopped": stopped, "mode": mode }));
}
