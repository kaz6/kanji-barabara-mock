// KJ-094：戦況の文（K.senkyoLines）と、その型・背景の記事の文（js/strings.js の SENKYO・NEWS）。DOM に触らない
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, newGame, setHand, takeAll } = require("./helpers");
const STR = require("../js/strings.js");

const kana = (text) => { const w = T.WORDS.get(text); return w && w.kana ? w.kana : ""; };
const lines = (g) => K.senkyoLines(g.log, { me: g.me.name, tpl: STR.SENKYO, kana });
const L = (who, w, pts, op = "放つ") => ({ op, who, from: [...w], to: [], pts });

test("ひらがな→カタカナ：あなた→アナタ。CPU・漢字・カタカナ・記号はそのまま", () => {
  assert.equal(K.toKatakana("あなた"), "アナタ");
  assert.equal(K.toKatakana("くうはく"), "クウハク");
  assert.equal(K.toKatakana("きゃ・ゔ"), "キャ・ヴ");
  assert.equal(K.toKatakana("CPU"), "CPU");
  assert.equal(K.toKatakana("相手ノ手"), "相手ノ手");
});

test("文の型は js/strings.js の SENKYO 1か所（仮）。放った言葉は漢字のまま・点と字数は漢数字・助詞や名前はカタカナ", () => {
  assert.deepEqual(Object.keys(STR.SENKYO).sort(), ["face", "head", "release", "sep", "score", "take", "yomi"].sort());
  assert.equal(STR.SENKYO.head, "戦況");
  const r = K.senkyoLines([L("あなた", "空白", 3)], { me: "あなた", tpl: STR.SENKYO, kana });
  assert.equal(r.length, 1);
  assert.equal(r[0].text, `アナタ、空白（${K.toKatakana(kana("空白"))}）ヲ放ツ。二字ニテ三点。`);
  assert.equal(r[0].word, "空白", "放った言葉そのものは漢字のまま");
  assert.equal(r[0].mine, true);
  // 読みが語の表に無いときは（　）ごと出さない
  const r2 = K.senkyoLines([L("CPU", "学校名", 9)], { me: "あなた", tpl: STR.SENKYO, kana: () => "" });
  assert.equal(r2[0].text, "CPU、学校名ヲ放ツ。三字ニテ九点。");
  assert.equal(r2[0].mine, false);
  // 文の中身（ひらがなが残らない）：名前・助詞・読み・数。放った言葉の外はひらがなを含まない
  for (const x of [r[0], r2[0]]) {
    const outside = x.segs.filter((s) => s.k !== "word").map((s) => s.t).join("");
    assert.ok(!/[ぁ-ゖ]/.test(outside), `${x.text}：言葉の外にひらがなが無い`);
  }
});

test("組んだ印：who・word・それ以外（p）。word は放った言葉そのもの、あなたの行は mine", () => {
  const [x] = K.senkyoLines([L("あなた", "休日", 3), L("あなた", "天上天下", 20, "取る")], { me: "あなた", tpl: STR.SENKYO, kana });
  assert.deepEqual(x.segs.map((s) => s.k), ["who", "p", "word", "p", "p", "p"].slice(0, x.segs.length));
  assert.equal(x.segs[0].t, "アナタ");
  assert.equal(x.segs.find((s) => s.k === "word").t, "休日");
  assert.equal(x.segs.map((s) => s.t).join(""), x.text);
});

test("新しい順（あとに放った言葉が先頭）。放った言葉以外の手（割る・ヒント など）は文にならない", () => {
  const log = [L("あなた", "空白", 3), { op: "割る", who: "あなた", from: ["日"], to: ["一", "口"], pts: 0 }, L("CPU", "学校名", 9), { op: "ヒント", who: "あなた", from: [], to: [], pts: 0 }, L("あなた", "休日", 3)];
  const r = K.senkyoLines(log, { me: "あなた", tpl: STR.SENKYO, kana });
  assert.deepEqual(r.map((x) => x.word), ["休日", "学校名", "空白"]);
  assert.deepEqual(r.map((x) => x.mine), [true, false, true]);
  assert.deepEqual(K.senkyoLines([], { me: "あなた", tpl: STR.SENKYO, kana }), []);
  assert.deepEqual(K.senkyoLines(null, { me: "あなた", tpl: STR.SENKYO, kana }), []);
});

test("場から取った字は、その人のその放ちのあとの 取る を「山札ヨリ新・話ヲ取ル。」と並べる。取っていなければ文ごと出さない。点 0・十以上も漢数字", () => {
  const log = [L("あなた", "空白", 3), L("あなた", "新", 0, "取る"), L("CPU", "学校名", 9), L("あなた", "話", 0, "取る"), L("CPU", "後", 0, "取る"), L("CPU", "道", 0, "取る"), L("CPU", "午", 0, "取る"), L("あなた", "休日", 12)];
  const r = K.senkyoLines(log, { me: "あなた", tpl: STR.SENKYO, kana: () => "" });
  assert.equal(r[2].text, "アナタ、空白ヲ放ツ。二字ニテ三点。山札ヨリ新・話ヲ取ル。", "あなたの 取る は あなたの文へ（CPU の手が間に入っても）");
  assert.equal(r[1].text, "CPU、学校名ヲ放ツ。三字ニテ九点。山札ヨリ後・道・午ヲ取ル。");
  assert.equal(r[0].text, "アナタ、休日ヲ放ツ。二字ニテ十二点。", "まだ取っていなければ「山札ヨリ」は出ない");
  assert.deepEqual(r[2].takes, ["新", "話"]);
  assert.equal(K.senkyoLines([L("あなた", "休日", 0)], { me: "あなた", tpl: STR.SENKYO, kana: () => "" })[0].text, "アナタ、休日ヲ放ツ。二字ニテ〇点。");
});

test("次の放ちのあとの 取る は、次の文のもの。相手の攻撃ワードで効かされた記録（割る）が間に入っても取った字は落ちない", () => {
  const log = [L("あなた", "空白", 3), L("あなた", "新", 0, "取る"), { op: "割る", who: "あなた", from: ["校"], to: ["木", "交"], pts: 0 }, L("あなた", "話", 0, "取る"), L("あなた", "休日", 3), L("あなた", "山", 0, "取る")];
  const r = K.senkyoLines(log, { me: "あなた", tpl: STR.SENKYO, kana: () => "" });
  assert.deepEqual(r.map((x) => x.takes), [["山"], ["新", "話"]]);
  // 静かな記録（ヒント・ためした）は途中にあっても数えるのをやめない
  const log2 = [L("あなた", "空白", 3), { op: "ヒント", who: "あなた", from: [], to: [], pts: 0 }, L("あなた", "新", 0, "取る")];
  assert.deepEqual(K.senkyoLines(log2, { me: "あなた", tpl: STR.SENKYO, kana: () => "" })[0].takes, ["新"]);
});

test("本物の試合の記録から：あなたが放つと文になり、取るたびに文の終わりが増える。CPU の名前はそのまま", () => {
  const g = newGame(3, "weak");
  setHand(g, g.me, "休日");
  assert.deepEqual(lines(g), [], "放つ前は何も無い");
  const r = g.release(g.me, g.me.cards.map((x) => x.id));
  assert.ok(r.ok);
  let l = lines(g);
  assert.equal(l.length, 1);
  assert.equal(l[0].text, `アナタ、休日（${K.toKatakana(kana("休日"))}）ヲ放ツ。二字ニテ三点。`);
  assert.equal(l[0].mine, true);
  const c1 = g.field[0].c;
  g.take(g.me, g.field[0].id);
  l = lines(g);
  assert.ok(l[0].text.endsWith(`山札ヨリ${c1}ヲ取ル。`), l[0].text);
  takeAll(g, g.me);
  l = lines(g);
  assert.equal(l[0].takes.length, 2, "放った字数と同じ枚数");
  assert.match(l[0].text, /山札ヨリ.+・.+ヲ取ル。$/);
  // CPU が放つ：名前は CPU のまま・あなたの行ではない
  setHand(g, g.cpu, "学校");
  g.addLog(g.cpu.name, "放つ", [..."学校"], [], 6, "");
  l = lines(g);
  assert.equal(l[0].who, g.cpu.name);
  assert.equal(l[0].mine, false);
  assert.match(l[0].text, /^CPU、学校/);
});

test("使用済みの語が文の中の word で読める（同じ語はもう放てない）", () => {
  const g = newGame(4, "weak");
  setHand(g, g.me, "休日");
  g.release(g.me, g.me.cards.map((x) => x.id));
  const words = lines(g).map((x) => x.word);
  assert.ok(words.every((w) => g.used.has(w)), "文に出た語は全部、使用済み");
  assert.deepEqual(words, ["休日"]);
});

test("背景の記事の文（NEWS）：見本「新聞21」の文。遊びの決まりと食い違わない数（三字九点・四字十二点・引き直し五度）", () => {
  assert.equal(typeof STR.NEWS, "string");
  assert.ok(STR.NEWS.length >= 150, "繰り返しの1回ぶん");
  assert.ok(STR.NEWS.startsWith("本紙特報。"));
  assert.match(STR.NEWS, /三字ノ言葉ハ九点、四字ハ十二点/);
  assert.match(STR.NEWS, /引直シハ五度マデ/);
});

test("背景の記事の数は、決まり（data/rules.json）と同じ：3字9点・4字12点・四字熟語は倍・引き直しは5度（値段が5つ）", () => {
  assert.equal(D.rules.score.by_length["3"], 9);
  assert.equal(D.rules.score.by_length["4"], 12);
  assert.equal(D.rules.score.yoji_mult, 2);
  assert.equal(D.rules.redraw.costs.length, 5);
  assert.equal(STR.NEWS.length > 0, true);
});
