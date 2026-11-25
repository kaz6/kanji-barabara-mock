// KJ-077（D-095）：丶 の行き先を増やす。くっつける 水＋丶＝氷・九＋丶＝丸・刀＋丶＝刃・几＋丶＝凡・勹＋丶＝勺。割ると 丶 が出る
// 行き先だけの字（data/parts.json の reach）：山には入らない。左右の部品が両方そのレベルで手に入るときだけ使う（js/core.js の T.REACH）
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, T4, TG1, newGame, setHand } = require("./helpers");

const chars = (cards) => cards.map((x) => x.c).join("");
const REACH = { 氷: ["水", "丶"], 丸: ["九", "丶"], 刃: ["刀", "丶"], 凡: ["几", "丶"], 勺: ["勹", "丶"] };

test("行き先だけの字：データは5つ。並べる順は 水丶・九丶・刀丶・几丶・勹丶。字として見せる（jouyou）。山に入る字ではない", () => {
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
  assert.deepEqual([...TG1.REACH].sort(), ["丸", "刃", "氷"].sort());
  assert.deepEqual([...T.REACH].sort(), ["丸", "刃", "氷"].sort());
  assert.deepEqual([...T4.REACH].sort(), ["丸", "刃", "凡", "氷"].sort());
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
  assert.deepEqual([TG1, T, T4].map((L) => Object.keys(L.parts).length - L.REACH.size), [75, 68, 220], "割り方の数（小1・N5・N4）は足す前のまま（N4 は 旦 の1行が増えた。KJ-098）");
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
