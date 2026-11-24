// 特別な語の演出の筆文字（KJ-063）：special.json の語の字が、同梱の字体（fonts/kj-fx.woff）に全部ある。使うのは #fx .c だけ
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { D } = require("./helpers");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p));

// WOFF（zlib 圧縮）から cmap を読んで、字体にある字のコードの集まりを返す（フォーマット 4 と 12）
function woffCodes(buf) {
  assert.equal(buf.toString("latin1", 0, 4), "wOFF", "WOFF の印");
  const n = buf.readUInt16BE(12);
  let cmap = null;
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20;
    if (buf.toString("latin1", o, o + 4) !== "cmap") continue;
    const off = buf.readUInt32BE(o + 4), cl = buf.readUInt32BE(o + 8), ol = buf.readUInt32BE(o + 12);
    const raw = buf.subarray(off, off + cl);
    cmap = cl < ol ? zlib.inflateSync(raw) : raw;
  }
  assert.ok(cmap, "cmap がある");
  const codes = new Set();
  const nt = cmap.readUInt16BE(2);
  for (let i = 0; i < nt; i++) {
    const so = cmap.readUInt32BE(4 + i * 8 + 4), fmt = cmap.readUInt16BE(so);
    if (fmt === 4) {
      const sc = cmap.readUInt16BE(so + 6) / 2, endO = so + 14, startO = endO + sc * 2 + 2;
      for (let s = 0; s < sc; s++) {
        const e = cmap.readUInt16BE(endO + s * 2), b = cmap.readUInt16BE(startO + s * 2);
        for (let c = b; c <= e && c !== 0xffff; c++) codes.add(c);
      }
    } else if (fmt === 12) {
      const ng = cmap.readUInt32BE(so + 12);
      for (let g = 0; g < ng; g++) {
        const go = so + 16 + g * 12, b = cmap.readUInt32BE(go), e = cmap.readUInt32BE(go + 4);
        for (let c = b; c <= e; c++) codes.add(c);
      }
    }
  }
  return codes;
}

const SPECIAL_CHARS = [...new Set(D.special.special.flatMap((w) => [...w.w]))];

test("筆文字：special.json の語の字が、同梱の字体（kj-fx.woff）にぜんぶある", () => {
  const codes = woffCodes(read("fonts/kj-fx.woff"));
  assert.ok(SPECIAL_CHARS.length > 0);
  for (const c of SPECIAL_CHARS) assert.ok(codes.has(c.codePointAt(0)), `${c} が kj-fx.woff に無い。python3 tools/build_fx_font.py を回す`);
});

test("筆文字：字体は特別な語の字に絞ってある（小さい）・css の範囲が special.json の字と合う", () => {
  assert.ok(read("fonts/kj-fx.woff").length < 20000, "20KB 未満");
  const css = read("fonts/kj-fx.css").toString("utf8");
  const range = css.match(/unicode-range:([^;}]+)/)[1].split(",").map((x) => parseInt(x.trim().slice(2), 16)).sort((a, b) => a - b);
  assert.deepEqual(range, SPECIAL_CHARS.map((c) => c.codePointAt(0)).sort((a, b) => a - b));
});

test("筆文字：KJ Fx を使うのは #fx .c の1か所だけ。読めなかったときは今の字（--kanji）に戻る。OFL と名前を置いてある", () => {
  const html = read("index.html").toString("utf8");
  const uses = html.match(/[^\n{}]*\{[^{}]*KJ Fx[^{}]*\}/g) || [];
  assert.equal(uses.length, 1, "KJ Fx を指す規則は1つ");
  assert.match(uses[0], /^#fx \.c\{[^}]*font-family:"KJ Fx",var\(--kanji\)/);
  assert.match(html, /href="fonts\/kj-fx\.css"/);
  assert.match(html, /class="credit">[^<]*Yuji Syuku/);
  assert.match(read("fonts/OFL-YujiSyuku.txt").toString("utf8"), /Yuji Project Authors[\s\S]*SIL Open Font License, Version 1\.1/);
  assert.match(html, /preloadFx\(\)/, "はじめる前の画面のうちに読む");
});
