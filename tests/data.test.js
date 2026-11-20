// データの整合：部品表・対義・巡り・偏の字・同じ読み・語
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { FILES, D, T } = require("./helpers");

const N5 = T.N5;
const parts = D.parts.parts;
const relay = new Set(D.parts.relay);

test("data/*.json はどれも version を持つ", () => {
  for (const f of FILES) assert.ok(D[f].version, `${f}.json に version がない`);
});

test("部品表：割れる字は N5 の字か中継ぎ（relay）", () => {
  const bad = Object.keys(parts).filter(c => !N5.has(c) && !relay.has(c));
  assert.deepEqual(bad, []);
});

test("部品表：中継ぎ（relay）は N5 の字ではなく、部品表で割れる", () => {
  for (const c of relay) {
    assert.ok(!N5.has(c), `${c} は N5 の字なのに中継ぎにある`);
    assert.ok(parts[c], `${c} は中継ぎなのに部品表で割れない`);
  }
});

test("部品表：どの字も [左, 右] の2枚に割れる", () => {
  for (const [c, v] of Object.entries(parts)) {
    assert.ok(Array.isArray(v) && v.length === 2 && v.every(x => typeof x === "string" && [...x].length === 1),
      `${c}: ${JSON.stringify(v)}`);
    assert.ok(!v.includes(c), `${c} が自分自身を部品に持つ`);
  }
});

test("部品表：中継ぎは、くっつけてできる先が部品表にある（行き止まりにならない）", () => {
  const uses = new Set(Object.values(parts).flat());
  for (const c of relay) assert.ok(uses.has(c), `中継ぎ ${c} を部品に使う字がない`);
});

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

test("部品表：同じ左右から2字できるのは 十口（古・田）だけ（増えたら落ちる）", () => {
  const by = new Map();
  for (const [c, [a, b]] of Object.entries(parts)) {
    const k = a + b;
    by.set(k, [...(by.get(k) || []), c]);
  }
  const dup = [...by].filter(([, v]) => v.length > 1).map(([k, v]) => `${k}=${v.join("・")}`);
  assert.deepEqual(dup, ["十口=古・田"]);
});

test("対義：どの字も N5 の字で、1字につき相手は1つ", () => {
  const seen = new Map();
  for (const pair of D.antonyms.pairs) {
    assert.equal(pair.length, 2, JSON.stringify(pair));
    const [a, b] = pair;
    assert.notEqual(a, b);
    for (const c of pair) {
      assert.ok(N5.has(c), `対義の ${c} が kanji.json にない`);
      assert.ok(!seen.has(c), `${c} が対義に2回出る`);
      seen.set(c, true);
    }
  }
});

test("巡り：どの字も N5 の字で、2字以上。1字は1つの巡りにだけ出る", () => {
  const seen = new Set();
  for (const cy of D.cycles.cycles) {
    assert.ok(cy.chars.length >= 2, cy.name);
    for (const c of cy.chars) {
      assert.ok(N5.has(c), `巡り「${cy.name}」の ${c} が kanji.json にない`);
      assert.ok(!seen.has(c), `${c} が2つの巡りに出る`);
      seen.add(c);
    }
  }
});

test("偏の形：もとの字は N5 の字か中継ぎで、部品表で左に使われている", () => {
  const lefts = new Set(Object.values(parts).map(v => v[0]));
  for (const [c, form] of Object.entries(D.radical_forms.left)) {
    assert.ok(N5.has(c) || relay.has(c), `偏のもとの字 ${c} が kanji.json にも中継ぎにもない`);
    assert.ok(lefts.has(c), `${c}（${form}）を左に使う字が部品表にない`);
    assert.notEqual(form, c);
  }
});

test("同じ読み：組の字は N5 の字で2字以上、音か訓のどちらか", () => {
  for (const g of D.readings.same_reading_groups) {
    assert.ok(g.chars.length >= 2, g.reading);
    assert.ok(g.type === "on" || g.type === "kun", g.reading);
    for (const c of g.chars) assert.ok(N5.has(c), `読み ${g.reading} の ${c} が kanji.json にない`);
  }
});

test("語：words.json の語はどれも N5 の字だけで1〜4字、重なりがない", () => {
  const seen = new Set();
  for (const w of D.words.words) {
    const cs = [...w.w];
    assert.ok(cs.length >= 1 && cs.length <= 4, w.w);
    for (const c of cs) assert.ok(N5.has(c), `${w.w} の ${c} が kanji.json にない`);
    assert.ok(!seen.has(w.w), `${w.w} が2回ある`);
    seen.add(w.w);
  }
  assert.equal(D.words.words.length, D.words.stats.total);
});

test("特別な語：words.json にあり、つながる相手も words.json にある", () => {
  for (const s of D.special.special) {
    assert.ok(T.WORDS.has(s.w), s.w);
    for (const n of s.next) assert.ok(T.WORDS.has(n), `${s.w} の相手 ${n}`);
  }
});
