import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
// Read a single .sli member from the ZIP central directory, without extracting files.
export function readSlideSource(sourceDir, filename) {
  const absolutePath = path.join(sourceDir, filename);
  const bytes = fs.readFileSync(absolutePath);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= 0, `ZIP directory missing: ${filename}`);
  let pos = bytes.readUInt32LE(end + 16);
  const count = bytes.readUInt16LE(end + 10);
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(pos), 0x02014b50);
    const compression = bytes.readUInt16LE(pos + 10);
    const size = bytes.readUInt32LE(pos + 20);
    const nameLen = bytes.readUInt16LE(pos + 28), extraLen = bytes.readUInt16LE(pos + 30), commentLen = bytes.readUInt16LE(pos + 32);
    const name = bytes.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
    if (name.endsWith('.sli')) {
      const offset = bytes.readUInt32LE(pos + 42);
      assert.equal(bytes.readUInt32LE(offset), 0x04034b50);
      const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
      const compressed = bytes.subarray(start, start + size);
      assert.ok(compression === 0 || compression === 8);
      const text = (compression === 8 ? inflateRawSync(compressed) : compressed).toString('utf8');
      const sections = {};
      let heading = '';
      for (const line of text.split(/\r?\n/)) {
        if (/^\S.*:$/.test(line)) { heading = line.slice(0, -1); sections[heading] = []; }
        else if (line.trim()) sections[heading]?.push(line.trim());
      }
      const settings = Object.fromEntries(sections['model description'].map(l => { const at = l.indexOf(':'); return [l.slice(0, at), l.slice(at + 1).trim()]; }));
      const vertices = Object.fromEntries(sections.vertices.map(l => { const m = l.match(/^(\d+) x:\s*(\S+)\s+y:\s*(\S+)/); assert.ok(m); return [m[1], [+m[2], +m[3]]]; }));
      const slopeIds = sections.slope[0].match(/\[([^\]]+)\]/)[1].split(',');
      const soils = {};
      for (const line of sections['material types']) {
        const m = line.match(/^soil(\d+) = type: (\d+).*? c: (\S+)(?: phi: (\S+))?.*? uw: (\S+)/);
        if (m) soils[m[1]] = { type: +m[2], c: +m[3], phi: +(m[4] || 0), gamma: +m[5] };
      }
      const f = settings.units === 'imperial' ? .3048 : 1;
      const info = { file: absolutePath, member: name, sha256: createHash('sha256').update(bytes).digest('hex'), settings, sections, circularAnalysis: sections['circular analysis'], searchFocus: sections['search focus'], slopeLimits: sections['slope limits'], soils, vertices };
      
      return { info, sections, settings, vertices, soils, f, ground: slopeIds.map(id => vertices[id]).map(p => p.map(v => v * f)) };
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`No .sli member in ${filename}`);
}
