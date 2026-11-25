// KJ-083（D-101）：部品の札を選んだとき、自分の手札・ストックにくっつく相手があれば、台の行にそれを出す
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T4 } = require("./helpers");

const card = (id, c, tray) => ({ id, c, t: 0, fresh: false, tray: !!tray });
const hand = (s, trays = "") => [...[...s].map((c, i) => card(i + 1, c)), ...[...trays].map((c, i) => card(100 + i, c, true))];
const withMode = (m) => ({ ...D, rules: { ...D.rules, join_note: m } });
const note = (cs, sel, mode = "full") => K.joinNote(withMode(mode), T4, cs, cs.find((x) => x.c === sel));

test("KJ-083 手札に相手が今あるときだけ「くっつく：禾＋火→秋」が出る", () => {
  assert.equal(note(hand("禾火日山"), "禾"), "くっつく：禾＋火→秋");
  assert.equal(note(hand("禾日山川"), "禾"), null, "手元に相手が無ければ出さない（一般にくっつく字は見せない）");
});

test("KJ-083 ストックにある相手も数える", () => {
  assert.equal(note(hand("禾日山川", "火"), "禾"), "くっつく：禾＋火→秋");
});

test("KJ-083 字の札では出ない。選んだ札自身は相手にならない", () => {
  assert.ok(!K.isChar(T4, "禾"));
  assert.equal(note(hand("火禾"), "火"), null, "火 は字の札");
  assert.equal(note(hand("禾"), "禾"), null, "自分しかいない");
  assert.deepEqual(K.joinPartners(T4, hand("花艹"), null), []);
});

test("KJ-083 並べる順どおりに書く（先に置くほうが左）。向きが両方あれば両方", () => {
  const t = note(hand("艹化"), "艹");
  assert.equal(t, "くっつく：艹＋化→花");
  const t2 = note(hand("一卜"), "卜");
  assert.ok(t2.includes("卜＋一→上") && t2.includes("一＋卜→下"), t2);
  assert.equal(note(hand("卜夕"), "卜"), "くっつく：夕＋卜→外", "相手が左に来る向きは相手を先に書く");
});

test("KJ-083 できる字が2つ以上の組は「・」でつなぐ", () => {
  assert.equal(K.joinResults(T4, "大", "丶").length, 2);
  assert.equal(note(hand("丶大"), "丶"), "くっつく：大＋丶→太・犬");
});

test("KJ-083 3組まで。それ以上は「ほか N組」", () => {
  assert.equal(note(hand("辶周首"), "辶").split("　").length, 2);
  const four = note(hand("辶周首甬隹"), "辶");
  assert.equal(four, "くっつく：辶＋周→週　辶＋首→道　辶＋甬→通　ほか1組");
  const six = note(hand("辶周首甬隹斤軍"), "辶");
  assert.ok(six.endsWith("ほか3組"), six);
  assert.equal(six.split("　").length, 4);
});

test("KJ-083 同じ組は1つにまとめる（同じ札が2枚あっても）", () => {
  assert.equal(note(hand("禾火火"), "禾"), "くっつく：禾＋火→秋");
});

test("KJ-083 rules の join_note で3つの形が切り替わる（初期値は full）", () => {
  assert.equal(D.rules.join_note, "full");
  assert.deepEqual(K.JOIN_NOTE_MODES, ["full", "partner", "mask"]);
  const cs = hand("禾火日");
  assert.equal(note(cs, "禾", "full"), "くっつく：禾＋火→秋");
  assert.equal(note(cs, "禾", "partner"), "くっつく：禾＋火");
  assert.equal(note(cs, "禾", "mask"), "くっつく：禾＋？");
  assert.equal(note(hand("卜夕"), "卜", "mask"), "くっつく：？＋卜", "選んだ札が右に来る向きは ？＋卜");
  assert.equal(note(hand("日山"), "禾", "mask"), null, "どの形でも、相手が無ければ出ない");
  assert.equal(K.joinNote({ ...D, rules: { ...D.rules, join_note: undefined } }, T4, cs, cs[0]), "くっつく：禾＋火→秋", "値が無ければ full");
});

test("KJ-083 mask は同じ形をまとめる（辶＋？は1つ）", () => {
  assert.equal(note(hand("辶周首甬"), "辶", "mask"), "くっつく：辶＋？");
});
