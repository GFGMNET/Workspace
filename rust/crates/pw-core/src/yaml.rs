//! YAML → JSON values, as the app reads them: several documents are merged (mappings),
//! anchors/aliases and `<<` merge keys are resolved, keys become strings.
//! Files that aren't valid YAML are read with the forgiving reader (lenient.rs) and a warning.
use crate::lenient;
use serde_json::{Map, Number, Value};
use yaml_rust2::{Yaml, YamlLoader};

#[derive(Debug, Clone)]
pub struct YamlError {
    pub line: Option<usize>,
    pub message: String,
}

impl std::fmt::Display for YamlError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.line {
            Some(l) => write!(f, "Line {}: {}", l, self.message),
            None => write!(f, "{}", self.message),
        }
    }
}

/// Parses YAML text. Returns the value and, when it was read leniently, the warning the app shows.
pub fn parse_with_info(text: &str) -> Result<(Value, Option<String>), YamlError> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let docs = match YamlLoader::load_from_str(text) {
        Ok(d) => d,
        Err(e) => {
            let full = YamlError { line: Some(e.marker().line()), message: e.info().to_string() };
            // like 0.x: duplicate keys are allowed (the last one wins), other mistakes are read leniently with a warning
            let duplicate = full.message.to_lowercase().contains("duplicate");
            return match lenient::parse(text) {
                Ok(v) => Ok((v, if duplicate { None } else { Some(format!("Not valid YAML ({full}) — read leniently. Fix it to be safe.")) })),
                Err(_) => Err(full),
            };
        }
    };
    let values: Vec<Value> = docs.iter().map(to_json).filter(|v| !v.is_null()).collect();
    let value = if values.is_empty() {
        Value::Null
    } else if values.len() > 1 && values.iter().all(|v| v.is_object()) {
        let mut m = Map::new();
        for v in values {
            if let Value::Object(o) = v {
                for (k, x) in o {
                    m.insert(k, x);
                }
            }
        }
        Value::Object(m)
    } else {
        values.into_iter().next().unwrap()
    };
    Ok((value, None))
}

pub fn parse(text: &str) -> Result<Value, YamlError> {
    parse_with_info(text).map(|(v, _)| v)
}

pub fn stringify(v: &Value) -> String { lenient::stringify(v) }

/// Rewrites a mapping file with new values but keeps its comments, key order and style
/// (records saved from a form; app/lib/yaml.js updateMapping). Works on the text, key by key:
/// unchanged keys stay byte for byte, changed keys are rewritten (a trailing comment is kept),
/// removed keys go, new keys are added at the end.
pub fn update_mapping(text: &str, data: &Map<String, Value>) -> String {
    let orig = match parse(text) { Ok(Value::Object(o)) => o, _ => return stringify(&Value::Object(data.clone())) };
    let lines: Vec<&str> = text.split('\n').collect();
    // top-level blocks: (key, first line, end line exclusive); leading comment lines belong to the next key
    let mut starts: Vec<(String, usize)> = vec![];
    for (i, l) in lines.iter().enumerate() {
        if l.starts_with(' ') || l.starts_with('\t') || l.starts_with('#') || l.starts_with('-') || l.trim().is_empty() { continue; }
        if let Some(c) = lenient::key_re().captures(&lenient::strip_comment(l)) {
            if let Ok(k) = lenient::unquote_key(&c[1]) { starts.push((k, i)); }
        }
    }
    let mut out: Vec<String> = vec![];
    let head_end = starts.first().map(|s| s.1).unwrap_or(lines.len());
    out.extend(lines[..head_end].iter().map(|s| s.to_string()));
    for (n, (key, start)) in starts.iter().enumerate() {
        let mut end = starts.get(n + 1).map(|s| s.1).unwrap_or(lines.len());
        // comment/blank lines right before the next key belong to it
        let mut lead = end;
        while lead > start + 1 && (lines[lead - 1].starts_with('#') || lines[lead - 1].trim().is_empty()) && n + 1 < starts.len() { lead -= 1; }
        let trailing: Vec<String> = lines[lead..end].iter().map(|s| s.to_string()).collect();
        end = lead;
        match data.get(key) {
            None => {}
            Some(v) if orig.get(key) == Some(v) => out.extend(lines[*start..end].iter().map(|s| s.to_string())),
            Some(v) => {
                let first = lines[*start];
                let stripped = lenient::strip_comment(first);
                let comment = first[stripped.len().min(first.len())..].trim().to_string();
                let mut one = Map::new(); one.insert(key.clone(), v.clone());
                let mut block = lenient::stringify(&Value::Object(one));
                if block.ends_with('\n') { block.pop(); }
                let mut bl: Vec<String> = block.split('\n').map(|s| s.to_string()).collect();
                if !comment.is_empty() && bl.len() == 1 { bl[0] = format!("{} {}", bl[0], comment); }
                out.extend(bl);
            }
        }
        out.extend(trailing);
    }
    while out.last().map(|l| l.is_empty()).unwrap_or(false) { out.pop(); }
    let mut text_out = out.join("\n");
    let new: Map<String, Value> = data.iter().filter(|(k, _)| !orig.contains_key(*k)).map(|(k, v)| (k.clone(), v.clone())).collect();
    if !new.is_empty() { text_out.push('\n'); text_out.push_str(lenient::stringify(&Value::Object(new)).trim_end()); }
    text_out + "\n"
}

fn key_string(k: &Yaml) -> String {
    match k {
        Yaml::String(s) | Yaml::Real(s) => s.clone(),
        Yaml::Integer(i) => i.to_string(),
        Yaml::Boolean(b) => b.to_string(),
        Yaml::Null => "".to_string(),
        other => to_json(other).to_string(),
    }
}

fn to_json(y: &Yaml) -> Value {
    match y {
        Yaml::Null | Yaml::BadValue | Yaml::Alias(_) => Value::Null,
        Yaml::Boolean(b) => Value::Bool(*b),
        Yaml::Integer(i) => Value::Number((*i).into()),
        Yaml::Real(s) => s
            .parse::<f64>()
            .ok()
            .and_then(Number::from_f64)
            .map(Value::Number)
            .unwrap_or_else(|| Value::String(s.clone())),
        Yaml::String(s) => Value::String(s.clone()),
        Yaml::Array(a) => Value::Array(a.iter().map(to_json).collect()),
        Yaml::Hash(h) => {
            let mut out = Map::new();
            let mut merged = Map::new();
            for (k, v) in h.iter() {
                let key = key_string(k);
                if key == "<<" {
                    // merge keys: the mapping's own keys win
                    let sources: Vec<Value> = match to_json(v) {
                        Value::Array(a) => a,
                        other => vec![other],
                    };
                    for s in sources {
                        if let Value::Object(o) = s {
                            for (mk, mv) in o {
                                merged.entry(mk).or_insert(mv);
                            }
                        }
                    }
                } else {
                    out.insert(key, to_json(v));
                }
            }
            for (k, v) in merged {
                out.entry(k).or_insert(v);
            }
            Value::Object(out)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lenient_and_updates() {
        let (v, warn) = parse_with_info("name: Project 1\n wiki:\n  - some page\n").unwrap();
        assert!(warn.is_some()); assert_eq!(v["wiki"][0], "some page");
        let mut d = Map::new();
        d.insert("name".into(), Value::String("Router".into()));
        d.insert("ip".into(), Value::String("10.0.0.2".into()));
        d.insert("location".into(), Value::String("Office".into()));
        let out = update_mapping("# top\nname: Router # main\nip: 10.0.0.1 # fixed\nold: x\n", &d);
        assert!(out.contains("# top") && out.contains("# main") && out.contains("# fixed"), "{out}");
        assert_eq!(parse(&out).unwrap()["ip"], "10.0.0.2");
        assert!(parse(&out).unwrap().get("old").is_none());
        assert_eq!(parse(&out).unwrap()["location"], "Office");
    }
    #[test]
    fn merge_keys_and_documents() {
        let v = parse("d: &d\n  a: 1\nx:\n  <<: *d\n  b: 2\n").unwrap();
        assert_eq!(v["x"]["a"], 1);
        assert_eq!(v["x"]["b"], 2);
        let v = parse("name: a\n---\ndescription: b\n").unwrap();
        assert_eq!(v["name"], "a");
        assert_eq!(v["description"], "b");
    }
}
