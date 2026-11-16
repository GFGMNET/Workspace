//! GitHub issues feature (app/lib/github.js): the issues of a repository from GitHub's REST API.
//! Public repos need no login; a token (settings.yaml → github: token:, or GITHUB_TOKEN) allows private
//! repos and a higher rate limit. Results are cached for 5 minutes.
use pw_core::workspace::{err, HttpError, Workspace};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const TTL: Duration = Duration::from_secs(300);
fn cache() -> &'static Mutex<HashMap<String, (Instant, Value)>> {
    static C: OnceLock<Mutex<HashMap<String, (Instant, Value)>>> = OnceLock::new();
    C.get_or_init(Default::default)
}
pub fn http() -> reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| reqwest::Client::builder().user_agent(concat!("project-workspace/", env!("CARGO_PKG_VERSION"))).build().expect("http client")).clone()
}
/// settings.yaml as JSON (empty when missing or broken).
pub fn settings(ws: &Workspace) -> Value {
    std::fs::read_to_string(ws.root.join("settings.yaml")).ok().and_then(|t| pw_core::yaml::parse(&t).ok()).filter(|v| v.is_object()).unwrap_or(json!({}))
}
fn token(ws: &Workspace) -> Option<String> {
    if let Ok(t) = std::env::var("GITHUB_TOKEN") { if !t.is_empty() { return Some(t); } }
    settings(ws)["github"]["token"].as_str().filter(|t| !t.is_empty()).map(|t| ws.secrets_resolve(t))
}
fn repo_ok(r: &str) -> bool {
    let mut parts = r.split('/');
    let ok = |p: Option<&str>| p.map(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c))).unwrap_or(false);
    ok(parts.next()) && ok(parts.next()) && parts.next().is_none()
}

pub async fn issues(ws: &Workspace, repo: &str, state: &str, refresh: bool) -> Result<Value, HttpError> {
    if !repo_ok(repo) { return Err(err(400, "Set the repository in project.yaml, e.g.  issues: { feature: github, repo: owner/name }")); }
    let state = if ["open", "closed", "all"].contains(&state) { state } else { "open" };
    let key = format!("{}|{state}", repo.to_lowercase());
    let hit = cache().lock().unwrap().get(&key).cloned();
    if let Some((at, data)) = &hit { if !refresh && at.elapsed() < TTL { let mut d = data.clone(); d["cached"] = json!(true); return Ok(d); } }
    let api = std::env::var("GITHUB_API").unwrap_or_else(|_| "https://api.github.com".into());
    let t = token(ws);
    let mut list = vec![];
    for page in 1..=3 {
        let mut req = http().get(format!("{api}/repos/{repo}/issues?state={state}&per_page=100&page={page}&sort=updated"))
            .header("Accept", "application/vnd.github+json").timeout(Duration::from_secs(15));
        if let Some(t) = &t { req = req.bearer_auth(t); }
        let r = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                if let Some((_, data)) = hit { let mut d = data; d["cached"] = json!(true); d["stale"] = json!(true); d["error"] = json!(format!("GitHub is not reachable: {e}")); return Ok(d); }
                return Err(err(502, format!("GitHub is not reachable: {e}")));
            }
        };
        let code = r.status().as_u16();
        if code == 404 { return Err(err(404, format!("Repository {repo} not found{}", if t.is_some() { "" } else { " (private? add a token in settings.yaml → github: token:)" }))); }
        if code == 403 || code == 429 { return Err(err(429, format!("GitHub rate limit reached — try again later{}", if t.is_some() { "" } else { ", or add a token in settings.yaml → github: token:" }))); }
        if !r.status().is_success() { return Err(err(502, format!("GitHub answered {code}"))); }
        let batch: Vec<Value> = r.json().await.map_err(|e| err(502, format!("GitHub answered something unexpected: {e}")))?;
        let n = batch.len();
        for i in batch {
            if !i["pull_request"].is_null() { continue; } // the issues API also returns pull requests
            list.push(json!({ "number": i["number"], "title": i["title"], "state": i["state"], "url": i["html_url"], "body": i["body"].as_str().unwrap_or(""),
                "user": i["user"]["login"], "labels": i["labels"].as_array().map(|a| a.iter().map(|l| json!({ "name": l["name"], "color": l["color"] })).collect::<Vec<_>>()).unwrap_or_default(),
                "comments": i["comments"], "created": i["created_at"], "updated": i["updated_at"], "closed": i["closed_at"] }));
        }
        if n < 100 { break; }
    }
    let fetched = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
    let data = json!({ "repo": repo, "state": state, "issues": list, "fetched": fetched });
    cache().lock().unwrap().insert(key, (Instant::now(), data.clone()));
    Ok(data)
}
