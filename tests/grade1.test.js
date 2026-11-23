// 小1（KJ-044・D-058）：レベルに「小1」（小学1年で習う漢字80字）を足した。N5・N4 は動かさない
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { K, D, T, T4, TG1, newGame, setHand, ROOT } = require("./helpers");
const GL = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "glyphs.json"), "utf8"));

// KANJIDIC2 の grade=1（80字）。データを作り直しても動かない見張りとして、ここに書き写してある
const G1 = [..."日一人年大十二本中出三見月生五上四金九入立手力学円子目田八六下気小七山正女百先名川文千水男村口町校空土木車石足早白字音天火花赤青竹右森左休林王玉夕雨草犬耳虫糸貝"];

test("小1：選びの順は 小1／N5／N4。初期値は N4 のまま", () => {
  assert.deepEqual(K.LEVELS.map((l) => l.key), ["G1", "N5", "N4"]);
  assert.deepEqual(K.LEVELS.map((l) => l.short), ["小1", "N5", "N4"]);
  assert.equal(D.rules.level_default, "N4");
  assert.equal(K.makeTables(D).level, "N4");
  assert.match(K.levelLabel("G1"), /^小1/);
  assert.equal(K.levelLabel("N4"), "N4（N5＋N4 の字）", "N5・N4 の呼び名は今まで通り");
});

test("小1：山に入る字はちょうど80字で、80字の外は入らない。N5 に無い23字と、N5・N4 のどちらにも無い8字を含む", () => {
  assert.equal(G1.length, 80);
  assert.equal(new Set(G1).size, 80);
  assert.deepEqual([...TG1.CHARS].sort(), [...G1].sort());
  assert.equal(D.kanji.count_g1, 80);
  const g1rows = D.kanji.kanji.filter((k) => k.g1);
  assert.deepEqual(g1rows.map((k) => k.c).sort(), [...G1].sort());
  const notN5 = G1.filter((c) => !T.CHARS.has(c));
  assert.equal(notN5.length, 23, "N5 に無い字は23字");
  assert.deepEqual(notN5.sort(), [..."力夕字文早村林森正犬玉王田町石竹糸草虫貝赤青音"].sort());
  const neither = G1.filter((c) => !T4.CHARS.has(c));
  assert.deepEqual(neither.sort(), [..."石竹王玉草虫糸貝"].sort(), "N5・N4 のどちらにも無い字");
  for (const c of neither) assert.equal(D.kanji.kanji.find((k) => k.c === c).lv, "G1", c);
  for (const c of neither) assert.ok(!T4.CHARS.has(c) && !T.CHARS.has(c), `${c} は N5・N4 の山に入らない`);
});

test("小1：N5・N4 は小1 を足したことでは動かない（N4 の数は小1 を足す前のまま。N5 は P-047 で 玉＝王＋丶 を足して 王 が手に持てる字になり、語が29語 N4→N5）", () => {
  assert.deepEqual([T.CHARS.size, T.WORDS.size, T.HOLD.size], [103, 2449, 139]);
  assert.deepEqual([T4.CHARS.size, T4.WORDS.size, T4.HOLD.size], [284, 10438, 353]);
  for (const w of T4.WORDS.values()) assert.ok(w.lv === "N5" || w.lv === "N4", w.w);
  for (const w of D.words.words.filter((x) => x.lv === null)) assert.ok(w.g1 && !T4.WORDS.has(w.w) && !T.WORDS.has(w.w), `${w.w} は小1 だけの語`);
});

test("小1：放てる言葉は、80字と、割る・くっつけるなどで手に持てる字だけで書ける語。1字から四字熟語まで", () => {
  const ws = [...TG1.WORDS.values()];
  assert.ok(ws.length > 1000 && ws.length < 1700, `語 ${ws.length}`);
  assert.equal(ws.length, D.words.stats.by_level.G1.total);
  assert.equal(TG1.HOLD.size, D.words.stats.hold_by_level.G1);
  for (const w of ws) for (const c of w.w) assert.ok(TG1.HOLD.has(c), `${w.w} の ${c}`);
  for (const n of [1, 2, 3, 4]) assert.ok(ws.some((w) => [...w.w].length === n), `${n}字の語がある`);
  assert.ok(ws.some((w) => w.yoji), "四字熟語");
  for (const w of ["山", "山川", "日本", "石", "草", "森林", "大人"]) assert.ok(TG1.WORDS.has(w) || !D.words.words.some((x) => x.w === w), w);
  assert.ok(TG1.WORDS.has("石") && TG1.WORDS.get("石").lv === null, "石 は小1 だけの語");
  assert.ok(!T4.WORDS.has("石") && !T.WORDS.has("石"));
  // 小1 でも、レベルの外の字（手に持てる字）を含む語は放てる（D-029）：交・里 などは割る・くっつけるで出る
  assert.ok(ws.some((w) => [...w.w].some((c) => !TG1.CHARS.has(c))), "山の字でない手に持てる字を含む語がある");
});

test("小1：割り方・対義・巡りは今のまま。曜日・数は80字で回る。方角・四季・十二支は、字が80字にそろわないので回らない（N5・N4 では今まで通り回る）", () => {
  assert.ok(TG1.NEXT.get("日") && TG1.NEXT.get("月") && TG1.NEXT.get("金"), "曜日");
  assert.equal(TG1.NEXT.get("一"), "二");
  assert.equal(TG1.NEXT.get("十"), "一", "数は十から一へ戻る");
  assert.deepEqual(TG1.CYCLES.map((c) => c.chars.join("")), ["月火水木金土日", "一二三四五六七八九十"]);
  assert.ok(!TG1.NEXT.has("東") && !TG1.NEXT.has("春"), "方角・四季の字は80字にない");
  assert.equal(TG1.OUTSIDE.size, 0, "十二支は午が80字にないので、小1 では回らない（子 は80字の字）");
  assert.ok(T.NEXT.has("丑") && T4.NEXT.has("春") && T4.NEXT.has("東"), "N5・N4 は今まで通り");
  assert.equal(TG1.INV.get("上"), "下");
  assert.equal(TG1.INV.get("大"), "小");
  assert.equal(TG1.INV.get("左"), "右");
  assert.deepEqual(K.splitOnce(TG1, "校"), ["木", "交"]);
  assert.deepEqual(K.splitOnce(TG1, "休"), ["人", "木"]);
  assert.deepEqual(K.splitOnce(TG1, "林"), ["木", "木"]);
});

test("小1：80字のうち N5・N4 のどちらにも無い字の割り方。草＝艹＋早 だけ（石・糸 は作者が割らないと決めた）。草 は N5・N4 では割れない・くっつかない", () => {
  assert.deepEqual(K.splitOnce(TG1, "草"), ["艹", "早"]);
  assert.deepEqual(K.joinResults(TG1, "艹", "早"), ["草"]);
  for (const c of "石糸") assert.ok(!K.canSplit(TG1, c), `${c} は割らない（作者 2026-11-23 14:14）`);
  assert.deepEqual(K.joinResults(TG1, "厂", "口"), [], "厂＋口 で 石 にはならない");
  assert.deepEqual(K.joinResults(TG1, "幺", "小"), [], "幺＋小 で 糸 にはならない");
  for (const L of [T, T4]) {
    for (const c of "石草糸") assert.ok(!K.canSplit(L, c), `${c} は ${L.level} では割れない`);
    assert.deepEqual(K.joinResults(L, "艹", "早"), []);
    assert.deepEqual(K.joinResults(L, "厂", "口"), []);
  }
  // 国→玉→王 は P-047 で足した（王＝割れない。玉＝王＋丶 は N5・N4・小1 の全部で割れる）
  assert.ok(K.canSplit(TG1, "玉") && !K.canSplit(TG1, "王"));
  assert.deepEqual(K.splitOnce(TG1, "玉"), ["王", "丶"]);
  assert.deepEqual(K.splitOnce(TG1, "足"), ["口", "止"], "足＝口＋止 も小1 で割れる");
  assert.deepEqual(K.joinResults(TG1, "口", "止"), ["足"]);
});

test("小1：部品表の輪がない。割った字・部品は全部札の字形にある（80字が全部表示できる）", () => {
  const parts = D.parts.parts;
  for (const k of Object.keys(TG1.parts)) {
    const seen = new Set([k]);
    const walk = (c) => { for (const x of parts[c] || []) { assert.ok(!seen.has(x), `${k} の輪（${x}）`); seen.add(x); walk(x); seen.delete(x); } };
    walk(k);
  }
  const glyphs = new Set([...GL.all]);
  for (const c of G1) assert.ok(glyphs.has(c), `${c} が字形の一覧にない`);
  for (const k of Object.keys(TG1.parts)) for (const c of [k, ...TG1.parts[k]]) assert.ok(glyphs.has(c), `${c} が字形の一覧にない`);
  for (const w of [...TG1.WORDS.values()]) for (const c of w.w) assert.ok(glyphs.has(c), `${w.w} の ${c}`);
});

test("小1：ゲームを作る。山も手札も場も80字の外が出ない。ログの頭に「小1」が出る", () => {
  const g = newGame(7, "normal", "G1");
  assert.equal(g.level, "G1");
  const cards = [...g.deck, ...g.me.cards.map((x) => x.c), ...g.cpu.cards.map((x) => x.c), ...g.field.map((x) => x.c)];
  assert.equal(cards.length, 80 * D.rules.same_char_in_deck, "80字を2枚ずつ");
  for (const c of cards) assert.ok(G1.includes(c), `${c} は80字の外`);
  const head = g.logText().split("\n").filter((l) => l.startsWith("#")).join("\n");
  assert.match(head, /# レベル 小1（小学1年の漢字80字）/);
  assert.match(head, /山=小1 の字を2枚ずつ/);
  assert.doesNotMatch(head, /四季|方角/);
});

test("小1：引き直し・取るで補充しても山の字は80字の外が出ない。CPU を回しても止まらない", () => {
  for (const seed of [1, 7, 42]) {
    const g = newGame(seed, "weak", "G1");
    for (let i = 0; i < 20; i++) {
      g.clock.t += 40;
      g.redraw(g.me);
      for (const c of [...g.me.cards, ...g.field]) assert.ok(G1.includes(c.c), `seed ${seed}: ${c.c}`);
    }
    for (let i = 0; i < 40 && !g.over; i++) { g.clock.t += g.cpuDelay(); g.tick(); if (g.over) break; g.cpuTurn(); }
  }
});

test("小1：80字だけの手札で、割る・くっつけるが通る（草＝艹＋早 を割って、くっつけ直す。石 は割れない）", () => {
  const g = newGame(3, "solo", "G1");
  const [id] = setHand(g, g.me, "草");
  const r = g.split(g.me, [id]);
  assert.ok(r.ok, r.why);
  assert.equal(g.me.cards.map((c) => c.c).join(""), "艹早");
  const j = g.join(g.me, g.me.cards.map((c) => c.id));
  assert.ok(j.ok, j.why);
  assert.equal(g.me.cards.map((c) => c.c).join(""), "草");
  const [ishi] = setHand(g, g.me, "石");
  assert.equal(g.split(g.me, [ishi]).ok, false, "石 は割れない");
});

// ---- 小1 だけ放てない語（KJ-044 追記）----
test("小1 だけ外す語：一覧の語は小1 で放てない・N5 N4 では放てる。CPU もヒントも使わない", () => {
  assert.ok(D.blocked_words_g1.version);
  assert.ok(D.blocked_words_g1.words.includes("買春"));
  // 本物の一覧の語は、小1 の手に持てる字では作れない（買 が80字にない）ので、いまは何も外れない。N4 には効かない
  assert.ok(!TG1.WORDS.has("買春") && T4.WORDS.has("買春"), "買春：小1 では語の表に無い・N4 には有る");
  assert.equal(TG1.WORDS.size, D.words.stats.by_level.G1.total, "本物の一覧では小1 の語の数は変わらない");
  assert.equal(T4.BLOCKED.size, 0);
  assert.equal(T.BLOCKED.size, 0);
  // 小1 で放てる語を一覧に入れた版で確かめる（山川・大人）
  const D2 = { ...D, blocked_words_g1: { ...D.blocked_words_g1, words: ["山川", "大人"] } };
  const L1 = K.makeTables(D2, "G1"), L4 = K.makeTables(D2, "N4"), L5 = K.makeTables(D2, "N5");
  assert.ok(TG1.WORDS.has("山川") && TG1.WORDS.has("大人"), "もとは放てる語");
  assert.ok(!L1.WORDS.has("山川") && !L1.WORDS.has("大人"), "小1 では語の表から外れる");
  assert.equal(L1.WORDS.size, TG1.WORDS.size - 2);
  assert.ok(L4.WORDS.has("山川") && L4.WORDS.has("大人") && L5.WORDS.has("山川"), "N5・N4 では放てる");
  assert.ok(!L1.COMMON_WORDS.some((w) => w.w === "山川" || w.w === "大人"), "CPU は使わない");
  // 放てない：手札に 山川 を持っていても、小1 ではじかれる。N4 では通る
  const opts = { now: () => 1000, rand: () => 0.5, date: () => new Date(2026, 10, 23), opponent: "solo" };
  const gG = K.createGame(D2, L1, opts);
  setHand(gG, gG.me, "山川");
  assert.equal(gG.canRelease(gG.me, gG.me.cards.map((c) => c.id)).ok, false, "小1 では 山川 を放てない");
  const g4 = K.createGame(D2, L4, opts);
  setHand(g4, g4.me, "山川");
  assert.equal(g4.canRelease(g4.me, g4.me.cards.map((c) => c.id)).ok, true, "N4 では 山川 を放てる");
  // ヒントは語の表（T.WORDS）から探すので、外した語は出ない（CPU の COMMON_WORDS も同じ表から作る）
});
