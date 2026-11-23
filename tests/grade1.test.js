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

test("小1：N5・N4 は小1 を足したことでは動かない（N4 の数は小1 を足す前のまま。N5 は P-047 で 玉＝王＋丶 を足して 王・止 が手に持てる字になり、語が38語 N4→N5）", () => {
  // 語の数は KJ-032（地名・名字を足す・買春 売春 を外す）で N5 2458→2466・N4 10438→10460。KJ-068（D-087）で 売女・売色 も全レベルで外し N5 2465・N4 10458。字と手に持てる字は動かない
  assert.deepEqual([T.CHARS.size, T.WORDS.size, T.HOLD.size], [103, 2465, 140]);
  assert.deepEqual([T4.CHARS.size, T4.WORDS.size, T4.HOLD.size], [284, 10458, 353]);
  for (const w of T4.WORDS.values()) assert.ok(w.lv === "N5" || w.lv === "N4", w.w);
  for (const w of D.words.words.filter((x) => x.lv === null)) assert.ok(w.g1 && !T4.WORDS.has(w.w) && !T.WORDS.has(w.w), `${w.w} は小1 だけの語`);
});

test("小1：放てる言葉は、80字と、割る・くっつけるなどで手に持てる字だけで書ける語。1字から四字熟語まで", () => {
  const ws = [...TG1.WORDS.values()];
  assert.ok(ws.length > 2000 && ws.length < 2600, `語 ${ws.length}`); // KJ-070（D-089）：同音で N5 の字が手に持てるようになり 1376→2316
  // 小1 だけ外す語（data/blocked_words_g1.json）のうち、小1 の字で書ける語（KJ-068：工口・花町）の分だけ、統計より少ない
  const g1Writable = D.blocked_words_g1.words.filter((x) => D.words.words.some((w) => w.w === x && w.g1)).length;
  assert.equal(ws.length, D.words.stats.by_level.G1.total - g1Writable);
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
  // 本物の一覧の語は、小1 の手に持てる字では作れない（買 が80字にない）ので、小1 の字で書ける語（工口・花町）だけが外れる。N4 には効かない
  // 買春 は KJ-032（D-048）で全レベルの一覧（data/blocked_words.json）にも入り、words から外れた。N4 にも無い
  assert.ok(!TG1.WORDS.has("買春") && !T4.WORDS.has("買春"), "買春：小1 にも N4 にも無い（全レベルで外した）");
  // KJ-068（D-087）：小1 だけ外す語は8語。小1 の字で書ける 工口・花町 の2語だけが小1 の表から外れる（残り6語は手に持てない字を含むので、もとから小1 に無い）
  assert.deepEqual([...D.blocked_words_g1.words].sort(), ["買春", "飯売女", "引手茶屋", "穴兄弟", "未通女", "肉体文学", "合意心中", "工口", "花町"].sort());
  for (const w of ["工口", "花町"]) assert.ok(!TG1.WORDS.has(w) && !TG1.COMMON_WORDS.some((x) => x.w === w), `${w}：小1 では外れる（CPU も使わない）`);
  for (const w of ["工口", "花町"]) assert.ok(T4.WORDS.has(w), `${w}：N4 では残る`);
  assert.ok(T.WORDS.has("工口"), "工口：N5 でも残る");
  for (const w of ["飯売女", "引手茶屋", "穴兄弟", "未通女", "肉体文学", "合意心中"]) {
    assert.ok(!TG1.WORDS.has(w), `${w}：小1 では放てない`);
    assert.ok(T4.WORDS.has(w), `${w}：N4 では今まで通り放てる`);
  }
  assert.equal(TG1.WORDS.size, D.words.stats.by_level.G1.total - 2, "小1 の表は、工口・花町 の2語だけ統計より少ない");
  assert.equal(TG1.BLOCKED.size, D.blocked_words_g1.words.length);
  assert.equal(T4.BLOCKED.size, 0);
  assert.equal(T.BLOCKED.size, 0);
  // 小1 で放てる語を一覧に入れた版で確かめる（山川・大人）
  const D2 = { ...D, blocked_words_g1: { ...D.blocked_words_g1, words: ["山川", "大人"] } };
  const L1 = K.makeTables(D2, "G1"), L4 = K.makeTables(D2, "N4"), L5 = K.makeTables(D2, "N5");
  assert.ok(TG1.WORDS.has("山川") && TG1.WORDS.has("大人"), "もとは放てる語");
  assert.ok(!L1.WORDS.has("山川") && !L1.WORDS.has("大人"), "小1 では語の表から外れる");
  assert.equal(L1.WORDS.size, D.words.stats.by_level.G1.total - 2, "差し替えた一覧（山川・大人）の分だけ、統計より2語少ない");
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

// ---- 小1 でも Same reading の行き先を N5 の字まで広げる（KJ-070・D-089）----
const N5ONLY = (c) => D.kanji.kanji.some((k) => k.c === c && k.lv === "N5" && !k.g1); // N5 の字で小1 の80字でない

test("小1・同音：五 は 午・後・語 に変えられる（小1 の80字に ゴ の字は 五 だけだった）。待ち時間・同じ読みでない字ははじく", () => {
  assert.deepEqual([...K.homoChars(TG1, "五")].sort(), [..."午後語"].sort());
  const g = newGame(5, "solo", "G1");
  for (const to of "午後語") {
    g.clock.t += D.rules.cooldown_sec.homophone;
    const [id] = setHand(g, g.me, "五");
    const r = g.homophone(g.me, [id], to);
    assert.ok(r.ok, `五→${to}：${r.why}`);
    assert.equal(g.me.cards.map((c) => c.c).join(""), to);
  }
  const [id2] = setHand(g, g.me, "五");
  g.clock.t += D.rules.cooldown_sec.homophone;
  assert.equal(g.homophone(g.me, [id2], "言").ok, false, "ゴ でない字には変えられない");
});

test("小1・同音：行き先に入る N5 の字は「N5 の字で小1 の80字でない字」だけ。N4 の字・N5 の字どうしだけの組へは行かない。山には入らない", () => {
  const extra = [...TG1.HOMO_ONLY];
  assert.ok(extra.length > 0);
  for (const c of extra) assert.ok(N5ONLY(c) && !TG1.CHARS.has(c) && TG1.HOLD.has(c) && K.isChar(TG1, c), `${c}`);
  for (const [c, groups] of TG1.HOMO) {
    for (const g of groups) {
      assert.ok(g.chars.some((x) => TG1.CHARS.has(x) || TG1.OUTSIDE.has(x)), `${c}：80字（か巡りの外の字）を含まない組`);
      for (const x of g.chars) assert.ok(TG1.CHARS.has(x) || TG1.OUTSIDE.has(x) || N5ONLY(x), `${x} は N4 の字か範囲の外`);
    }
  }
  assert.equal(TG1.CHARS.size, 80, "山の字は80字のまま");
  for (const c of extra) assert.ok(!TG1.CHARS.has(c) && !TG1.OUTSIDE.has(c), `${c} は山にも巡りの外にも入らない`);
});

test("小1・同音：同じ読みの字が無い字は 20→13（80字のうち）。同音で手に入った N5 の字は 反転・巡り・割る・放つ も今まで通り", () => {
  const none = (L) => [...L.CHARS].filter((c) => !K.homoChars(L, c).length);
  assert.equal(none(TG1).length, 13);
  assert.ok(!none(TG1).includes("五"));
  // 午 は 十二支の字（巡りの outside ではない）。小1 では巡らない（D-027 の 80字の決めのまま）
  assert.equal(TG1.OUTSIDE.size, 0);
  // 手に持てる字が増えたぶん、語が増える。手に持てる字だけで書ける語
  assert.equal(TG1.HOLD.size, D.words.stats.hold_by_level.G1);
  assert.ok(TG1.WORDS.has("午後"), "午後（午・後 は同音でだけ出会える）");
  for (const w of TG1.WORDS.values()) for (const c of w.w) assert.ok(TG1.HOLD.has(c), `${w.w} の ${c}`);
  // 手に持った N5 の字で、語は放てる
  const g = newGame(5, "solo", "G1");
  setHand(g, g.me, "午後");
  assert.ok(g.canRelease(g.me, g.me.cards.map((c) => c.id)).ok, "午後 を放てる");
});

test("小1・同音：N5・N4 は今まで通り（N5 は N5 の字の中、N4 は N4 の字の中）。N5・N4 に HOMO_ONLY は無い", () => {
  assert.equal(T.HOMO_ONLY.size, 0);
  assert.equal(T4.HOMO_ONLY.size, 0);
  for (const L of [T, T4]) for (const [, groups] of L.HOMO) for (const g of groups) for (const c of g.chars) assert.ok(L.CHARS.has(c) || L.OUTSIDE.has(c), `${L.level}：${c}`);
  assert.deepEqual([T.CHARS.size, T.WORDS.size, T.HOLD.size], [103, 2465, 140]);
  assert.deepEqual([T4.CHARS.size, T4.WORDS.size, T4.HOLD.size], [284, 10458, 353]);
});

