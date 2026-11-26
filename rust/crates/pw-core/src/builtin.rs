//! Built-in features: restore the ones the user deleted, and update them when a new version comes with the program
//! (plan docs/plans/BUILTIN.md). A new version = a higher `version:` in the feature's YAML (none = 1). On an update the old
//! definition is kept as "<Name> (deprecated)" under `<key>_deprecated` (then `_deprecated_2`, …) and the projects that use it
//! keep it (only their `feature:` line changes); new projects get the new one; "Use the new version" switches one tab.
use crate::workspace::{err, Project, Result, Workspace};
use crate::yaml;
use regex::Regex;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::PathBuf;

fn version_of(text: &str) -> i64 {
    match yaml::parse(text).ok().as_ref().and_then(|v| v.get("version")) {
        Some(Value::Number(n)) => n.as_i64().unwrap_or(1),
        Some(Value::String(s)) => s.trim().parse().unwrap_or(1),
        _ => 1,
    }
}
fn name_of(text: &str, key: &str) -> String {
    yaml::parse(text).ok().and_then(|v| v["name"].as_str().map(|s| s.trim().to_string())).filter(|s| !s.is_empty()).unwrap_or_else(|| key.to_string())
}
/// `tasks_deprecated`, `tasks_deprecated_2` … → `tasks`
pub fn base_of_deprecated(feature: &str) -> Option<String> {
    let re = Regex::new(r"^(.+)_deprecated(_\d+)?$").unwrap();
    re.captures(feature).map(|c| c[1].to_string())
}

/// In a project.yaml text: every project feature that resolves to `from` gets `feature: <to>` (added or changed);
/// with `to` = None the `feature: <from>` line is removed (the key then means its own name). Everything else stays.
fn retarget(text: &str, from: &str, to: Option<&str>) -> (String, bool) {
    let top = Regex::new(r"^([A-Za-z0-9_-]+):\s*(#.*)?$").unwrap();
    let feat = Regex::new(r"^(\s+)feature:\s*([A-Za-z0-9_-]+)\s*(#.*)?$").unwrap();
    let mut lines: Vec<String> = text.split('\n').map(|l| l.to_string()).collect();
    let mut hit = false;
    let mut i = 0;
    while i < lines.len() {
        let Some(m) = top.captures(&lines[i]) else { i += 1; continue };
        let key = m[1].to_string();
        let (mut j, mut fline, mut indent) = (i + 1, None::<usize>, "  ".to_string());
        while j < lines.len() && (lines[j].starts_with(' ') || lines[j].starts_with('\t') || lines[j].trim().is_empty()) {
            if let Some(f) = feat.captures(&lines[j]) { fline = Some(j); indent = f[1].to_string(); }
            else if lines[j].trim_start() != lines[j] && !lines[j].trim().is_empty() && fline.is_none() { indent = lines[j][..lines[j].len() - lines[j].trim_start().len()].to_string(); }
            j += 1;
        }
        let current = fline.and_then(|n| feat.captures(&lines[n]).map(|c| c[2].to_string())).unwrap_or_else(|| key.clone());
        if current == from {
            match (fline, to) {
                (Some(n), Some(t)) if t == key => { lines.remove(n); }
                (Some(n), Some(t)) => { lines[n] = Regex::new(r"feature:\s*[A-Za-z0-9_-]+").unwrap().replace(&lines[n], format!("feature: {t}")).to_string(); }
                (None, Some(t)) if t != key => { lines.insert(i + 1, format!("{indent}feature: {t}")); }
                (Some(n), None) => { lines.remove(n); }
                _ => {}
            }
            hit = true;
        }
        i += 1;
    }
    (lines.join("\n"), hit)
}

impl Workspace {
    fn starter_feature_files(&self) -> Vec<(String, PathBuf)> {
        let mut v: Vec<(String, PathBuf)> = fs::read_dir(self.starter_dir().join("features")).map(|rd| rd.flatten().filter_map(|e| {
            let n = e.file_name().to_string_lossy().to_string();
            n.strip_suffix(".yaml").map(|k| (k.to_string(), e.path()))
        }).collect()).unwrap_or_default();
        v.sort();
        v
    }
    fn project_files(&self) -> Vec<PathBuf> {
        let mut out = vec![];
        for e in fs::read_dir(self.projects_dir()).map(|rd| rd.flatten().collect::<Vec<_>>()).unwrap_or_default() {
            let slug = e.file_name().to_string_lossy().to_string();
            if slug.starts_with('_') || slug.starts_with('.') { continue; }
            if let Ok(p) = self.load_project(&slug) { out.push(p.file); }
        }
        out
    }

    /// At start: built-in features with a higher `version:` in the program than in data/features are updated
    /// (only ones that are there; a deleted one stays deleted). Returns the notes for the screen.
    pub(crate) fn update_builtins(&self) -> Vec<String> {
        let mut notes = vec![];
        let fd = self.features_dir();
        for (key, src) in self.starter_feature_files() {
            let target = fd.join(format!("{key}.yaml"));
            let (Ok(new), Ok(old)) = (fs::read_to_string(&src), fs::read_to_string(&target)) else { continue };
            if version_of(&new) <= version_of(&old) { continue; }
            let mut dep = format!("{key}_deprecated"); let mut n = 2;
            while fd.join(format!("{dep}.yaml")).exists() { dep = format!("{key}_deprecated_{n}"); n += 1; }
            let name = name_of(&old, &key);
            let name_re = Regex::new(r"(?m)^name:.*$").unwrap();
            let dep_text = if name_re.is_match(&old) { name_re.replace(&old, format!("name: {name} (deprecated)")).to_string() } else { format!("name: {name} (deprecated)\n{old}") };
            if fs::write(fd.join(format!("{dep}.yaml")), dep_text).is_err() { continue; }
            for pf in self.project_files() {
                let Ok(t) = fs::read_to_string(&pf) else { continue };
                let (nt, hit) = retarget(&t, &key, Some(&dep));
                if hit { let _ = fs::write(&pf, nt); }
            }
            if fs::write(&target, &new).is_ok() { notes.push(format!("{} has a new version. Your projects keep the old one until you switch.", name_of(&new, &key))); }
        }
        notes
    }

    /// Built-in features that are not in data/features (deleted by the user).
    pub fn missing_builtins(&self) -> Vec<Value> {
        let fd = self.features_dir();
        self.starter_feature_files().into_iter().filter(|(k, _)| {
            let old_names: &[&str] = if k == "issue" { &["github", "github_issue"] } else { &[] };
            !fd.join(format!("{k}.yaml")).exists() && !old_names.iter().any(|o| fd.join(format!("{o}.yaml")).exists())
        }).map(|(k, p)| json!({ "key": k, "name": fs::read_to_string(&p).map(|t| name_of(&t, &k)).unwrap_or(k.clone()) })).collect()
    }
    /// Puts the ticked built-in features back exactly as shipped.
    pub fn restore_builtins(&self, keys: &[String]) -> Result<Value> {
        let missing: Vec<String> = self.missing_builtins().iter().filter_map(|v| v["key"].as_str().map(|s| s.to_string())).collect();
        let mut done = vec![];
        for k in keys {
            if !missing.contains(k) { return Err(err(400, format!("\"{k}\" is not a missing built-in feature"))); }
            let src = self.starter_dir().join("features").join(format!("{k}.yaml"));
            fs::copy(&src, self.features_dir().join(format!("{k}.yaml"))).map_err(|e| err(500, e.to_string()))?;
            done.push(json!(k));
        }
        Ok(json!({ "restored": done }))
    }
    /// "Use the new version": the tab `key` of a project that uses `<base>_deprecated…` switches to `<base>`; its own settings stay.
    pub fn use_new_version(&self, slug: &str, key: &str) -> Result<Project> {
        let p = self.load_project(slug)?;
        let f = p.features.iter().find(|f| f.key == key).ok_or_else(|| err(404, "Not in project"))?;
        let base = base_of_deprecated(&f.feature).ok_or_else(|| err(400, "This tab already uses the current version"))?;
        if !self.features_dir().join(format!("{base}.yaml")).exists() { return Err(err(400, format!("The new version \"{base}\" is not there"))); }
        // only this tab: rewrite just its block
        let top = Regex::new(&format!(r"^{}:\s*(#.*)?$", regex::escape(key))).unwrap();
        let lines: Vec<&str> = p.yaml.split('\n').collect();
        let start = lines.iter().position(|l| top.is_match(l)).ok_or_else(|| err(400, "This tab can't be switched here — change feature: in project.yaml"))?;
        let mut end = start + 1;
        while end < lines.len() && (lines[end].starts_with(' ') || lines[end].starts_with('\t') || lines[end].trim().is_empty()) { end += 1; }
        let block = lines[start..end].join("\n");
        let (nb, _) = retarget(&block, &f.feature, Some(&base));
        let text = [lines[..start].join("\n"), nb, lines[end..].join("\n")].iter().filter(|s| !s.is_empty()).cloned().collect::<Vec<_>>().join("\n");
        let text = if p.yaml.ends_with('\n') && !text.ends_with('\n') { text + "\n" } else { text };
        fs::write(&p.file, text).map_err(|e| err(500, e.to_string()))?;
        self.load_project(slug)
    }

    fn state_file(&self) -> PathBuf { self.root.join(".workspace.json") }
    /// Notes for the screen after an update of built-in features (shown once).
    pub fn feature_notices(&self) -> Vec<Value> {
        fs::read_to_string(self.state_file()).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok())
            .and_then(|v| v["featureNotices"].as_array().cloned()).unwrap_or_default()
    }
    pub fn clear_feature_notices(&self) {
        let mut st: Map<String, Value> = fs::read_to_string(self.state_file()).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).and_then(|v| v.as_object().cloned()).unwrap_or_default();
        st.remove("featureNotices");
        let _ = fs::write(self.state_file(), serde_json::to_string_pretty(&Value::Object(st)).unwrap() + "\n");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retarget_keeps_comments() {
        let t = "name: X\n# notes\ntasks:\n  title: Mine   # own\nlater:\n  feature: tasks\nwiki: {}\n";
        let (o, hit) = retarget(t, "tasks", Some("tasks_deprecated"));
        assert!(hit);
        assert_eq!(o, "name: X\n# notes\ntasks:\n  feature: tasks_deprecated\n  title: Mine   # own\nlater:\n  feature: tasks_deprecated\nwiki: {}\n");
        let (back, _) = retarget(&o, "tasks_deprecated", Some("tasks"));
        assert_eq!(back, "name: X\n# notes\ntasks:\n  title: Mine   # own\nlater:\n  feature: tasks\nwiki: {}\n");
        assert_eq!(base_of_deprecated("tasks_deprecated_2").as_deref(), Some("tasks"));
        assert_eq!(version_of("name: A\nversion: 3\n"), 3);
        assert_eq!(version_of("name: A\n"), 1);
    }
}
