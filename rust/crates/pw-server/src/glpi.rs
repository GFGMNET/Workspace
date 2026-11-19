//! Ticket feature (docs/plans/TICKETSYSTEM.md): the tickets of a project from GLPI 11 over its REST API (apirest.php),
//! the same calls as the plan's check (docs/plans/checks/glpi-check.js).
//! A project's tickets are the tickets of the GLPI category with the project's name (decision 2); a missing category is
//! created (decision 11). Settings come from the feature in project.yaml: url, user, user_token, app_token — the tokens as
//! ${secret:…} from the app's secrets (decisions 7, 13); they are never written anywhere.
use pw_core::workspace::{err, HttpError, Project, Workspace};
use serde_json::{json, Value};
use std::time::Duration;

/// GLPI's ticket states (Ticket::INCOMING … Ticket::CLOSED).
pub fn state_name(n: i64) -> &'static str {
    match n { 1 => "New", 2 => "In progress (assigned)", 3 => "In progress (planned)", 4 => "Pending", 5 => "Solved", 6 => "Closed", _ => "Unknown" }
}

struct Glpi { api: String, app: String, session: String }

impl Glpi {
    async fn open(ws: &Workspace, def: &Value) -> Result<Glpi, HttpError> {
        let url = def["url"].as_str().unwrap_or("").trim().trim_end_matches('/').to_string();
        if !(url.starts_with("https://") || url.starts_with("http://")) {
            return Err(err(400, "Set the GLPI address in project.yaml, e.g.  ticket: { feature: ticketsystem, url: https://glpi.example.com, user: …, user_token: ${secret:glpi-user-token}, app_token: ${secret:glpi-app-token} }"));
        }
        let user_token = ws.secrets_resolve(def["user_token"].as_str().unwrap_or(""));
        if user_token.is_empty() || user_token.contains("${secret:") { return Err(err(400, "The GLPI user token is missing: set user_token: ${secret:…} in project.yaml and the secret in Settings → Secrets")); }
        let app = ws.secrets_resolve(def["app_token"].as_str().unwrap_or(""));
        let app = if app.contains("${secret:") { String::new() } else { app };
        let mut g = Glpi { api: format!("{url}/apirest.php"), app, session: String::new() };
        let r = g.req(reqwest::Method::GET, "/initSession", None, Some(format!("user_token {user_token}"))).await?;
        g.session = r["session_token"].as_str().unwrap_or("").to_string();
        if g.session.is_empty() { return Err(err(502, "GLPI did not open a session")); }
        Ok(g)
    }
    async fn req(&self, m: reqwest::Method, path: &str, body: Option<Value>, auth: Option<String>) -> Result<Value, HttpError> {
        let mut rq = crate::github::http().request(m, format!("{}{path}", self.api)).timeout(Duration::from_secs(30)).header("Content-Type", "application/json");
        if !self.app.is_empty() { rq = rq.header("App-Token", &self.app); }
        rq = match auth { Some(a) => rq.header("Authorization", a), None => rq.header("Session-Token", &self.session) };
        if let Some(b) = body { rq = rq.body(b.to_string()); }
        let r = rq.send().await.map_err(|e| err(502, format!("GLPI is not reachable: {e}")))?;
        let code = r.status().as_u16();
        let text = r.text().await.unwrap_or_default();
        let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        if code >= 400 {
            // GLPI answers ["ERROR_CODE", "message"]
            let msg = v.as_array().and_then(|a| a.get(1)).and_then(|m| m.as_str()).map(|s| s.to_string()).unwrap_or_else(|| format!("GLPI answered {code}"));
            return Err(err(if code == 401 || code == 403 { 403 } else if code == 404 { 404 } else { 502 }, format!("GLPI: {msg}")));
        }
        Ok(v)
    }
    async fn close(&self) { let _ = self.req(reqwest::Method::GET, "/killSession", None, None).await; }

    /// The id of the category with this name; created when missing (decision 11).
    async fn category(&self, name: &str) -> Result<i64, HttpError> {
        let q = format!("/ITILCategory?searchText[name]={}&range=0-200", enc(&format!("^{}$", regex_escape(name))));
        let found = self.req(reqwest::Method::GET, &q, None, None).await.unwrap_or(Value::Null);
        if let Some(id) = found.as_array().and_then(|a| a.iter().find(|c| c["name"].as_str() == Some(name))).and_then(|c| c["id"].as_i64()) { return Ok(id); }
        let c = self.req(reqwest::Method::POST, "/ITILCategory", Some(json!({ "input": { "name": name, "is_recursive": 1 } })), None).await
            .map_err(|e| err(e.status, format!("{} (creating the category \"{name}\")", e.message)))?;
        c["id"].as_i64().ok_or_else(|| err(502, "GLPI did not create the category"))
    }
    async fn ticket_raw(&self, id: i64) -> Result<Value, HttpError> { self.req(reqwest::Method::GET, &format!("/Ticket/{id}"), None, None).await }
    /// A ticket of this project's category, or 404 (tickets of other categories can't be opened from the project).
    async fn own_ticket(&self, cat: i64, id: i64) -> Result<Value, HttpError> {
        let t = self.ticket_raw(id).await?;
        if t["itilcategories_id"].as_i64() != Some(cat) { return Err(err(404, format!("Ticket #{id} does not belong to this project"))); }
        Ok(t)
    }
    async fn followups(&self, id: i64) -> Vec<Value> {
        self.req(reqwest::Method::GET, &format!("/Ticket/{id}/ITILFollowup?expand_dropdowns=true&range=0-500"), None, None).await
            .ok().and_then(|v| v.as_array().cloned()).unwrap_or_default()
    }
}

fn enc(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}
fn regex_escape(s: &str) -> String { s.chars().map(|c| if "\\^$.|?*+()[]{}".contains(c) { format!("\\{c}") } else { c.to_string() }).collect() }
fn text(v: &Value) -> String { v.as_str().map(html_to_text).unwrap_or_default() }
/// GLPI stores rich text as (escaped) HTML; the app shows plain text.
pub fn html_to_text(s: &str) -> String {
    let s = s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ");
    let s = regex::Regex::new(r"(?i)<br\s*/?>|</p>|</div>|</li>").unwrap().replace_all(&s, "\n");
    let s = regex::Regex::new(r"<[^>]*>").unwrap().replace_all(&s, "");
    s.replace("&amp;", "&").trim().to_string()
}
fn followup_view(f: &Value) -> Value {
    json!({ "id": f["id"], "user": f["users_id"], "date": f["date_creation"].as_str().or(f["date"].as_str()), "content": text(&f["content"]) })
}

fn def_of(p: &Project, key: &str) -> Result<Value, HttpError> { Ok(p.feature(key)?.def.clone().unwrap_or(json!({}))) }

/// GET …/tickets — the tickets of the project's category.
pub async fn list(ws: &Workspace, p: &Project, key: &str) -> Result<Value, HttpError> {
    let def = def_of(p, key)?;
    let g = Glpi::open(ws, &def).await?;
    let out = async {
        let cat = g.category(&p.name).await?;
        let q = format!("/search/Ticket?criteria[0][field]=7&criteria[0][searchtype]=equals&criteria[0][value]={cat}&forcedisplay[0]=2&forcedisplay[1]=1&forcedisplay[2]=12&forcedisplay[3]=15&forcedisplay[4]=19&sort=19&order=DESC&range=0-199");
        let r = g.req(reqwest::Method::GET, &q, None, None).await?;
        let rows = r["data"].as_array().cloned().unwrap_or_default();
        let ids: Vec<i64> = rows.iter().filter_map(|x| x["2"].as_i64().or_else(|| x["2"].as_str().and_then(|s| s.parse().ok()))).collect();
        let counts = futures_join(ids.iter().map(|id| g.followups(*id))).await;
        let tickets: Vec<Value> = rows.iter().zip(ids.iter()).zip(counts.iter()).map(|((x, id), f)| {
            let st = x["12"].as_i64().or_else(|| x["12"].as_str().and_then(|s| s.parse().ok())).unwrap_or(0);
            json!({ "id": id, "name": x["1"], "status": st, "state": state_name(st), "opened": x["15"], "updated": x["19"], "followups": f.len() })
        }).collect();
        Ok::<Value, HttpError>(json!({ "category": p.name, "tickets": tickets }))
    }.await;
    g.close().await;
    out
}

/// GET …/tickets/{id} — one ticket with its follow-ups and solution.
pub async fn one(ws: &Workspace, p: &Project, key: &str, id: i64) -> Result<Value, HttpError> {
    let def = def_of(p, key)?;
    let g = Glpi::open(ws, &def).await?;
    let out = async {
        let cat = g.category(&p.name).await?;
        let t = g.own_ticket(cat, id).await?;
        let f = g.followups(id).await;
        let sol = g.req(reqwest::Method::GET, &format!("/Ticket/{id}/ITILSolution?expand_dropdowns=true"), None, None).await.ok().and_then(|v| v.as_array().cloned()).unwrap_or_default();
        let st = t["status"].as_i64().unwrap_or(0);
        Ok::<Value, HttpError>(json!({ "id": id, "name": t["name"], "content": text(&t["content"]), "status": st, "state": state_name(st),
            "opened": t["date"], "updated": t["date_mod"],
            "followups": f.iter().map(followup_view).collect::<Vec<_>>(),
            "solution": sol.last().map(followup_view),
            "states": (1..=6).map(|n| json!({ "id": n, "name": state_name(n) })).collect::<Vec<_>>() }))
    }.await;
    g.close().await;
    out
}

/// POST …/tickets — a new ticket in the project's category.
pub async fn create(ws: &Workspace, p: &Project, key: &str, b: &Value) -> Result<Value, HttpError> {
    let name = b["name"].as_str().unwrap_or("").trim().to_string();
    if name.is_empty() { return Err(err(400, "The ticket needs a title")); }
    let def = def_of(p, key)?;
    let g = Glpi::open(ws, &def).await?;
    let out = async {
        let cat = g.category(&p.name).await?;
        let r = g.req(reqwest::Method::POST, "/Ticket", Some(json!({ "input": { "name": name, "content": b["content"].as_str().unwrap_or(""), "itilcategories_id": cat } })), None).await?;
        Ok::<Value, HttpError>(json!({ "id": r["id"] }))
    }.await;
    g.close().await;
    out
}

/// PATCH …/tickets/{id} — edit the text and/or set the state.
pub async fn update(ws: &Workspace, p: &Project, key: &str, id: i64, b: &Value) -> Result<Value, HttpError> {
    let mut input = serde_json::Map::new();
    if let Some(c) = b["content"].as_str() { input.insert("content".into(), json!(c)); }
    if let Some(n) = b["name"].as_str() { if !n.trim().is_empty() { input.insert("name".into(), json!(n.trim())); } }
    if let Some(s) = b["status"].as_i64() { if !(1..=6).contains(&s) { return Err(err(400, "Unknown state")); } input.insert("status".into(), json!(s)); }
    if input.is_empty() { return Err(err(400, "Nothing to change")); }
    let def = def_of(p, key)?;
    let g = Glpi::open(ws, &def).await?;
    let out = async {
        let cat = g.category(&p.name).await?;
        g.own_ticket(cat, id).await?;
        g.req(reqwest::Method::PUT, &format!("/Ticket/{id}"), Some(json!({ "input": Value::Object(input) })), None).await?;
        Ok::<Value, HttpError>(json!({ "ok": true }))
    }.await;
    g.close().await;
    out
}

/// POST …/tickets/{id}/followups or …/solution.
pub async fn add(ws: &Workspace, p: &Project, key: &str, id: i64, what: &str, b: &Value) -> Result<Value, HttpError> {
    let content = b["content"].as_str().unwrap_or("").trim().to_string();
    if content.is_empty() { return Err(err(400, "The text is empty")); }
    let itemtype = if what == "solution" { "ITILSolution" } else { "ITILFollowup" };
    let def = def_of(p, key)?;
    let g = Glpi::open(ws, &def).await?;
    let out = async {
        let cat = g.category(&p.name).await?;
        g.own_ticket(cat, id).await?;
        let r = g.req(reqwest::Method::POST, &format!("/{itemtype}"), Some(json!({ "input": { "itemtype": "Ticket", "items_id": id, "content": content } })), None).await?;
        Ok::<Value, HttpError>(json!({ "id": r["id"] }))
    }.await;
    g.close().await;
    out
}

/// Runs the futures one after the other in small groups (GLPI is a small server).
async fn futures_join<F: std::future::Future<Output = Vec<Value>>>(it: impl Iterator<Item = F>) -> Vec<Vec<Value>> {
    let mut out = vec![];
    for f in it { out.push(f.await); }
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn html_becomes_text() {
        assert_eq!(super::html_to_text("&lt;p&gt;Hello&lt;br&gt;World&lt;/p&gt;"), "Hello\nWorld");
        assert_eq!(super::html_to_text("plain &amp; simple"), "plain & simple");
    }
    #[test]
    fn regex_names_are_escaped() { assert_eq!(super::regex_escape("A.B (x)"), "A\\.B \\(x\\)"); }
}
