// データの整合（KJ-002 の5）
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T } = require("./helpers");

const N5 = T.CHARS; // N5 の字（helpers の T は N5）
const parts = D.parts.parts;
const relay = new Set(D.parts.relay);
const isCompOfSomething = (c) => Object.values(parts).some((v) => v.includes(c));

test("どのファイルにも version がある", () => {
  for (const f of K.FILES) assert.ok(D[f].version, f);
});

const ALL = new Set(D.kanji.kanji.map((k) => k.c)); // データにある字（N5＋N4）
const LV = Object.fromEntries(D.kanji.kanji.map((k) => [k.c, k.lv]));
const TT = { N5: K.makeTables(D, "N5"), N4: K.makeTables(D, "N4") };

test("kanji.json：数と字がそろっている。どの字にもレベル（N5／N4）がある", () => {
  assert.equal(D.kanji.count, D.kanji.kanji.length);
  assert.equal(ALL.size, D.kanji.kanji.length, "同じ字が2度ない");
  for (const k of D.kanji.kanji) assert.ok(k.lv === "N5" || k.lv === "N4", k.c);
  assert.equal(D.kanji.count_by_level.N5 + D.kanji.count_by_level.N4, D.kanji.count);
});

test("レベル：字と語の数がレベルで変わる（N5 ⊂ N4）", () => {
  assert.equal(TT.N5.CHARS.size, D.kanji.count_by_level.N5);
  assert.equal(TT.N4.CHARS.size, D.kanji.count);
  assert.ok(TT.N5.CHARS.size < TT.N4.CHARS.size);
  assert.ok(TT.N5.WORDS.size < TT.N4.WORDS.size);
  for (const c of TT.N5.CHARS) assert.ok(TT.N4.CHARS.has(c), c);
  for (const w of TT.N5.WORDS.keys()) assert.ok(TT.N4.WORDS.has(w), w);
  assert.equal(TT.N5.WORDS.size, D.words.stats.by_level.N5.total);
  assert.equal(TT.N4.WORDS.size, D.words.stats.by_level.N4.total);
  assert.ok(!TT.N5.CHARS.has("春") && TT.N4.CHARS.has("春"));
  assert.equal(K.makeTables(D).level, D.rules.level_default, "省くと初期値");
  assert.equal(D.rules.level_default, "N4", "初期値は N4（KJ-006）");
});

test("部品表：左右がちょうど2つで、空でない", () => {
  for (const [k, v] of Object.entries(parts)) {
    assert.ok(Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === "string" && [...x].length === 1), k);
  }
});

test("部品表：できる字はデータの字か中継ぎ（relay）で、中継ぎはデータの字でなく、ほかの字の部品になる（D-012・D-016）", () => {
  for (const k of Object.keys(parts)) assert.ok(ALL.has(k) || relay.has(k), `${k} は字でも relay でもない`);
  for (const r of relay) {
    assert.ok(parts[r], `relay ${r} に部品がない`);
    assert.ok(isCompOfSomething(r), `relay ${r} はどの字の部品でもない`);
    assert.ok(!ALL.has(r) || r === "田", `relay ${r} は N4 の字（田 は N5 の中継ぎのまま残す）`);
    assert.ok(!N5.has(r), `relay ${r} は N5 の字`);
  }
});

for (const lv of ["N5", "N4"]) {
  const L = TT[lv];
  test(`部品表（${lv}）：できる字はレベルの字か中継ぎ。中継ぎはそのレベルのどれかの字の部品になる`, () => {
    for (const k of Object.keys(L.parts)) assert.ok(L.CHARS.has(k) || L.RELAY.has(k), `${k}`);
    for (const r of L.RELAY) assert.ok(Object.values(L.parts).some((v) => v.includes(r)), `relay ${r}`);
    if (lv === "N5") for (const k of Object.keys(L.parts)) assert.ok(LV[k] !== "N4" || L.RELAY.has(k), `N5 で N4 の字 ${k} ができる（田 は中継ぎなのでよい）`);
  });
  test(`部品表（${lv}）：同じ左右から2つの字ができるのは 十口（古・田）だけ（R-016）`, () => {
    const multi = [...L.JOIN].filter(([, v]) => v.length > 1).map(([k, v]) => k + "=" + v.join(""));
    assert.deepEqual(multi, ["十口=古田"]);
  });
}

test("部品表：輪がない（割り続けると必ず止まる）", () => {
  const state = {};
  const visit = (c, path) => {
    if (state[c] === 2 || !parts[c]) return;
    assert.ok(state[c] !== 1, "輪：" + path.concat(c).join("→"));
    state[c] = 1;
    for (const x of parts[c]) visit(x, path.concat(c));
    state[c] = 2;
  };
  for (const c of Object.keys(parts)) visit(c, []);
});

test("部品表：N4 の字の行は N4 で遊ぶときだけ（N5 では割れない字）", () => {
  assert.ok(TT.N4.parts["海"] && !TT.N5.parts["海"]);
  assert.ok(TT.N4.parts["里"] && !TT.N5.parts["里"], "N4 にしか使わない中継ぎは N5 で外す");
  assert.deepEqual(TT.N4.JOIN.get("千里"), ["重"]);
  assert.deepEqual(TT.N4.JOIN.get("田土"), ["里"]);
});

test("対義：どの字もデータにあり、1字は1組だけ。N5 では N5 の字の組だけ", () => {
  const seen = new Set();
  for (const [a, b] of D.antonyms.pairs) {
    for (const c of [a, b]) {
      assert.ok(ALL.has(c), `対義の ${c} がデータにない`);
      assert.ok(!seen.has(c), `${c} が2組にある`);
      seen.add(c);
    }
  }
  for (const [c, x] of TT.N5.INV) assert.ok(N5.has(c) && N5.has(x), c + x);
  assert.equal(TT.N4.INV.get("高"), "低");
  assert.ok(!TT.N5.INV.has("高"), "低 は N4");
  assert.ok(!TT.N4.INV.has("春"), "春⇄秋 は足さない（巡りで行ける）");
});

test("巡り：どの字もデータにあり、同じ巡りの中で重ならない。ひとつの字は1つの巡りだけ", () => {
  const seen = new Set();
  for (const cy of D.cycles.cycles) {
    for (const c of cy.chars) {
      assert.ok(ALL.has(c), `巡り（${cy.name}）の ${c} がデータにない`);
      assert.ok(!seen.has(c), `${c} が2つの巡りにある`);
      seen.add(c);
    }
    assert.equal(new Set(cy.chars).size, cy.chars.length, cy.name);
  }
});

test("巡り：四季は N4 のときだけ。春→夏→秋→冬→春", () => {
  assert.deepEqual(TT.N5.CYCLES.map((c) => c.name), ["曜日", "方角", "数"]);
  assert.deepEqual(TT.N4.CYCLES.map((c) => c.name), ["曜日", "方角", "数", "四季"]);
  const seq = ["春"];
  for (let i = 0; i < 4; i++) seq.push(TT.N4.NEXT.get(seq[seq.length - 1]));
  assert.deepEqual(seq, ["春", "夏", "秋", "冬", "春"]);
  assert.ok(!TT.N5.NEXT.has("春"));
});

test("偏の形：もとの字はデータの字か中継ぎか常用漢字で、どれかの字の左に来る", () => {
  for (const c of Object.keys(D.radical_forms.left)) {
    assert.ok(ALL.has(c) || relay.has(c) || D.parts.jouyou.includes(c), c);
    assert.ok(Object.values(parts).some((v) => v[0] === c), `${c} が左に来る字がない`);
  }
});

test("同じ読みの組：字はデータにあり、2字以上。レベルで絞っても2字以上", () => {
  for (const g of D.readings.same_reading_groups) {
    assert.ok(g.chars.length >= 2, g.reading);
    for (const c of g.chars) assert.ok(ALL.has(c), `${g.reading} の ${c}`);
    assert.ok(g.type === "on" || g.type === "kun");
  }
  for (const L of Object.values(TT)) {
    for (const [c, gs] of L.HOMO) for (const g of gs) {
      assert.ok(L.CHARS.has(c) && g.chars.length >= 2 && g.chars.every((x) => L.CHARS.has(x)), c);
    }
  }
});

test("語：1〜4字で、字は全部データにあり、lv は使う字のいちばん高いレベル。表記は重ならない", () => {
  const seen = new Set();
  for (const w of D.words.words) {
    const cs = [...w.w];
    assert.ok(cs.length >= 1 && cs.length <= 4, w.w);
    for (const c of cs) assert.ok(ALL.has(c), `${w.w} の ${c}`);
    assert.equal(w.lv, cs.some((c) => LV[c] === "N4") ? "N4" : "N5", w.w);
    assert.ok(!seen.has(w.w), w.w);
    seen.add(w.w);
  }
  for (const w of TT.N5.WORDS.values()) for (const c of w.w) assert.ok(N5.has(c), w.w);
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
  assert.deepEqual(r.score.by_length, { 2: 3, 3: 6, 4: 12 }, "1字は放てない（KJ-008）ので1字の点はない");
  assert.equal(r.cpu.single_release_chance, undefined, "CPU が1字を放つ値は消えた（KJ-008）");
  assert.equal(r.cooldown_sec.cycle, 1, "巡りの待ちは1秒（追記 P-008）");
  assert.equal(r.score.yoji_mult, 2);
  assert.equal(r.score.special_mult, 2);
  assert.deepEqual([r.redraw.cost, r.redraw.free_wait_sec], [5, 30]);
  assert.equal(r.win.score, 50);
  assert.equal(r.win.time_limit_sec, 600, "制限時間は10分（追記 P-005）");
  assert.equal(r.layout_default, "hand", "並べ方の初期値は 手札で選ぶ（KJ-005）");
  const [a, b] = r.cpu.interval_sec;
  assert.deepEqual([a, b], [8, 12]);
  // KJ-004：場3・手札の上限8・部品の置き場4（全部で12マス）・とても弱い CPU は30〜45秒
  assert.deepEqual([r.field_size, r.hand_max, r.split_extra], [3, 8, 4]);
  assert.equal(r.start_hand, 8, "最初の手札は8のまま");
  assert.deepEqual(r.cpu.weak_interval_sec, [30, 45]);
  assert.ok(["solo", "weak", "normal"].includes(r.opponent_default));
  assert.equal(r.opponent_default, "weak");
});

test("字として見せる（jouyou）：N5 の外で、部品表に出てくる字。玉 を含む", () => {
  assert.ok(K.isChar(TT.N4, "里") && !K.isChar(TT.N4, "辶"));
  const used = new Set(Object.entries(parts).flatMap(([k, v]) => [k, ...v]));
  for (const c of D.parts.jouyou) {
    assert.ok(!N5.has(c), `${c} は N5`);
    assert.ok(used.has(c), `${c} は部品表に出てこない`);
  }
  assert.ok(K.isChar(T, "玉"));
  assert.ok(!K.isChar(T, "卜"), "卜 は部品の見た目のまま");
});
