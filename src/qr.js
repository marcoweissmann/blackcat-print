/*
 * QR-Code-Encoder (Byte-Modus, Fehlerkorrektur M, Version 1-25) fuer BlackCat Print.
 * Aufbau nach ISO/IEC 18004. Struktur und Rechenschritte folgen der
 * "QR Code generator library" von Project Nayuki:
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Copyright (c) Project Nayuki. (MIT License)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability,
 *   fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other
 *   liability, whether in an action of contract, tort or otherwise, arising from,
 *   out of or in connection with the Software or the use or other dealings in the
 *   Software.
 */
const QR = (() => {
  const ECC = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28];
  const NB = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21];

  const rawMods = v => {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) { const na = Math.floor(v / 7) + 2; r -= (25 * na - 10) * na - 55; if (v >= 7) r -= 36; }
    return r;
  };
  const dataCw = v => Math.floor(rawMods(v) / 8) - ECC[v] * NB[v];
  const mul = (x, y) => {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z & 0xFF;
  };
  const rsDiv = d => {
    const r = new Array(d).fill(0); r[d - 1] = 1; let root = 1;
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) { r[j] = mul(r[j], root); if (j + 1 < d) r[j] ^= r[j + 1]; }
      root = mul(root, 2);
    }
    return r;
  };
  const rsRem = (data, div) => {
    const r = new Array(div.length).fill(0);
    for (const b of data) {
      const f = b ^ r.shift(); r.push(0);
      for (let i = 0; i < r.length; i++) r[i] ^= mul(div[i], f);
    }
    return r;
  };
  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  function encode(text) {
    const data = [...new TextEncoder().encode(text)];
    let ver = 0;
    for (let v = 1; v <= 25; v++) if (4 + (v <= 9 ? 8 : 16) + data.length * 8 <= dataCw(v) * 8) { ver = v; break; }
    if (!ver) throw new Error('Text zu lang für einen QR-Code');
    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const setFn = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };

    // Datenbits
    const bits = [];
    const add = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    add(4, 4); add(data.length, ver <= 9 ? 8 : 16); data.forEach(b => add(b, 8));
    const cap = dataCw(ver) * 8;
    add(0, Math.min(4, cap - bits.length)); add(0, (8 - bits.length % 8) % 8);
    for (let p = 0xEC; bits.length < cap; p ^= 0xEC ^ 0x11) add(p, 8);
    const cw = [];
    for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; cw.push(b); }

    // Funktionsmuster
    for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    const finder = (x, y) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    let pos = [];
    if (ver > 1) {
      const num = Math.floor(ver / 7) + 2, step = Math.floor((ver * 4 + num * 2 + 1) / (num * 2 - 2)) * 2;
      pos = new Array(num); pos[0] = 6;
      for (let i = num - 1, p = size - 7; i >= 1; i--, p -= step) pos[i] = p;
    }
    const n = pos.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
      if (!(i === 0 && j === 0 || i === 0 && j === n - 1 || i === n - 1 && j === 0))
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
          setFn(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    const fmt = mask => {
      let rem = mask;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((mask << 10) | rem) ^ 0x5412;   // ECC-Level M = 00
      for (let i = 0; i <= 5; i++) setFn(8, i, bit(b, i));
      setFn(8, 7, bit(b, 6)); setFn(8, 8, bit(b, 7)); setFn(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(b, i));
      setFn(8, size - 8, true);
    };
    fmt(0);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const b = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) { const v = bit(b, i), a = size - 11 + i % 3, c = Math.floor(i / 3); setFn(a, c, v); setFn(c, a, v); }
    }

    // Fehlerkorrektur + Verschachtelung
    const nb = NB[ver], el = ECC[ver], raw = Math.floor(rawMods(ver) / 8), ns = nb - raw % nb, sl = Math.floor(raw / nb);
    const div = rsDiv(el), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dl = sl - el + (i < ns ? 0 : 1);
      const dat = cw.slice(k, k + dl); k += dl;
      const ecc = rsRem(dat, div);
      if (i < ns) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) for (let j = 0; j < nb; j++) if (i !== sl - el || j >= ns) all.push(blocks[j][i]);

    // Codewoerter platzieren
    let idx = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && idx < all.length * 8) { mod[y][x] = bit(all[idx >>> 3], 7 - (idx & 7)); idx++; }
      }
    }

    const masks = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const apply = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && masks[m](x, y)) mod[y][x] = !mod[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      for (let y = 0; y < size; y++) { let run = 1; for (let x = 1; x < size; x++) { if (mod[y][x] === mod[y][x - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let x = 0; x < size; x++) { let run = 1; for (let y = 1; y < size; y++) { if (mod[y][x] === mod[y - 1][x]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (mod[y][x]) dark++;
        if (x && y) { const c = mod[y][x]; if (c === mod[y][x - 1] && c === mod[y - 1][x] && c === mod[y - 1][x - 1]) p += 3; }
      }
      const total = size * size, k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
      return p + Math.max(0, k) * 10;
    };
    let best = 0, min = Infinity;
    for (let m = 0; m < 8; m++) { apply(m); fmt(m); const p = penalty(); if (p < min) { min = p; best = m; } apply(m); }
    apply(best); fmt(best);
    return { size, get: (x, y) => mod[y][x] };
  }
  return { encode };
})();
if (typeof module !== 'undefined') module.exports = QR;
