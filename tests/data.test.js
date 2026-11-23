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
const OUT = new Set((D.kanji.outside || []).map((k) => k.c)); // レベルの外の字（十二支。KJ-009）。山には入らない
const ZODIAC = [..."子丑寅卯辰巳午未申酉戌亥"];

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
  test(`部品表（${lv}）：同じ左右から2つの字ができるのは 十口（古・田）と、N4 では 大丶（太・犬。KJ-046）だけ（R-016）`, () => {
    const multi = [...L.JOIN].filter(([, v]) => v.length > 1).map(([k, v]) => k + "=" + v.join(""));
    assert.deepEqual(multi, lv === "N4" ? ["十口=古田", "大丶=太犬"] : ["十口=古田"]);
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
      assert.ok(ALL.has(c) || OUT.has(c), `巡り（${cy.name}）の ${c} がデータにない`);
      assert.ok(!seen.has(c), `${c} が2つの巡りにある`);
      seen.add(c);
    }
    assert.equal(new Set(cy.chars).size, cy.chars.length, cy.name);
  }
});

test("巡り：四季は N4 のときだけ。春→夏→秋→冬→春", () => {
  assert.deepEqual(TT.N5.CYCLES.map((c) => c.name), ["曜日", "方角", "数", "十二支"]);
  assert.deepEqual(TT.N4.CYCLES.map((c) => c.name), ["曜日", "方角", "数", "四季", "十二支"]);
  const seq = ["春"];
  for (let i = 0; i < 4; i++) seq.push(TT.N4.NEXT.get(seq[seq.length - 1]));
  assert.deepEqual(seq, ["春", "夏", "秋", "冬", "春"]);
  assert.ok(!TT.N5.NEXT.has("春"));
});

test("十二支（KJ-009）：子→丑→…→亥→子と一周する。N5・N4 どちらでも出る。ひとつの字は1つの巡りだけ", () => {
  for (const lv of ["N5", "N4"]) {
    const L = TT[lv];
    assert.ok(L.CYCLES.some((c) => c.name === "十二支"), lv);
    const seq = ["子"];
    for (let i = 0; i < 12; i++) seq.push(L.NEXT.get(seq[seq.length - 1]));
    assert.deepEqual(seq, [...ZODIAC, "子"], `${lv}：亥から子へ戻る`);
  }
  const owners = new Map();
  for (const cy of D.cycles.cycles) for (const c of cy.chars) owners.set(c, [...(owners.get(c) || []), cy.name]);
  for (const c of ZODIAC) assert.deepEqual(owners.get(c), ["十二支"], `${c} が別の巡りにも乗っている`);
});

test("レベルの外の字（十二支）：データにあり、読みがある。山の字ではないが、字として見せ、手に持てる。部品表の行き先には出ない", () => {
  assert.deepEqual([...OUT].sort(), [..."丑寅卯辰巳未申酉戌亥"].sort());
  const cy = D.cycles.cycles.find((c) => c.name === "十二支");
  assert.deepEqual([...cy.outside].sort(), [...OUT].sort());
  for (const c of ZODIAC) if (!OUT.has(c)) assert.ok(TT.N5.CHARS.has(c), `${c} は N5 の字（山に入る）`);
  for (const c of OUT) {
    assert.ok(!ALL.has(c), `${c} は山の字（kanji）に入れない`);
    const r = D.readings.readings[c];
    assert.ok(r && (r.on.length || r.kun.length), `${c} の読みがない`);
    for (const lv of ["N5", "N4"]) {
      const L = TT[lv];
      assert.ok(!L.CHARS.has(c), `${lv}：${c} は山に入らない`);
      assert.ok(L.OUTSIDE.has(c) && L.HOLD.has(c) && K.isChar(L, c), `${lv}：${c} は手に持てる「字」`);
      assert.ok(L.NEXT.has(c), `${lv}：${c} は巡りで行ける`);
      assert.ok(!(c in L.parts), `${lv}：${c} は割れない`);
    }
  }
  assert.equal(D.kanji.count, D.kanji.kanji.length, "kanji の数は山の字だけ");
});

test("レベルの外の字（十二支）：同じ読みの字に変えられる（戌 は N5 だけ、同じ読みの N5 の字がない）", () => {
  for (const lv of ["N5", "N4"]) {
    const L = TT[lv];
    for (const c of OUT) {
      const to = K.homoChars(L, c);
      if (c === "戌" && lv === "N5") assert.equal(to.length, 0, "戌（ジュツ・いぬ）の同じ読みの N5 の字はない");
      else assert.ok(to.length > 0, `${lv}：${c} の同音先がない`);
      for (const x of to) assert.ok(L.CHARS.has(x) || L.OUTSIDE.has(x), `${lv}：${c}→${x}`);
    }
  }
  assert.ok(K.homoChars(TT.N4, "戌").includes("犬"), "N4 では 戌→犬");
});

test("十二支の字を含む語：words.json にあり、字がすべて手に持てる。未来 は N5 から", () => {
  for (const w of ["未来", "申立", "辰年", "丑年", "上申書"]) assert.ok(D.words.words.some((x) => x.w === w), w);
  assert.equal(D.words.words.find((x) => x.w === "未来").lv, "N5");
  assert.ok(TT.N5.WORDS.has("未来") && TT.N5.WORDS.has("丑年"));
  assert.ok(!TT.N5.WORDS.has("丁丑") && TT.N4.WORDS.has("丁丑"), "丁 は N4 の字なので N4 から");
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
    for (const c of g.chars) assert.ok(ALL.has(c) || OUT.has(c), `${g.reading} の ${c}`);
    assert.ok(g.type === "on" || g.type === "kun");
  }
  for (const L of Object.values(TT)) {
    for (const [c, gs] of L.HOMO) for (const g of gs) {
      const ok = (x) => L.CHARS.has(x) || L.OUTSIDE.has(x); // レベルの字か、巡りで手に入るレベルの外の字（十二支）
      assert.ok(ok(c) && g.chars.length >= 2 && g.chars.every(ok), c);
    }
  }
});

test("語：1〜4字。2字以上は字がすべて手に持てる字で、lv はそれが手に持てるいちばん低いレベル。1字はレベルの字。表記は重ならない（KJ-011）", () => {
  const seen = new Set();
  for (const w of D.words.words) {
    const cs = [...w.w];
    assert.ok(cs.length >= 1 && cs.length <= 4, w.w);
    if (cs.length === 1) {
      assert.ok(ALL.has(w.w), w.w);
      assert.equal(w.lv, LV[w.w], w.w);
    } else {
      assert.ok(cs.every((c) => TT.N4.HOLD.has(c)), `${w.w} に手に持てない字`);
      assert.equal(w.lv, cs.every((c) => TT.N5.HOLD.has(c)) ? "N5" : "N4", w.w);
    }
    assert.ok(!seen.has(w.w), w.w);
    seen.add(w.w);
  }
  for (const lv of ["N5", "N4"]) {
    for (const w of TT[lv].WORDS.values()) for (const c of w.w) assert.ok(TT[lv].HOLD.has(c), `${lv} の ${w.w} の ${c}`);
  }
});

test("手に持てる字（KJ-011）：レベルの字＋割る・くっつけるで出る「字」。部品の色のものは入らない。N5 ⊂ N4。数は words.json と同じ", () => {
  for (const lv of ["N5", "N4"]) {
    const L = TT[lv];
    for (const c of L.CHARS) assert.ok(L.HOLD.has(c), c);
    for (const c of L.HOLD) assert.ok(K.isChar(L, c), `${lv} の ${c} は部品の見た目`);
    for (const [k, v] of Object.entries(L.parts)) for (const c of [k, ...v]) if (K.isChar(L, c)) assert.ok(L.HOLD.has(c), `${lv} の ${c}`);
    assert.equal(L.HOLD.size, D.words.stats.hold_by_level[lv], lv);
  }
  for (const c of TT.N5.HOLD) assert.ok(TT.N4.HOLD.has(c), c);
  for (const lv of ["N5", "N4"]) {
    assert.ok(TT[lv].HOLD.has("交") && !TT[lv].CHARS.has("交"), `${lv}：交 は中継ぎで手に持てるが山の字ではない`);
    assert.ok(!TT[lv].HOLD.has("亠") && !TT[lv].HOLD.has("ナ"), `${lv}：部品は手に持てる字に入らない`);
  }
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
  assert.equal(r.layout_default, undefined, "並べ方の切り替えはなくした（KJ-030）");
  assert.deepEqual(r.win.time_choices_sec, [300, 600, 900], "制限時間は 5・10・15分から選ぶ（KJ-007）");
  assert.ok(r.win.time_choices_sec.includes(r.win.time_limit_sec), "既定（10分）は選べる値の中にある");
  const [a, b] = r.cpu.interval_sec;
  assert.deepEqual([a, b], [8, 12]);
  // KJ-004：場3・手札の上限8・ストック（KJ-010 で 4→8。もとは部品の置き場）・とても弱い CPU は30〜45秒
  assert.deepEqual([r.field_size, r.hand_max, r.split_extra], [3, 8, 8], "場3・手札8・ストック8（全部で16マス。KJ-010 追記）");
  assert.equal(r.start_hand, 8, "最初の手札は8（KJ-016。作者 2026-11-21 20:14 で、はじめの1枚をやめて8に戻した）");
  assert.equal(r.first_pick, undefined, "はじめの1枚（first_pick）はやめた（KJ-016）");
  assert.deepEqual(r.cpu.weak_interval_sec, [30, 45]);
  assert.deepEqual(r.cpu.fair_interval_sec, [15, 20], "ふつう（KJ-035）：15〜20秒に1回");
  assert.ok(r.cpu.weak_interval_sec[0] >= r.cpu.fair_interval_sec[1] && r.cpu.fair_interval_sec[0] >= r.cpu.interval_sec[1], "間隔は とても弱い > ふつう > いまの強さ（重ならない）");
  assert.ok(["solo", "weak", "fair", "normal"].includes(r.opponent_default));
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

// 割れる札の点線（KJ-014）
test("split_shapes：割り方（parts.json）の字すべてに形がある。割れない字には無い", () => {
  const sh = D.split_shapes.shapes;
  for (const k of Object.keys(parts)) assert.ok(sh[k], `${k} に形が無い`);
  for (const k of Object.keys(sh)) assert.ok(parts[k], `${k} は割れない字なのに形がある`);
  for (const [k, v] of Object.entries(sh)) {
    assert.ok(["lr", "tb", "other"].includes(v.s), `${k} の形`);
    if (v.s !== "other") assert.ok(v.at > 0 && v.at < 1, `${k} の線の位置`);
    else assert.ok(v.kind === "囲み" || v.kind === "それ以外", `${k} の種類`);
  }
});

// 面でくっつける（KJ-017）：囲みの字には外側の部品の番号 out がある。それ以外（辶・广 など）には無い
test("split_shapes：囲みの字すべてに out（0＝左・上の部品／1＝右・下の部品が外側）。囲みでない字には無い", () => {
  const sh = D.split_shapes.shapes;
  let n = 0;
  for (const [k, v] of Object.entries(sh)) {
    if (v.kind === "囲み") { n++; assert.ok(v.out === 0 || v.out === 1, `${k} の out`); }
    else assert.equal(v.out, undefined, `${k} は囲みでないのに out がある`);
  }
  assert.ok(n > 0);
  assert.equal(sh["田"].out, 1, "田 は 口（2番目）が外側");
  assert.equal(sh["国"].out, 0, "国 は 囗（1番目）が外側");
});

test("cutSpec：左右＝縦の点線、上下＝横の点線、その他＝角に「割」。割れない字は null（N5・N4）", () => {
  for (const lv of ["N5", "N4"]) {
    const TL = TT[lv];
    for (const c of new Set([...TL.CHARS, ...TL.JOUYOU, ...Object.values(TL.parts).flat()])) {
      const sp = K.cutSpec(TL, c);
      if (!TL.parts[c]) { assert.equal(sp, null, `${lv} ${c} は割れない`); continue; }
      const s = D.split_shapes.shapes[c].s;
      assert.equal(sp.kind, s === "lr" ? "v" : s === "tb" ? "h" : "x", `${lv} ${c}`);
    }
  }
  assert.equal(K.cutSpec(T, "休").kind, "v");
  assert.equal(K.cutSpec(T, "古").kind, "h");
  assert.equal(K.cutSpec(T, "国").kind, "x");
  assert.equal(K.cutSpec(T, "日"), null);
  assert.ok(Math.abs(K.cutSpec(T, "休").at - 0.3) < 1e-9, "休 は左の 亻 が細いので左から約 0.3");
});

// ---- KJ-027：札の字がスマホで出る（字体の同梱）----
const fsx = require("fs");
const pathx = require("path");
const GL = JSON.parse(fsx.readFileSync(pathx.join(__dirname, "..", "data", "glyphs.json"), "utf8"));
const fontBuf = fsx.readFileSync(pathx.join(__dirname, "..", GL.font));
// otf の cmap（format 12）から、入っている字のコードを読む
function fontCodes(b) {
  const n = b.readUInt16BE(4);
  let off = 0;
  for (let i = 0; i < n; i++) if (b.toString("latin1", 12 + i * 16, 16 + i * 16) === "cmap") off = b.readUInt32BE(20 + i * 16);
  const out = new Set();
  const cn = b.readUInt16BE(off + 2);
  for (let i = 0; i < cn; i++) {
    const so = off + b.readUInt32BE(off + 4 + i * 8 + 4);
    if (b.readUInt16BE(so) !== 12) continue;
    const g = b.readUInt32BE(so + 12);
    for (let j = 0; j < g; j++) {
      const s = b.readUInt32BE(so + 16 + j * 12), e = b.readUInt32BE(so + 20 + j * 12);
      for (let c = s; c <= e; c++) out.add(c);
    }
  }
  return out;
}
// 札に出る字ぜんぶ（字・割る前の字・部品・巡り・偏の形）
function allCardChars() {
  const s = new Set(D.kanji.kanji.map((k) => k.c));
  for (const [k, v] of Object.entries(D.parts.parts)) { s.add(k); for (const x of v) s.add(x); }
  for (const c of D.cycles.cycles) for (const x of c.chars) s.add(x);
  for (const [k, v] of Object.entries(D.radical_forms.left)) { s.add(k); s.add(v); }
  return s;
}

test("字体：札に出る字がぜんぶ glyphs.json の一覧にあり、同梱の字はすべてフォントに入っている", () => {
  const all = new Set([...GL.all]);
  for (const c of allCardChars()) assert.ok(all.has(c), `${c}（U+${c.codePointAt(0).toString(16)}）が glyphs.json にない。python3 tools/build_glyphs.py を回す`);
  const codes = fontCodes(fontBuf);
  for (const c of GL.embed) assert.ok(codes.has(c.codePointAt(0)), `${c} がフォントに入っていない`);
  assert.equal(codes.size, GL.embed.length, "フォントに余計な字がない");
  assert.equal(GL.device_count + GL.embed.length, all.size);
});

test("字体：同梱しない字は JIS X 0208（端末の標準字体にある）の字だけ。同梱の字は JIS X 0208 の外", () => {
  // WHATWG の shift_jis（JIS X 0208 を含む）で1字に戻る字を「端末にある」とみなす。同梱の字は1字に戻らない（または別の字になる）
  const dec = new TextDecoder("shift_jis");
  const enc = new Map();
  for (let hi = 0x81; hi <= 0x9f; hi++) for (let lo = 0x40; lo <= 0xfc; lo++) { const s = dec.decode(Uint8Array.of(hi, lo)); if ([...s].length === 1 && s !== "�") enc.set(s, 1); }
  for (let hi = 0xe0; hi <= 0xea; hi++) for (let lo = 0x40; lo <= 0xfc; lo++) { const s = dec.decode(Uint8Array.of(hi, lo)); if ([...s].length === 1 && s !== "�") enc.set(s, 1); }
  const embed = new Set(GL.embed);
  for (const c of GL.all) {
    if (embed.has(c)) assert.ok(!enc.has(c), `${c} は JIS の中なので同梱しなくてよい`);
    else assert.ok(enc.has(c), `${c} は JIS X 0208 の外なのに同梱していない`);
  }
});

test("字体：作者が化けると見つけた 後 の右（𢀖）と 験 の右が直っている（KJ-027）", () => {
  const emb = new Set(GL.embed);
  assert.ok(emb.has("𢀖"), "𢀖 は同梱（幺 と 夂 を重ねて作る）");
  assert.deepEqual(D.parts.parts["後"], ["彳", "𢀖"]);
  assert.deepEqual(D.parts.parts["験"], ["馬", "僉"], "験 は 馬＋僉（日本の字体にある僉）");
  assert.ok(!GL.all.includes("佥"), "日本の字体に無い 佥 は使わない");
  assert.ok(!emb.has("僉"), "僉 は端末の字体にある");
  for (const lv of ["N5", "N4"]) {
    assert.deepEqual(K.splitOnce(TT[lv], "験"), lv === "N4" ? ["馬", "僉"] : ["験"]);
  }
  assert.deepEqual(K.joinResults(TT.N4, "馬", "僉"), ["験"], "N4：馬＋僉 でくっつく");
  assert.deepEqual(K.joinResults(TT.N4, "僉", "馬"), [], "逆の順ではくっつかない");
  assert.deepEqual(K.joinResults(TT.N5, "馬", "僉"), [], "N5 では 験 は割れない・くっつかない");
});

test("字体：CSS の unicode-range が同梱の字と同じ", () => {
  const css = fsx.readFileSync(pathx.join(__dirname, "..", "fonts", "kj-glyphs.css"), "utf8");
  const m = css.match(/unicode-range:([^;}]+)/);
  const got = m[1].split(",").map((x) => parseInt(x.trim().slice(2), 16)).sort((a, b) => a - b);
  const want = [...GL.embed].map((c) => c.codePointAt(0)).sort((a, b) => a - b);
  assert.deepEqual(got, want);
});
