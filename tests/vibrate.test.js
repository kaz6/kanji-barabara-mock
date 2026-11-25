// スマホの振動（KJ-074。D-092）：形の選び方（core の K.vibratePattern）と、rules.json の形
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../js/core.js");
const { D } = require("./helpers.js");

const V = D.rules.vibrate;

test("rules.vibrate：作者に伝えた形が入っている（仮置き）", () => {
  assert.equal(V.take, 10);
  assert.equal(V.release2, 30);
  assert.deepEqual(V.release3, [40, 40, 40]);
  assert.deepEqual(V.release4, [60, 40, 60, 40, 120]);
  assert.deepEqual(V.special, [80, 50, 80, 50, 200]);
  assert.deepEqual(V.reject, [15, 60, 15]);
  assert.equal(V.split, 20);
  assert.equal(V.join, 20);
  assert.deepEqual(V.win, [100, 60, 100, 60, 300]);
  assert.equal(V.lose, 150);
  assert.deepEqual(V.hit, [30, 40, 30], "特別攻撃ワードを食らったとき（KJ-081。人が食らったときだけ）");
});

test("vibratePattern：手ごとに決めた形を返す", () => {
  const P = (k, o) => K.vibratePattern(D, k, o);
  assert.equal(P("take"), 10);
  assert.equal(P("split"), 20);
  assert.equal(P("join"), 20);
  assert.deepEqual(P("reject"), [15, 60, 15]);
  assert.deepEqual(P("win"), V.win);
  assert.equal(P("lose"), 150);
  assert.deepEqual(P("hit"), [30, 40, 30]);
});

test("vibratePattern：放つは 特別な語 ＞ 4字・四字熟語 ＞ 3字 ＞ 2字", () => {
  const P = (o) => K.vibratePattern(D, "release", o);
  assert.equal(P({ len: 2 }), 30);
  assert.deepEqual(P({ len: 3 }), [40, 40, 40]);
  assert.deepEqual(P({ len: 4 }), V.release4);
  assert.deepEqual(P({ len: 4, yoji: true }), V.release4);
  assert.deepEqual(P({ len: 5 }), V.release4, "5字以上も 4字の形");
  assert.deepEqual(P({ len: 2, special: true }), V.special, "2字でも特別な語なら特別の形");
  assert.deepEqual(P({ len: 4, yoji: true, special: true }), V.special);
  assert.deepEqual(P({ len: 2, text: "金玉" }), V.special, "special_words の語");
  assert.equal(P({ len: 2, text: "一人" }), 30);
  assert.equal(D.special.special.some((s) => s.w === "金玉"), false, "金玉は特別な語の表に入れていない（点・演出は別のカード）");
});

test("vibratePattern：反転・巡り・同音・引き直しと、知らない手は振動しない（null）", () => {
  for (const k of ["invert", "cycle", "homophone", "redraw", "なにか"]) assert.equal(K.vibratePattern(D, k), null, k);
  assert.equal(K.vibratePattern({ rules: {} }, "take"), null, "rules に vibrate が無ければ何もしない");
});

test("放つ言葉の長さ・特別・四字熟語から、実際の語で形が決まる", () => {
  const T = K.makeTables(D, "N5");
  const shape = (text) => {
    const w = T.WORDS.get(text);
    return K.vibratePattern(D, "release", { text, len: [...text].length, special: T.SPECIAL.has(text), yoji: !!(w && w.yoji) });
  };
  assert.deepEqual(shape("天上天下"), V.special, "天上天下");
  assert.deepEqual(shape("金玉"), V.special, "金玉（special.json には無いが振動は特別の形）");
  assert.equal(shape("一人"), 30);
  const sp = [...T.SPECIAL.keys()][0];
  assert.deepEqual(shape(sp), V.special, `特別な語 ${sp}`);
});
