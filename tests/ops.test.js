// 操作の計算（KJ-002b）：game.test.js に無い所を、表の全部の字で見る
// 部品表の輪・割る⇔くっつけるの往復・反転の往復・巡りの一周・同音の行き先・部品だけは投げられない・待ち時間は操作ごとに別
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, newGame, setHand } = require("./helpers");

const parts = D.parts.parts;
const chars = (cards) => cards.map((x) => x.c).join("");

test("部品表に輪がない（A→B→A のように割り続けて戻らない）", () => {
  const state = new Map(); // 1: 調べ中, 2: 済み
  const loops = [];
  function walk(c, trail) {
    if (state.get(c) === 2) return;
    if (state.get(c) === 1) { loops.push([...trail, c].join("→")); return; }
    state.set(c, 1);
    for (const x of parts[c] || []) walk(x, [...trail, c]);
    state.set(c, 2);
  }
  for (const c of Object.keys(parts)) walk(c, []);
  assert.deepEqual(loops, []);
});

test("割る⇔くっつける：どの字も、割った2枚を左→右に並べると戻る（一段だけ割れる）", () => {
  for (const [c, [a, b]] of Object.entries(parts)) {
    assert.deepEqual(K.splitOnce(T, c), [a, b], `${c} を割る`);
    assert.ok(K.joinResults(T, a, b).includes(c), `${a}+${b}→${c}`);
  }
  assert.deepEqual(K.splitOnce(T, "天"), ["一", "大"], "大 まではバラさない");
});

test("くっつける：中継ぎを経て二回（二+小=示、示+土=社）", () => {
  assert.deepEqual(K.joinResults(T, "二", "小"), ["示"]);
  assert.equal(K.isN5(T, "示"), false);
  assert.deepEqual(K.joinResults(T, "示", "土"), ["社"]);
});

test("反転：どの対義も、相手になり、もう一度反転すると戻る", () => {
  for (const [a, b] of D.antonyms.pairs) {
    assert.equal(T.INV.get(a), b);
    assert.equal(T.INV.get(T.INV.get(a)), a);
  }
  assert.equal(T.INV.get("木"), undefined);
});

test("巡り：どの巡りも1つ先へ進み、一周すると最初に戻る（最後から最初へ）", () => {
  for (const cy of D.cycles.cycles) {
    const cs = cy.chars;
    cs.forEach((c, i) => assert.equal(T.NEXT.get(c), cs[(i + 1) % cs.length], `${cy.name}：${c}`));
    let c = cs[0];
    for (let i = 0; i < cs.length; i++) c = T.NEXT.get(c);
    assert.equal(c, cs[0], `${cy.name} を一周`);
  }
  assert.equal(T.NEXT.get("北"), "東");
  assert.equal(T.NEXT.get("人"), undefined);
});

test("同音：変えられる先は、どれも同じ読みの組にあり、自分は入らない", () => {
  for (const c of T.N5) {
    const groups = T.HOMO.get(c) || [];
    for (const x of K.homoChars(T, c)) {
      assert.notEqual(x, c);
      assert.ok(groups.some((g) => g.chars.includes(x)), `${c}→${x}`);
    }
  }
  assert.deepEqual(K.homoChars(T, "卜"), []);
});

test("言葉の判定：N5 の字は全部1字で投げられ、部品だけの字はどれも投げられない", () => {
  const used = new Set();
  for (const c of T.N5) assert.ok(K.throwable(T, used, c).ok, c);
  const only = [...new Set(Object.values(parts).flat())].filter((c) => !T.N5.has(c));
  assert.ok(only.length > 0);
  for (const c of only) assert.deepEqual(K.throwable(T, used, c), { ok: false, why: "部品は投げられない" }, c);
  assert.deepEqual(K.throwable(T, used, "天上天下"), { ok: true });
});

test("待ち時間：操作ごとに別（反転を使っても、巡り・同音はすぐ使える）", () => {
  const g = newGame();
  assert.ok(g.invert(g.me, setHand(g, g.me, "上")).ok);
  assert.equal(g.invert(g.me, setHand(g, g.me, "上")).why, "待ち時間");
  assert.equal(chars(g.cycle(g.me, setHand(g, g.me, "月")).cards), "火");
  assert.ok(g.homophone(g.me, setHand(g, g.me, "言"), "出").ok);
});
