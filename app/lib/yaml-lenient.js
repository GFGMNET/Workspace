// Minimal, dependency-free YAML subset parser/serializer.
// Supports: mappings, sequences (block + flow), sequences of mappings,
// quoted/plain scalars, numbers, booleans, null, comments, | and > block scalars.
// It is deliberately forgiving about sloppy indentation of sibling keys.
'use strict';

function stripComment(text) {
  let inS = false, inD = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS && text[i - 1] !== '\\') inD = !inD;
    else if (c === '#' && !inS && !inD && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).trimEnd();
  }
  return text.trimEnd();
}

function splitFlow(s) {
  const out = []; let depth = 0, cur = '', inS = false, inD = false;
  for (const c of s) {
    if (c === "'" && !inD) inS = !inS;
    if (c === '"' && !inS) inD = !inD;
    if (!inS && !inD) {
      if (c === '[' || c === '{') depth++;
      if (c === ']' || c === '}') depth--;
      if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    }
    cur += c;
  }
  if (cur.trim() !== '') out.push(cur);
  return out.map(x => x.trim());
}

const KEY_RE = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s'"#\-\[\]{},?][^:#]*?|-[^\s:][^:#]*?)\s*:(?:\s+(.*))?$/;

function unquoteKey(k) {
  k = k.trim();
  if (k.startsWith('"')) return JSON.parse(k);
  if (k.startsWith("'")) return k.slice(1, -1).replace(/''/g, "'");
  return k;
}

function parseScalar(raw) {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null;
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try { return JSON.parse(s); } catch { return s.slice(1, -1); }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  if (s.startsWith('[') && s.endsWith(']')) return splitFlow(s.slice(1, -1)).map(parseScalar);
  if (s.startsWith('{') && s.endsWith('}')) {
    const o = {};
    for (const part of splitFlow(s.slice(1, -1))) {
      const m = part.match(/^("(?:[^"\\]|\\.)*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/);
      if (m) o[unquoteKey(m[1])] = parseScalar(m[2]);
    }
    return o;
  }
  if (/^(true|True|TRUE|yes|Yes)$/.test(s)) return true;
  if (/^(false|False|FALSE|no|No)$/.test(s)) return false;
  if (/^[-+]?\d+$/.test(s) && s.length < 16) return parseInt(s, 10);
  if (/^[-+]?(\d+\.\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return parseFloat(s);
  return s;
}

function parse(src) {
  const rawLines = String(src).replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n');
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (/^\s*(#.*)?$/.test(raw)) { lines.push(null); continue; }
    if (/^(---|\.\.\.)\s*$/.test(raw)) { lines.push(null); continue; }
    const indent = raw.match(/^ */)[0].length;
    lines.push({ indent, text: stripComment(raw.slice(indent)), raw });
  }
  let pos = 0;
  const skip = () => { while (pos < lines.length && lines[pos] === null) pos++; };
  const peek = () => { skip(); return lines[pos]; };

  function blockScalar(style, parentIndent) {
    const keep = style.includes('+'), strip = style.includes('-');
    const out = []; let blockIndent = null;
    while (pos < rawLines.length) {
      const raw = rawLines[pos];
      if (raw.trim() === '') { out.push(''); pos++; continue; }
      const ind = raw.match(/^ */)[0].length;
      if (ind <= parentIndent) break;
      if (blockIndent === null) blockIndent = ind;
      if (ind < blockIndent) break;
      out.push(raw.slice(blockIndent)); pos++;
    }
    let text;
    if (style.startsWith('>')) {
      text = '';
      out.forEach((l, i) => { text += l === '' ? '\n' : (i && out[i - 1] !== '' ? ' ' : '') + l; });
    } else text = out.join('\n');
    if (keep) return text + '\n';
    text = text.replace(/\n+$/, '');
    return strip ? text : text + '\n';
  }

  function valueAfterKey(rest, lineIndent) {
    if (rest === undefined || rest === '') {
      const nxt = peek();
      if (!nxt) return null;
      if (nxt.indent > lineIndent) return parseNode();
      if (nxt.indent === lineIndent && /^-(\s|$)/.test(nxt.text)) return parseSeq(lineIndent);
      return null;
    }
    if (/^[|>][+-]?\d*$/.test(rest)) { pos++; return blockScalar(rest, lineIndent); }
    pos++;
    return parseScalar(rest);
  }

  function parseNode() {
    const ln = peek();
    if (!ln) return null;
    if (/^-(\s|$)/.test(ln.text)) return parseSeq(ln.indent);
    if (KEY_RE.test(ln.text)) return parseMap(ln.indent);
    pos++;
    return parseScalar(ln.text);
  }

  function parseMap(ind) {
    const obj = {};
    let lastWasScalar = false;
    const sloppy = new Set(); // tolerated sibling indents (e.g. " wiki:" after "name: x")
    while (true) {
      const ln = peek();
      if (!ln || ln.indent < ind) break;
      if (ln.indent > ind && !sloppy.has(ln.indent)) {
        if (!lastWasScalar) break;
        sloppy.add(ln.indent);
      }
      if (/^-(\s|$)/.test(ln.text)) break;
      const m = ln.text.match(KEY_RE);
      if (!m) throw new Error(`Line ${pos + 1}: expected "key: value" but found "${ln.text.slice(0, 40)}"`);
      const key = unquoteKey(m[1]);
      const rest = m[2];
      if (rest === undefined || rest === '') pos++;
      const value = valueAfterKey(rest, ln.indent);
      obj[key] = value;
      lastWasScalar = !(rest === undefined || rest === '') || value === null;
    }
    return obj;
  }

  function parseSeq(ind) {
    const arr = [];
    while (true) {
      const ln = peek();
      if (!ln || ln.indent !== ind || !/^-(\s|$)/.test(ln.text)) break;
      const rest = ln.text.replace(/^-\s*/, '');
      const offset = ln.text.length - rest.length;
      if (rest === '') {
        pos++;
        const nxt = peek();
        arr.push(nxt && nxt.indent > ind ? parseNode() : null);
      } else if (/^-(\s|$)/.test(rest) || KEY_RE.test(rest)) {
        lines[pos] = { indent: ind + offset, text: rest };
        arr.push(parseNode());
      } else if (/^[|>][+-]?\d*$/.test(rest)) {
        pos++; arr.push(blockScalar(rest, ind));
      } else {
        pos++; arr.push(parseScalar(rest));
      }
    }
    return arr;
  }

  const first = peek();
  if (!first) return {};
  const result = parseNode();
  const rest = peek();
  if (rest) throw new Error(`Line ${pos + 1}: unexpected "${rest.text.slice(0, 40)}" (check the indentation)`);
  return result;
}

// ---------- stringify ----------
function needsQuote(s) {
  return s === '' || /^[\s]|[\s]$/.test(s) || /^[-?:,\[\]{}#&*!|>'"%@`~]/.test(s) || /: |\s#/.test(s) ||
    /^(true|false|yes|no|null|~)$/i.test(s) || /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s) || s.endsWith(':');
}
function scalarOut(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  return needsQuote(s) ? JSON.stringify(s) : s;
}
function isScalar(v) { return v === null || v === undefined || typeof v !== 'object'; }

function stringify(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value.map(item => {
      if (typeof item === 'string' && item.includes('\n')) return pad + '- |\n' + blockLines(item, indent + 2);
      if (isScalar(item)) return pad + '- ' + scalarOut(item);
      if (Array.isArray(item)) return pad + '-\n' + stringify(item, indent + 2);
      const body = stringify(item, indent + 2);
      if (body === '{}') return pad + '- {}';
      return pad + '- ' + body.slice(indent + 2);
    }).join('\n');
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    return keys.map(k => {
      const v = value[k];
      const key = needsQuote(k) ? JSON.stringify(k) : k;
      if (typeof v === 'string' && v.includes('\n')) return pad + key + ': |\n' + blockLines(v, indent + 2);
      if (isScalar(v)) return pad + key + ': ' + scalarOut(v);
      if (Array.isArray(v) && v.length && v.every(x => isScalar(x)) && k === 'args') return pad + key + ': [' + v.map(scalarOut).join(', ') + ']';
      const inner = stringify(v, Array.isArray(v) ? indent + 2 : indent + 2);
      if (inner === '[]' || inner === '{}') return pad + key + ': ' + inner;
      return pad + key + ':\n' + inner;
    }).join('\n');
  }
  return pad + scalarOut(value);
}
function blockLines(s, indent) {
  const pad = ' '.repeat(indent);
  return s.replace(/\n$/, '').split('\n').map(l => (l ? pad + l : '')).join('\n');
}

module.exports = { parse, stringify: (v) => stringify(v, 0) + '\n' };
