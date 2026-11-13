// Reads the "date taken" from a JPEG's EXIF data (DateTimeOriginal, else DateTime).
// Dependency-free; only the first 256 KB of the file are read. Results are cached by path + mtime.
'use strict';
const fs = require('fs');
const cache = new Map();

function readAscii(buf, off, len) { return buf.toString('latin1', off, off + len).replace(/\0.*$/, ''); }

function parseTiff(buf, start) {
  const le = buf.toString('latin1', start, start + 2) === 'II';
  const u16 = o => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = o => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  if (u16(start + 2) !== 42) return null;
  const tags = {};
  const readIfd = (rel, wanted) => {
    const at = start + rel; if (at + 2 > buf.length) return;
    const n = u16(at);
    for (let i = 0; i < n; i++) {
      const e = at + 2 + i * 12; if (e + 12 > buf.length) return;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      if (!wanted.includes(tag)) continue;
      if (type === 2) { const off = count > 4 ? start + u32(e + 8) : e + 8; if (off + count <= buf.length) tags[tag] = readAscii(buf, off, count); }
      else if (type === 4) tags[tag] = u32(e + 8);
    }
  };
  readIfd(u32(start + 4), [0x0132, 0x8769]);
  if (tags[0x8769]) readIfd(tags[0x8769], [0x9003, 0x9004]);
  return tags[0x9003] || tags[0x9004] || tags[0x0132] || null;
}

function toIso(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s || '');
  if (!m || m[1] === '0000') return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

function dateTaken(file, mtimeMs) {
  if (!/\.jpe?g$/i.test(file)) return null;
  const key = file + '|' + mtimeMs;
  if (cache.has(key)) return cache.get(key);
  let result = null;
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(256 * 1024);
    const len = fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
    const b = buf.subarray(0, len);
    if (b[0] === 0xff && b[1] === 0xd8) {
      let o = 2;
      while (o + 4 < b.length && b[o] === 0xff) {
        const marker = b[o + 1], size = b.readUInt16BE(o + 2);
        if (marker === 0xe1 && b.toString('latin1', o + 4, o + 10) === 'Exif\0\0') { result = toIso(parseTiff(b, o + 10)); break; }
        if (marker === 0xda) break;
        o += 2 + size;
      }
    }
  } catch { result = null; }
  if (cache.size > 20000) cache.clear();
  cache.set(key, result);
  return result;
}

module.exports = { dateTaken };
