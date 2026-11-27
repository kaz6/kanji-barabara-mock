// KJ-077（D-095）：丶 の行き先を増やす。くっつける 水＋丶＝氷・九＋丶＝丸・刀＋丶＝刃・几＋丶＝凡・勹＋丶＝勺。割ると 丶 が出る
// 行き先だけの字（data/parts.json の reach）：山には入らない。左右の部品が両方そのレベルで手に入るときだけ使う（js/core.js の T.REACH）
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, T4, TG1, newGame, setHand, hintNow } = require("./helpers");

const chars = (cards) => cards.map((x) => x.c).join("");
const cardsAll = (g) => [...g.deck, ...g.me.cards.map((x) => x.c), ...g.cpu.cards.map((x) => x.c), ...g.field.map((x) => x.c)];
const REACH = { 氷: ["水", "丶"], 丸: ["九", "丶"], 刃: ["刀", "丶"], 凡: ["几", "丶"], 勺: ["勹", "丶"], 旧: ["｜", "日"], 良: ["丶", "艮"] };
// KJ-113：旧＝｜＋日 も行き先だけの字（reach に足した）。｜ は 中・引 を割ると出る部品

test("行き先だけの字：データは7つ（KJ-113 で 旧、KJ-137 で 良 を足した）。並べる順は 水丶・九丶・刀丶・几丶・勹丶・｜日・丶艮。字として見せる（jouyou）。山に入る字ではない", () => {
  assert.deepEqual(D.parts.reach, REACH);
  for (const c of Object.keys(REACH)) {
    assert.ok(D.parts.jouyou.includes(c), `${c} は jouyou（字として見せる）`);
    assert.ok(!D.kanji.kanji.some((k) => k.c === c), `${c} は山に入る字ではない`);
    assert.ok(!D.parts.parts[c], `${c} は parts（割り方の表）には入れない`);
    assert.ok(D.split_shapes.shapes[c], `${c} に形がある`);
  }
  for (const c of ["凡", "勺"]) assert.equal(D.split_shapes.shapes[c].kind, "囲み", `${c} は囲み（丶 が中）`);
  assert.equal(D.split_shapes.shapes["凡"].out, 0);
});

test("レベルごとの出番：小1・N5 は 氷・丸・刃、N4 は さらに 凡。勺（勹 が手に入らない）はどのレベルでも出番なし", () => {
  assert.deepEqual([...TG1.REACH].sort(), ["丸", "刃", "旧", "氷"].sort());
  assert.deepEqual([...T.REACH].sort(), ["丸", "刃", "旧", "氷"].sort());
  assert.deepEqual([...T4.REACH].sort(), ["丸", "刃", "凡", "旧", "氷", "良"].sort());
  for (const L of [TG1, T, T4]) {
    assert.deepEqual(L.JOIN.get("勹丶"), undefined, "勹丶 は どのレベルでも使えない");
    assert.ok(!L.parts["勺"]);
  }
  assert.ok(!T.JOIN.has("几丶") && !TG1.JOIN.has("几丶"), "几 は N4 の風 でだけ手に入る");
  assert.ok(D.parts.parts["風"] && !T.parts["風"]);
});

test("くっつける：水＋丶＝氷・九＋丶＝丸・刀＋丶＝刃（小1・N5・N4）、几＋丶＝凡（N4）。順が逆ではくっつかない", () => {
  for (const [L, lv] of [[TG1, "G1"], [T, "N5"], [T4, "N4"]]) {
    assert.deepEqual(K.joinResults(L, "水", "丶"), ["氷"], lv);
    assert.deepEqual(K.joinResults(L, "九", "丶"), ["丸"], lv);
    assert.deepEqual(K.joinResults(L, "刀", "丶"), ["刃"], lv);
    assert.deepEqual(K.joinResults(L, "丶", "水"), [], `${lv}：逆順は通らない`);
    const g = newGame(1, "normal", lv);
    assert.equal(chars(g.join(g.me, setHand(g, g.me, "水丶")).cards), "氷", lv);
  }
  assert.deepEqual(K.joinResults(T4, "几", "丶"), ["凡"]);
  const g = newGame(1, "normal", "N4");
  assert.equal(chars(g.join(g.me, setHand(g, g.me, "几丶")).cards), "凡");
  const g5 = newGame(1, "normal", "N5");
  assert.equal(g5.join(g5.me, setHand(g5, g5.me, "几丶")).ok, false, "N5 では 凡 にならない");
});

test("割る：氷→水・丶、丸→九・丶、刃→刀・丶、凡→几・丶。ほかの 丶 の字（玉・主・太・犬）は今のまま", () => {
  for (const [c, lv, parts] of [["氷", "N4", "水丶"], ["丸", "N4", "九丶"], ["刃", "N4", "刀丶"], ["凡", "N4", "几丶"], ["氷", "G1", "水丶"], ["丸", "N5", "九丶"]]) {
    const g = newGame(1, "normal", lv);
    const [id] = setHand(g, g.me, c);
    assert.equal(chars(g.split(g.me, [id]).cards), parts, `${c}（${lv}）`);
  }
  const g = newGame(1, "normal", "N4");
  const [d] = setHand(g, g.me, "犬");
  assert.equal(chars(g.split(g.me, [d]).cards), "大丶");
  assert.deepEqual(K.joinResults(T4, "王", "丶"), ["玉"]);
  assert.deepEqual(K.joinResults(T4, "丶", "王"), ["主"]);
  assert.deepEqual(K.joinResults(T4, "大", "丶"), ["太", "犬"]);
});

test("ほかの組は動かない：行き先を足した行を除くと、くっつける表は足す前と同じ数。同じ左右から2つできる組は 十口 と 大丶 のまま（N4 は 日一＝目・旦 が増える。KJ-098）", () => {
  for (const L of [TG1, T, T4]) {
    const base = Object.keys(L.parts).filter((k) => !L.REACH.has(k));
    assert.equal(base.length + L.REACH.size, Object.keys(L.parts).length);
    const multi = [...L.JOIN].filter(([, v]) => v.length > 1).map(([k]) => k);
    assert.ok(multi.every((k) => k === "十口" || k === "大丶" || k === "日一"), multi.join());
  }
  assert.deepEqual([TG1, T, T4].map((L) => Object.keys(L.parts).length - L.REACH.size), [75, 68, 221], "割り方の数（小1・N5・N4）は足す前のまま（N4 は 旦〔KJ-098〕と 耂〔KJ-114〕の2行が増えた）");
});

test("面で落とす：氷は 水 の右に 丶（水を丶の左へ）、凡は 丶 を 几 の中央へ", () => {
  assert.deepEqual(K.faceJoins(T4, "水", "丶"), { left: ["氷"] });
  assert.deepEqual(K.faceJoins(T4, "丶", "水"), { right: ["氷"] });
  assert.deepEqual(K.faceJoins(T4, "丶", "几"), { center: ["凡"] });
});

test("語：氷山・丸太・日の丸 などが放てる。凡人 は N4 から。氷・丸・刃 の字も手に持てる字", () => {
  for (const w of ["氷山", "氷水", "一丸", "刃先", "出刃"]) assert.ok(T.WORDS.has(w), `N5：${w}`);
  assert.ok(!T.WORDS.has("丸太") && T4.WORDS.has("丸太"), "丸太 は 太 が N4 の字なので N4 から");
  assert.ok(!T.WORDS.has("凡人") && T4.WORDS.has("凡人"), "凡人 は N4 から");
  assert.ok(T4.WORDS.has("自刃"), "自刃 は外していない（作者が決める）");
  for (const c of "氷丸刃") assert.ok(T.HOLD.has(c) && TG1.HOLD.has(c) && T4.HOLD.has(c), c);
  assert.ok(!T.HOLD.has("凡") && T4.HOLD.has("凡"));
  assert.ok(K.isChar(T4, "氷") && K.isChar(T4, "凡"), "字として見せる");
});

test("はじまりのストック：使いやすい部品の上位に 丶 が入る（どのレベルでも）", () => {
  for (const lv of ["G1", "N5", "N4"]) {
    const g = newGame(1, "normal", lv);
    assert.ok(g.stockCandidates.map((x) => x.c).includes("丶"), lv);
  }
});

// KJ-113：｜＋日＝旧（行き先だけの字）
test("旧：くっつける ｜＋日＝旧（小1・N5・N4）。順が逆（日＋｜）ではくっつかない。ほかの組は増えない", () => {
  for (const [L, lv] of [[TG1, "G1"], [T, "N5"], [T4, "N4"]]) {
    assert.deepEqual(K.joinResults(L, "｜", "日"), ["旧"], lv);
    assert.deepEqual(K.joinResults(L, "日", "｜"), [], `${lv}：逆順は通らない`);
    const g = newGame(1, "normal", lv);
    assert.equal(chars(g.join(g.me, setHand(g, g.me, "｜日")).cards), "旧", lv);
    const g2 = newGame(1, "normal", lv);
    assert.equal(g2.join(g2.me, setHand(g2, g2.me, "日｜")).ok, false, `${lv}：日｜ ではくっつかない`);
  }
});

test("旧：割ると ｜ と 日（ほかの ｜ の字・中・引 は今のまま）。山に入る字ではない", () => {
  for (const lv of ["G1", "N5", "N4"]) {
    const g = newGame(1, "normal", lv);
    const [id] = setHand(g, g.me, "旧");
    assert.equal(chars(g.split(g.me, [id]).cards), "｜日", lv);
    const g3 = newGame(1, "normal", lv);
    assert.ok(!cardsAll(g3).includes("旧"), `${lv}：旧 は山・場・手札に出ない`);
  }
  assert.deepEqual(K.joinResults(T4, "口", "｜"), ["中"]);
  assert.deepEqual(K.joinResults(T4, "弓", "｜"), ["引"]);
  assert.deepEqual(D.split_shapes.shapes["旧"], { s: "lr", at: 0.25, q: true });
});

test("旧：面で落とす（｜ を 日 の左へ・日 を ｜ の右へ）。字として見せる・手に持てる字（3レベルとも）", () => {
  for (const L of [TG1, T, T4]) {
    assert.deepEqual(K.faceJoins(L, "｜", "日"), { left: ["旧"] });
    assert.deepEqual(K.faceJoins(L, "日", "｜"), { right: ["旧"] });
    assert.ok(K.isChar(L, "旧") && L.HOLD.has("旧"));
  }
  assert.ok(D.parts.jouyou.includes("旧"));
  assert.ok(!D.kanji.kanji.some((k) => k.c === "旧") && !D.parts.parts["旧"]);
});

test("旧：語が放てる（辞書にある語だけ。手で足していない）。レベルごとの数は 小1 18・N5 16・N4 49", () => {
  const n = (L) => [...L.WORDS.keys()].filter((w) => w.includes("旧")).length;
  assert.deepEqual([n(TG1), n(T), n(T4)], [18, 16, 49]);
  for (const w of ["旧友", "新旧", "旧人"]) assert.ok(TG1.WORDS.has(w) && T.WORDS.has(w) && T4.WORDS.has(w), w);
  assert.ok(!T.WORDS.has("旧式") && T4.WORDS.has("旧式"), "旧式 は 式 が N4 の字なので N4 から");
  assert.equal(D.words.words.filter((x) => x.w.includes("旧")).every((x) => [...x.w].every((c) => c === "旧" || c === "る" || (D.kanji.kanji.some((k) => k.c === c) || D.parts.jouyou.includes(c) || D.parts.reach[c]))), true);
});

test("旧：1字では放てない。旧友 は放てる。CPU も 旧 を使う（新旧を放つ・｜日 をくっつける）。ヒントも旧友を指す", () => {
  const g = newGame(1, "normal", "N5");
  const [one] = setHand(g, g.me, "旧");
  assert.equal(g.release(g.me, [one]).ok, false, "1字は放てない");
  const g2 = newGame(1, "normal", "N5");
  assert.equal(g2.release(g2.me, setHand(g2, g2.me, "旧友")).ok, true, "旧友 は N5 で放てる");
  const g3 = newGame(1, "normal", "N5");
  setHand(g3, g3.cpu, "新旧");
  const r = g3.cpuTurn();
  assert.ok(r && r.ok, r && r.why);
  assert.ok(g3.isUsed("新旧"), "新旧（CPU が知っている語）を放った");
  const g5 = newGame(1, "normal", "N5");
  setHand(g5, g5.cpu, "｜日新");
  const r5 = g5.cpuTurn();
  assert.ok(r5 && r5.ok, r5 && r5.why);
  assert.ok(g5.cpu.cards.some((x) => x.c === "旧"), "CPU は ｜日 をくっつけて 旧 にする");
  const g4 = newGame(1, "weak", "N5");
  const ids = setHand(g4, g4.me, "旧友");
  hintNow(g4);
  const h = g4.hintActive();
  assert.equal(h.word, "旧友");
  assert.deepEqual([...h.ids].sort(), [...ids].sort());
});

// KJ-137：丶＋艮＝良（行き先だけの字。丶 が上）。艮 は N4 で 銀 を割ると出る部品
test("良：N4 でだけ出番（艮 が N4 でしか手に入らない）。小1・N5 では くっつかない", () => {
  assert.ok(T4.REACH.has("良") && !T.REACH.has("良") && !TG1.REACH.has("良"));
  assert.deepEqual(K.joinResults(T4, "丶", "艮"), ["良"]);
  assert.deepEqual(K.joinResults(T4, "艮", "丶"), [], "逆順（艮＋丶）は通らない");
  for (const L of [T, TG1]) assert.deepEqual(K.joinResults(L, "丶", "艮"), []);
  assert.deepEqual(D.parts.reach["良"], ["丶", "艮"]);
  assert.ok(D.parts.jouyou.includes("良") && !D.parts.parts["良"] && !D.kanji.kanji.some((k) => k.c === "良"));
  assert.deepEqual(D.split_shapes.shapes["良"], { s: "tb", at: 0.2, q: true });
});

test("良：銀 を割って 艮 を出し、丶 とくっつけて 良。割ると 丶 と 艮 に戻る。山に入る字ではない", () => {
  const g = newGame(1, "normal", "N4");
  const [id] = setHand(g, g.me, "銀");
  assert.equal(chars(g.split(g.me, [id]).cards), "金艮");
  const g2 = newGame(1, "normal", "N4");
  assert.equal(chars(g2.join(g2.me, setHand(g2, g2.me, "丶艮")).cards), "良");
  const g3 = newGame(1, "normal", "N4");
  assert.equal(g3.join(g3.me, setHand(g3, g3.me, "艮丶")).ok, false, "艮丶 ではくっつかない");
  const g4 = newGame(1, "normal", "N4");
  const [rid] = setHand(g4, g4.me, "良");
  assert.equal(chars(g4.split(g4.me, [rid]).cards), "丶艮");
  const g5 = newGame(1, "normal", "N4");
  assert.ok(!cardsAll(g5).includes("良"), "良 は山・場・手札に出ない");
});

test("良：面で落とす（丶 を 艮 の上へ・艮 を 丶 の下へ）。手に持てる字（N4）", () => {
  assert.deepEqual(K.faceJoins(T4, "丶", "艮"), { top: ["良"] });
  assert.deepEqual(K.faceJoins(T4, "艮", "丶"), { bottom: ["良"] });
  assert.ok(K.isChar(T4, "良") && T4.HOLD.has("良"));
});

test("良：語が放てる（N4 で 37 語。小1・N5 では増えない）。不良・良好・野良犬 など", () => {
  const n = (L) => [...L.WORDS.keys()].filter((w) => w.includes("良")).length;
  assert.deepEqual([n(TG1), n(T), n(T4)], [0, 0, 37]);
  for (const w of ["不良", "良好", "良心", "野良犬", "改良"].filter((w) => T4.WORDS.has(w))) assert.ok(T4.WORDS.has(w), w);
  assert.ok(T4.WORDS.has("不良") && T4.WORDS.has("良好") && T4.WORDS.has("野良犬"));
  assert.ok(!T.WORDS.has("不良") && !TG1.WORDS.has("不良"));
  const g = newGame(1, "normal", "N4");
  assert.equal(g.release(g.me, setHand(g, g.me, "不良")).ok, true, "不良 は N4 で放てる");
  const g2 = newGame(1, "normal", "N4");
  const [one] = setHand(g2, g2.me, "良");
  assert.equal(g2.release(g2.me, [one]).ok, false, "1字は放てない");
});
