// 部品の札の意味（KJ-021・D-039）：部品表に出てくる部品すべてに行がある・radical_forms の対応と食い違わない・一行の形・一覧にそろっている
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const K = require("../js/core.js");
const { D } = require("./helpers.js");

const R = D.radical_meanings;
const LEVELS = ["G1", "N5", "N4"];
// 全レベルの、字として見せない札（部品表の左右・かなに読む部品）。N4 は N5 を含むが、小1 のときだけ出る部品も数えるので3つとも見る
function allParts() {
  const set = new Set();
  for (const lv of LEVELS) {
    const T = K.makeTables(D, lv);
    for (const [k, v] of Object.entries(T.parts)) for (const c of [k, ...v]) if (!K.isChar(T, c)) set.add(c);
    for (const c of T.KANA.keys()) set.add(c);
  }
  return set;
}

test("部品表に出てくる部品すべてに、意味の行がある", () => {
  const parts = allParts();
  assert.ok(parts.size >= 78, "部品は78以上のはず（" + parts.size + "）");
  const missing = [...parts].filter((c) => !R.parts[c]);
  assert.deepEqual(missing, [], "行が無い部品");
  const extra = Object.keys(R.parts).filter((c) => !parts.has(c));
  assert.deepEqual(extra, [], "部品でない札の行（字として見せる札は入れない）");
});

test("どの行にも、同じ意味の字か短い意味のどちらかがある（両方は持たない）", () => {
  for (const [c, e] of Object.entries(R.parts)) {
    assert.ok(!!e.same !== !!e.mean, `${c}：same か mean のどちらか1つ`);
    if (e.name) assert.match(e.name, /^[ぁ-ゟ・]+$/, `${c}：呼び名はひらがな`);
    if (e.same) assert.equal([...e.same].length, 1, `${c}：同じ意味の字は1字`);
  }
});

test("radical_forms の左の形と食い違わない", () => {
  const left = D.radical_forms.left; // 人 → 亻
  assert.deepEqual(Object.values(R.forms).map((f) => f.same).sort(), Object.keys(left).sort(), "forms の字は radical_forms と同じ");
  for (const [base, form] of Object.entries(left)) {
    assert.equal(R.forms[form].same, base, `${form} は ${base}`);
    assert.ok(R.forms[form].name, `${form} に呼び名`);
  }
});

test("台の行の一行の形", () => {
  const T = K.makeTables(D, "N4");
  assert.equal(K.radicalNote(D, T, "艹"), "艹（くさかんむり）草のこと");
  assert.equal(K.radicalNote(D, T, "辶"), "辶（しんにょう）道・進むこと");
  assert.equal(K.radicalNote(D, T, "儿"), "儿（ひとあし）＝人");
  assert.equal(K.radicalNote(D, T, "云"), "云＝言", "呼び名の無い部品は（）を省く");
  assert.equal(K.radicalNote(D, T, "日"), null, "字の札には出さない");
  assert.equal(K.radicalNote(D, T, "？"), null, "表にない札には出さない");
});

test("左の形の一行（亻（にんべん）＝人）", () => {
  assert.equal(K.radicalFormNote(D, "人"), "亻（にんべん）＝人");
  assert.equal(K.radicalFormNote(D, "水"), "氵（さんずい）＝水");
  assert.equal(K.radicalFormNote(D, "日"), null, "左の形の無い字は null");
});

test("一覧（docs/RADICAL_MEANINGS.md）に部品が全部ある", () => {
  const md = fs.readFileSync(path.join(__dirname, "..", "docs", "RADICAL_MEANINGS.md"), "utf8");
  for (const c of Object.keys(R.parts)) assert.ok(md.includes(`| ${c} |`), `${c} が一覧に無い`);
  for (const c of Object.keys(R.forms)) assert.ok(md.includes(`| ${c} |`), `${c} が一覧に無い`);
  const qs = Object.values(R.parts).filter((e) => e.q).length;
  assert.ok(md.includes(`（？ は ${qs}）`), "？ の数が一覧と合っている");
});
