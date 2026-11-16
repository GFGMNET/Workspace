// YAML for the whole app: full YAML 1.2 through the bundled "yaml" library
// (anchors & aliases, merge keys `<<:`, several documents, block scalars, flow style, tags …).
// If a file isn't valid YAML, the old forgiving reader is tried as a fallback, so hand-written
// files like the original example (" wiki:" indented one space) keep working; callers get a warning.
'use strict';
const Y = require('./vendor/yaml');
const lenient = require('./yaml-lenient');

const OPTS = { merge: true, uniqueKeys: false, prettyErrors: true, maxAliasCount: 1000 };

function firstError(docs) {
  for (const d of docs) if (d.errors && d.errors.length) return d.errors[0];
  return null;
}
function errorText(e) {
  const pos = e.linePos && e.linePos[0];
  const msg = String(e.message || e).split('\n')[0].replace(/\s+at line \d+, column \d+:?$/, '');
  return pos ? `Line ${pos.line}, column ${pos.col}: ${msg}` : msg;
}

// Several documents in one file: mappings are merged in order; otherwise the first one counts.
function combine(values) {
  const vals = values.filter(v => v !== null && v !== undefined);
  if (!vals.length) return null;
  if (vals.length > 1 && vals.every(v => typeof v === 'object' && !Array.isArray(v))) return Object.assign({}, ...vals);
  return vals[0];
}

// → { value, warning } ; throws with "Line X, column Y: …" when the text can't be read at all
function parseWithInfo(src) {
  const text = String(src ?? '').replace(/^﻿/, '');
  const docs = Y.parseAllDocuments(text, OPTS);
  const list = Array.isArray(docs) ? docs : [docs];
  const err = firstError(list);
  if (!err) return { value: combine(list.map(d => d.toJS({ maxAliasCount: OPTS.maxAliasCount }))), warning: null };
  try {
    const value = lenient.parse(text);
    return { value, warning: `Not valid YAML (${errorText(err)}) — read leniently. Fix it to be safe.` };
  } catch {
    const e = new Error(errorText(err)); e.yaml = true; throw e;
  }
}
const parse = src => parseWithInfo(src).value;

function stringify(value) {
  return Y.stringify(value, { lineWidth: 0, minContentWidth: 0, defaultStringType: 'PLAIN', defaultKeyType: 'PLAIN', aliasDuplicateObjects: false });
}

// Rewrites a mapping file with new values but keeps its comments, key order and style
// (used when records are saved from a form).
function updateMapping(text, data) {
  const doc = Y.parseDocument(String(text ?? ''), OPTS);
  if (doc.errors.length || !Y.isMap(doc.contents)) return stringify(data);
  const keys = new Set(Object.keys(data));
  for (const item of [...doc.contents.items]) { const k = Y.isScalar(item.key) ? String(item.key.value) : String(item.key); if (!keys.has(k)) doc.delete(item.key); }
  for (const [k, v] of Object.entries(data)) {
    const cur = doc.get(k, true);
    const same = cur !== undefined && JSON.stringify(Y.isNode(cur) ? cur.toJSON() : cur) === JSON.stringify(v);
    if (!same) doc.set(k, v);
  }
  return doc.toString({ lineWidth: 0 });
}

module.exports = { parse, parseWithInfo, stringify, updateMapping, lib: Y };
