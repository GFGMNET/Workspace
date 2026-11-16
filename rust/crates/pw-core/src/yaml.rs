//! YAML → JSON values, as the app reads them: several documents are merged (mappings),
//! anchors/aliases and `<<` merge keys are resolved, keys become strings.
//! The lenient reader for broken files (app/lib/yaml-lenient.js) is not ported yet (prototype).
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

/// Parses YAML text. Returns the value and whether it was read leniently (always false for now).
pub fn parse_with_info(text: &str) -> Result<(Value, bool), YamlError> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let docs = YamlLoader::load_from_str(text).map_err(|e| YamlError {
        line: Some(e.marker().line()),
        message: e.info().to_string(),
    })?;
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
    Ok((value, false))
}

pub fn parse(text: &str) -> Result<Value, YamlError> {
    parse_with_info(text).map(|(v, _)| v)
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
    fn merge_keys_and_documents() {
        let v = parse("d: &d\n  a: 1\nx:\n  <<: *d\n  b: 2\n").unwrap();
        assert_eq!(v["x"]["a"], 1);
        assert_eq!(v["x"]["b"], 2);
        let v = parse("name: a\n---\ndescription: b\n").unwrap();
        assert_eq!(v["name"], "a");
        assert_eq!(v["description"], "b");
    }
}
