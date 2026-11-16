//! The forgiving YAML reader (port of app/lib/yaml-lenient.js) for files that aren't valid YAML,
//! e.g. sibling keys with shifted indentation (" wiki:" after "name: x"). Also: a small YAML writer.
use regex::Regex;
use serde_json::{Map, Number, Value};
use std::sync::OnceLock;

pub(crate) fn key_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r##"^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s'"#\-\[\]{},?][^:#]*?|-[^\s:][^:#]*?)\s*:(?:\s+(.*))?$"##).unwrap())
}
fn flow_pair_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r##"^("(?:[^"\\]|\\.)*"|'[^']*'|[^:]+?)\s*:\s*(.*)$"##).unwrap())
}
fn block_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"^[|>][+-]?\d*$").unwrap())
}
fn is_seq(t: &str) -> bool { t == "-" || t.starts_with("- ") || t.starts_with("-\t") }

pub(crate) fn strip_comment(text: &str) -> String {
    let (mut in_s, mut in_d) = (false, false);
    let chars: Vec<char> = text.chars().collect();
    for i in 0..chars.len() {
        let c = chars[i];
        if c == '\'' && !in_d { in_s = !in_s; }
        else if c == '"' && !in_s && (i == 0 || chars[i - 1] != '\\') { in_d = !in_d; }
        else if c == '#' && !in_s && !in_d && (i == 0 || chars[i - 1].is_whitespace()) {
            return chars[..i].iter().collect::<String>().trim_end().to_string();
        }
    }
    text.trim_end().to_string()
}

fn split_flow(s: &str) -> Vec<String> {
    let mut out = vec![];
    let (mut depth, mut cur, mut in_s, mut in_d) = (0i32, String::new(), false, false);
    for c in s.chars() {
        if c == '\'' && !in_d { in_s = !in_s; }
        if c == '"' && !in_s { in_d = !in_d; }
        if !in_s && !in_d {
            if c == '[' || c == '{' { depth += 1; }
            if c == ']' || c == '}' { depth -= 1; }
            if c == ',' && depth == 0 { out.push(cur.clone()); cur.clear(); continue; }
        }
        cur.push(c);
    }
    if !cur.trim().is_empty() { out.push(cur); }
    out.into_iter().map(|x| x.trim().to_string()).collect()
}

pub(crate) fn unquote_key(k: &str) -> Result<String, String> {
    let k = k.trim();
    if k.starts_with('"') { return serde_json::from_str::<String>(k).map_err(|e| e.to_string()); }
    if k.starts_with('\'') && k.len() >= 2 { return Ok(k[1..k.len() - 1].replace("''", "'")); }
    Ok(k.to_string())
}

fn all_digits(s: &str) -> bool { !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()) }

pub fn parse_scalar(raw: &str) -> Value {
    let s = raw.trim();
    if s.is_empty() || ["~", "null", "Null", "NULL"].contains(&s) { return Value::Null; }
    if s.len() >= 2 && s.starts_with('"') && s.ends_with('"') {
        return serde_json::from_str::<String>(s).map(Value::String).unwrap_or_else(|_| Value::String(s[1..s.len() - 1].to_string()));
    }
    if s.len() >= 2 && s.starts_with('\'') && s.ends_with('\'') { return Value::String(s[1..s.len() - 1].replace("''", "'")); }
    if s.starts_with('[') && s.ends_with(']') { return Value::Array(split_flow(&s[1..s.len() - 1]).iter().map(|x| parse_scalar(x)).collect()); }
    if s.starts_with('{') && s.ends_with('}') {
        let mut o = Map::new();
        for part in split_flow(&s[1..s.len() - 1]) {
            if let Some(m) = flow_pair_re().captures(&part) {
                if let Ok(k) = unquote_key(&m[1]) { o.insert(k, parse_scalar(&m[2])); }
            }
        }
        return Value::Object(o);
    }
    if ["true", "True", "TRUE", "yes", "Yes"].contains(&s) { return Value::Bool(true); }
    if ["false", "False", "FALSE", "no", "No"].contains(&s) { return Value::Bool(false); }
    let unsigned = s.strip_prefix(['-', '+']).unwrap_or(s);
    if all_digits(unsigned) && s.len() < 16 { if let Ok(i) = s.parse::<i64>() { return Value::Number(i.into()); } }
    if is_float(unsigned) { if let Some(n) = s.parse::<f64>().ok().and_then(Number::from_f64) { return Value::Number(n); } }
    Value::String(s.to_string())
}
fn is_float(u: &str) -> bool {
    // (\d+\.\d*|\.\d+)([eE][-+]?\d+)?
    let (mant, exp) = match u.find(['e', 'E']) { Some(i) => (&u[..i], Some(&u[i + 1..])), None => (u, None) };
    let ok_mant = match mant.find('.') {
        Some(i) => { let (a, b) = (&mant[..i], &mant[i + 1..]); (all_digits(a) && (b.is_empty() || all_digits(b))) || (a.is_empty() && all_digits(b)) }
        None => false,
    };
    let ok_exp = match exp { None => true, Some(e) => all_digits(e.strip_prefix(['-', '+']).unwrap_or(e)) };
    ok_mant && ok_exp
}

#[derive(Clone)]
struct Line { indent: usize, text: String }

struct P { raw: Vec<String>, lines: Vec<Option<Line>>, pos: usize }

impl P {
    fn peek(&mut self) -> Option<Line> {
        while self.pos < self.lines.len() && self.lines[self.pos].is_none() { self.pos += 1; }
        self.lines.get(self.pos).cloned().flatten()
    }
    fn block_scalar(&mut self, style: &str, parent: usize) -> Value {
        let keep = style.contains('+'); let strip = style.contains('-');
        let mut out: Vec<String> = vec![]; let mut bi: Option<usize> = None;
        while self.pos < self.raw.len() {
            let raw = self.raw[self.pos].clone();
            if raw.trim().is_empty() { out.push(String::new()); self.pos += 1; continue; }
            let ind = raw.len() - raw.trim_start_matches(' ').len();
            if ind <= parent { break; }
            let b = *bi.get_or_insert(ind);
            if ind < b { break; }
            out.push(raw[b..].to_string()); self.pos += 1;
        }
        let mut text = if style.starts_with('>') {
            let mut t = String::new();
            for (i, l) in out.iter().enumerate() {
                if l.is_empty() { t.push('\n'); } else { if i > 0 && !out[i - 1].is_empty() { t.push(' '); } t.push_str(l); }
            }
            t
        } else { out.join("\n") };
        if keep { return Value::String(text + "\n"); }
        while text.ends_with('\n') { text.pop(); }
        Value::String(if strip { text } else { text + "\n" })
    }
    fn value_after_key(&mut self, rest: Option<&str>, line_indent: usize) -> Result<Value, String> {
        match rest {
            None | Some("") => {
                let nxt = match self.peek() { Some(n) => n, None => return Ok(Value::Null) };
                if nxt.indent > line_indent { return self.node(); }
                if nxt.indent == line_indent && is_seq(&nxt.text) { return self.seq(line_indent); }
                Ok(Value::Null)
            }
            Some(r) if block_re().is_match(r) => { self.pos += 1; Ok(self.block_scalar(r, line_indent)) }
            Some(r) => { self.pos += 1; Ok(parse_scalar(r)) }
        }
    }
    fn node(&mut self) -> Result<Value, String> {
        let ln = match self.peek() { Some(l) => l, None => return Ok(Value::Null) };
        if is_seq(&ln.text) { return self.seq(ln.indent); }
        if key_re().is_match(&ln.text) { return self.map(ln.indent); }
        self.pos += 1;
        Ok(parse_scalar(&ln.text))
    }
    fn map(&mut self, ind: usize) -> Result<Value, String> {
        let mut obj = Map::new();
        let mut last_scalar = false;
        let mut sloppy: Vec<usize> = vec![];
        loop {
            let ln = match self.peek() { Some(l) => l, None => break };
            if ln.indent < ind { break; }
            if ln.indent > ind && !sloppy.contains(&ln.indent) {
                if !last_scalar { break; }
                sloppy.push(ln.indent);
            }
            if is_seq(&ln.text) { break; }
            let caps = key_re().captures(&ln.text).ok_or_else(|| format!("Line {}: expected \"key: value\"", self.pos + 1))?;
            let key = unquote_key(&caps[1])?;
            let rest = caps.get(2).map(|m| m.as_str().to_string());
            let empty = rest.as_deref().map(|r| r.is_empty()).unwrap_or(true);
            if empty { self.pos += 1; }
            let value = self.value_after_key(rest.as_deref(), ln.indent)?;
            last_scalar = !empty || value.is_null();
            obj.insert(key, value);
        }
        Ok(Value::Object(obj))
    }
    fn seq(&mut self, ind: usize) -> Result<Value, String> {
        let mut arr = vec![];
        loop {
            let ln = match self.peek() { Some(l) => l, None => break };
            if ln.indent != ind || !is_seq(&ln.text) { break; }
            let rest = ln.text[1..].trim_start().to_string();
            let offset = ln.text.len() - rest.len();
            if rest.is_empty() {
                self.pos += 1;
                let nxt = self.peek();
                arr.push(if nxt.map(|n| n.indent > ind).unwrap_or(false) { self.node()? } else { Value::Null });
            } else if is_seq(&rest) || key_re().is_match(&rest) {
                self.lines[self.pos] = Some(Line { indent: ind + offset, text: rest });
                arr.push(self.node()?);
            } else if block_re().is_match(&rest) {
                self.pos += 1; arr.push(self.block_scalar(&rest, ind));
            } else {
                self.pos += 1; arr.push(parse_scalar(&rest));
            }
        }
        Ok(Value::Array(arr))
    }
}

pub fn parse(src: &str) -> Result<Value, String> {
    let raw: Vec<String> = src.replace("\r\n", "\n").replace('\r', "\n").replace('\t', "  ").split('\n').map(|s| s.to_string()).collect();
    let lines = raw.iter().map(|r| {
        let t = r.trim_start_matches(' ');
        if t.is_empty() || t.starts_with('#') { return None; }
        if r.trim_end() == "---" || r.trim_end() == "..." { return None; }
        let indent = r.len() - t.len();
        Some(Line { indent, text: strip_comment(t) })
    }).collect();
    let mut p = P { raw, lines, pos: 0 };
    if p.peek().is_none() { return Ok(Value::Object(Map::new())); }
    let v = p.node()?;
    if p.peek().is_some() { return Err(format!("Line {}: unexpected text (check the indentation)", p.pos + 1)); }
    Ok(v)
}

// ---------- writer ----------
fn needs_quote(s: &str) -> bool {
    if s.is_empty() || s.starts_with(char::is_whitespace) || s.ends_with(char::is_whitespace) { return true; }
    if s.starts_with(['-', '?', ':', ',', '[', ']', '{', '}', '#', '&', '*', '!', '|', '>', '\'', '"', '%', '@', '`', '~']) { return true; }
    if s.contains(": ") || s.contains(" #") || s.contains("\t#") || s.ends_with(':') { return true; }
    if ["true", "false", "yes", "no", "null", "~"].contains(&s.to_lowercase().as_str()) { return true; }
    let u = s.strip_prefix(['-', '+']).unwrap_or(s);
    all_digits(u) || is_float(u) || (u.ends_with('.') && all_digits(&u[..u.len() - 1]))
}
fn scalar_out(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => if needs_quote(s) { serde_json::to_string(s).unwrap() } else { s.clone() },
        other => other.to_string(),
    }
}
fn block_lines(s: &str, indent: usize) -> String {
    let pad = " ".repeat(indent);
    s.trim_end_matches('\n').split('\n').map(|l| if l.is_empty() { String::new() } else { format!("{pad}{l}") }).collect::<Vec<_>>().join("\n")
}
fn is_scalar(v: &Value) -> bool { !v.is_array() && !v.is_object() }
fn write(value: &Value, indent: usize) -> String {
    let pad = " ".repeat(indent);
    match value {
        Value::Array(a) => {
            if a.is_empty() { return "[]".into(); }
            a.iter().map(|item| {
                if let Value::String(s) = item { if s.contains('\n') { return format!("{pad}- |\n{}", block_lines(s, indent + 2)); } }
                if is_scalar(item) { return format!("{pad}- {}", scalar_out(item)); }
                if item.is_array() { return format!("{pad}-\n{}", write(item, indent + 2)); }
                let body = write(item, indent + 2);
                if body == "{}" { return format!("{pad}- {{}}"); }
                format!("{pad}- {}", &body[indent + 2..])
            }).collect::<Vec<_>>().join("\n")
        }
        Value::Object(o) => {
            if o.is_empty() { return "{}".into(); }
            o.iter().map(|(k, v)| {
                let key = if needs_quote(k) { serde_json::to_string(k).unwrap() } else { k.clone() };
                if let Value::String(s) = v { if s.contains('\n') { return format!("{pad}{key}: |\n{}", block_lines(s, indent + 2)); } }
                if is_scalar(v) { return format!("{pad}{key}: {}", scalar_out(v)); }
                if let Value::Array(a) = v { if !a.is_empty() && a.iter().all(is_scalar) && k == "args" { return format!("{pad}{key}: [{}]", a.iter().map(scalar_out).collect::<Vec<_>>().join(", ")); } }
                let inner = write(v, indent + 2);
                if inner == "[]" || inner == "{}" { return format!("{pad}{key}: {inner}"); }
                format!("{pad}{key}:\n{inner}")
            }).collect::<Vec<_>>().join("\n")
        }
        other => format!("{pad}{}", scalar_out(other)),
    }
}
/// YAML text for a value (used for new records and changed keys).
pub fn stringify(v: &Value) -> String { write(v, 0) + "\n" }
pub fn stringify_at(v: &Value, indent: usize) -> String { write(v, indent) }

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn sloppy_original() {
        let v = parse("name: Project 1\n wiki:\n  - some page\n knowlege:\n  - kb entry\n").unwrap();
        assert_eq!(v, json!({ "name": "Project 1", "wiki": ["some page"], "knowlege": ["kb entry"] }));
    }
    #[test]
    fn scalars() {
        assert_eq!(parse_scalar("yes"), json!(true));
        assert_eq!(parse_scalar("12"), json!(12));
        assert_eq!(parse_scalar("1.5"), json!(1.5));
        assert_eq!(parse_scalar("'it''s'"), json!("it's"));
        assert_eq!(parse_scalar("{base}/?x={y}"), json!({}));
    }
    #[test]
    fn round_trip() {
        let v = json!({ "name": "a: b", "tags": ["x", "y"], "n": 3, "text": "l1\nl2" });
        assert_eq!(parse(&stringify(&v)).unwrap(), v);
    }
}
