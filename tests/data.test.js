// データの整合（KJ-002 の5）
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T } = require("./helpers");

const N5 = T.N5;
const parts = D.parts.parts;
const relay = new Set(D.parts.relay);
const isCompOfSomething = (c) => Object.values(parts).some((v) => v.includes(c));

test("どのファイルにも version がある", () => {
  for (const f of K.FILES) assert.ok(D[f].version, f);
});

test("kanji.json：数と字がそろっている", () => {
  assert.equal(D.kanji.count, D.kanji.kanji.length);
  assert.equal(N5.size, D.kanji.kanji.length, "同じ字が2度ない");
});

test("部品表：左右がちょうど2つで、空でない", () => {
  for (const [k, v] of Object.entries(parts)) {
    assert.ok(Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === "string" && [...x].length === 1), k);
  }
});

test("部品表：できる字は N5 か中継ぎ（relay）で、中継ぎはほかの字の部品になる（D-012・D-016）", () => {
  for (const k of Object.keys(parts)) {
    assert.ok(N5.has(k) || relay.has(k), `${k} は N5 でも relay でもない`);
  }
  for (const r of relay) {
    assert.ok(parts[r], `relay ${r} に部品がない`);
    assert.ok(isCompOfSomething(r), `relay ${r} はどの字の部品でもない`);
  }
});

test("部品表：N5 の字は relay に入れない", () => {
  for (const r of relay) assert.ok(!N5.has(r), r);
});

test("部品表：同じ左右から2つの字ができるのは 十口（古・田）だけ（R-016）", () => {
  const multi = [...T.JOIN].filter(([, v]) => v.length > 1).map(([k, v]) => k + "=" + v.join(""));
  assert.deepEqual(multi, ["十口=古田"]);
});

test("対義：どの字も N5 にあり、1字は1組だけ", () => {
  const seen = new Set();
  for (const [a, b] of D.antonyms.pairs) {
    for (const c of [a, b]) {
      assert.ok(N5.has(c), `対義の ${c} が N5 にない`);
      assert.ok(!seen.has(c), `${c} が2組にある`);
      seen.add(c);
    }
  }
});

test("巡り：どの字も N5 にあり、同じ巡りの中で重ならない", () => {
  for (const cy of D.cycles.cycles) {
    for (const c of cy.chars) assert.ok(N5.has(c), `巡り（${cy.name}）の ${c} が N5 にない`);
    assert.equal(new Set(cy.chars).size, cy.chars.length, cy.name);
  }
});

test("偏の形：もとの字は N5 か中継ぎにあり、どれかの字の左に来る", () => {
  for (const c of Object.keys(D.radical_forms.left)) {
    assert.ok(N5.has(c) || relay.has(c), c);
    assert.ok(Object.values(parts).some((v) => v[0] === c), `${c} が左に来る字がない`);
  }
});

test("同じ読みの組：字は N5 にあり、2字以上", () => {
  for (const g of D.readings.same_reading_groups) {
    assert.ok(g.chars.length >= 2, g.reading);
    for (const c of g.chars) assert.ok(N5.has(c), `${g.reading} の ${c}`);
    assert.ok(g.type === "on" || g.type === "kun");
  }
});

test("語：1〜4字で、字は全部 N5。表記は重ならない", () => {
  for (const w of D.words.words) {
    const cs = [...w.w];
    assert.ok(cs.length >= 1 && cs.length <= 4, w.w);
    for (const c of cs) assert.ok(N5.has(c), `${w.w} の ${c}`);
  }
  assert.equal(T.WORDS.size, D.words.words.length);
});

test("特別な語：words.json にあり、つながる相手も words.json にある", () => {
  for (const s of D.special.special) {
    assert.ok(T.WORDS.has(s.w), s.w);
    for (const n of s.next) assert.ok(T.WORDS.has(n), n);
  }
});

test("決まり：数値がそろっている（KJ-003 の仮置き）", () => {
  const r = D.rules;
  for (const k of ["field_size", "start_hand", "hand_max", "same_char_in_deck", "take_per_char"]) assert.ok(r[k] > 0, k);
  assert.ok(r.start_hand <= r.hand_max);
  for (const k of ["invert", "cycle", "homophone"]) assert.ok(r.cooldown_sec[k] > 0, k);
  assert.deepEqual(r.score.by_length, { 1: 1, 2: 3, 3: 6, 4: 12 });
  assert.equal(r.score.yoji_mult, 2);
  assert.equal(r.score.special_mult, 2);
  assert.deepEqual([r.redraw.cost, r.redraw.free_wait_sec], [5, 30]);
  assert.deepEqual([r.win.score, r.win.time_limit_sec], [50, 300]);
  const [a, b] = r.cpu.interval_sec;
  assert.deepEqual([a, b], [8, 12]);
});

test("字として見せる（jouyou）：N5 の外で、部品表に出てくる字。玉 を含む", () => {
  const used = new Set(Object.entries(parts).flatMap(([k, v]) => [k, ...v]));
  for (const c of D.parts.jouyou) {
    assert.ok(!N5.has(c), `${c} は N5`);
    assert.ok(used.has(c), `${c} は部品表に出てこない`);
  }
  assert.ok(K.isChar(T, "玉"));
  assert.ok(!K.isChar(T, "卜"), "卜 は部品の見た目のまま");
});
