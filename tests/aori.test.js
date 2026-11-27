// 煽り文句（KJ-126）：終わりの画面（K.aoriLine。遊んだ本人を褒める）と戦果の共有（K.aoriShareLine。見た人を呼び込む）。型は js/strings.js の AORI・AORI_SHARE（仮）
const test = require("node:test");
const assert = require("node:assert/strict");
const { K } = require("./helpers");
const STR = require("../js/strings.js");

const it = (text, pts = 3, special = false) => ({ text, pts, special });
const d = (kind, me, cpu, items = [], by50 = false) => ({ kind, label: "", me, cpu, items, missed: null, by50 });
const line = (x) => K.aoriLine(x, STR.AORI);
const n = (x) => K.kansuji(x);
const share = (x) => K.aoriShareLine(x, STR.AORI_SHARE, n);

test("終わりの画面：上から順に見て最初に合ったもの（9通り）", () => {
  assert.equal(line(d("lose", 0, 50)), "沈黙の一戦、語らずして幕", "言葉なしは勝ち負けより先");
  assert.equal(line(d("win", 50, 10, [it("休日"), it("金玉", 12, true)], true)), "金玉、ここに極まれり！", "特別な語が先（4字も50点も後）");
  assert.equal(line(d("win", 50, 10, [it("休日"), it("大問題大", 12)], true)), "四字の大技、炸裂！");
  assert.equal(line(d("win", 50, 10, [it("休日")], true)), "電光石火の快勝！");
  assert.equal(line(d("win", 40, 31, [it("休日")], false)), "手に汗握る大接戦！");
  assert.equal(line(d("win", 40, 30, [it("休日")], false)), "手に汗握る大接戦！", "点差10は大接戦");
  assert.equal(line(d("win", 41, 30, [it("休日")], false)), "堂々の一番勝ち！", "点差11は堂々");
  assert.equal(line(d("draw", 20, 20, [it("休日")])), "互角の名勝負、決着は次号へ！");
  assert.equal(line(d("lose", 30, 40, [it("休日")])), "惜敗！雪辱は次の一番で");
  assert.equal(line(d("lose", 29, 40, [it("休日")])), "涙の敗走、されど再起を誓う");
});

test("終わりの画面：特別な語が2つなら点の高いほう（同点は先）・字数は漢数字・負けでは特別な語を見ない", () => {
  assert.equal(line(d("win", 30, 0, [it("金玉", 12, true), it("日本一", 20, true)])), "日本一、ここに極まれり！");
  assert.equal(line(d("win", 30, 0, [it("日本", 3, true), it("金玉", 3, true)])), "日本、ここに極まれり！");
  assert.equal(line(d("win", 30, 0, [it("大問題大大", 20)])), "五字の大技、炸裂！");
  assert.equal(line(d("lose", 9, 40, [it("金玉", 12, true)])), "涙の敗走、されど再起を誓う");
});

test("ひとり：出さない（作者の言葉に無い。仮）", () => {
  assert.equal(line(d("solo", 33, null, [it("休日")])), "");
  assert.equal(share(d("solo", 33, null, [it("休日")])), "");
});

test("戦果の共有：特別な語・長い語が先／引き分け／接戦／勝ち／負け（6通り）", () => {
  assert.equal(share(d("lose", 5, 50, [it("金玉", 12, true), it("休日", 3)])), "號外！『金玉』現る", "負けても特別な語が先");
  assert.equal(share(d("win", 50, 10, [it("休日"), it("大問題大", 12)])), "號外！四字の大技『大問題大』");
  assert.equal(share(d("draw", 20, 20, [it("休日")])), "互角！決着は次号へ");
  assert.equal(share(d("lose", 40, 48, [it("休日")])), "四十対四十八、手に汗握る大接戦！", "負けでも接戦");
  assert.equal(share(d("win", 50, 30, [it("休日", 3), it("山川", 6), it("十円", 6)])), "快勝！決め手は『山川』", "一番点の高い語。同点は先");
  assert.equal(share(d("lose", 12, 50, [it("日", 1), it("休日", 3)])), "無念。されど『休日』を放つ");
});

test("戦果の共有：言葉を1つも放っていなければ出さない", () => {
  assert.equal(share(d("lose", 0, 50, [])), "");
  const r = K.shareResultText(d("lose", 0, 50, []), { tpl: STR.SHARE_RESULT, title: "題", issue: "第壱號", level: "N4", opponent: "normal", aori: STR.AORI_SHARE });
  assert.equal(r.text, "題 第壱號／CPU（ツヨイ）ニ敗ル 〇対五十／（N4）");
});

test("戦果の共有の文：見出しの行のすぐ下に煽り・最後が リンク→タグ（K.shareResultText）", () => {
  const o = { tpl: STR.SHARE_RESULT, title: STR.TEXT.masthead, issue: "第参號", level: "N4", opponent: "normal", aori: STR.AORI_SHARE, url: "https://x.example/", hashtag: STR.TEXT.hashtag };
  const r = K.shareResultText(d("win", 51, 20, [it("休日", 3), it("山川", 6)]), o);
  assert.equal(r.text, "漢対普請瓦版 第参號／快勝！決め手は『山川』／CPU（ツヨイ）ニ勝ツ 五十一対二十／決メ手ハ『山川』六点／（N4）\nhttps://x.example/\n#漢対普請瓦版");
  assert.equal(STR.TEXT.hashtag, "#漢対普請瓦版");
  // 型を渡さなければ今までどおり（煽りなし・リンクなし・タグなし）
  const old = K.shareResultText(d("win", 51, 20, [it("休日", 3)]), { ...o, aori: undefined, url: undefined, hashtag: undefined });
  assert.equal(old.text, "漢対普請瓦版 第参號／CPU（ツヨイ）ニ勝ツ 五十一対二十／決メ手ハ『休日』三点／（N4）");
});

test("合言葉の共有の文にはタグが付かない", () => {
  assert.ok(!STR.TEXT.shareText("2901", "題", "副題", "https://x/?room=2901").includes("#"));
});

test("型は1か所：型を替えれば文が変わる", () => {
  const tpl = { ...STR.AORI, win: "ばんざい", closeMax: 0 };
  assert.equal(K.aoriLine(d("win", 40, 31, [it("休日")]), tpl), "ばんざい");
});

test("endShow：特別な語の印・50点で終わったか（by50）・時間切れは false", () => {
  const { T, newGame, setHand } = require("./helpers");
  const g = newGame(1, "normal", "N5");
  setHand(g, g.me, "休日");
  assert.ok(g.release(g.me, g.me.cards.map((x) => x.id)).ok);
  g.me.score = 50; g.checkOver ? 0 : 0;
  g.clock.t += g.timeLimit; g.tick();
  const e = K.endShow(g, T, g.winner);
  assert.equal(e.by50, false, "時間切れで終わった");
  assert.equal(e.items[0].special, false);
  const g2 = newGame(2, "normal", "N5");
  setHand(g2, g2.me, "休日");
  g2.me.score = 49;
  assert.ok(g2.release(g2.me, g2.me.cards.map((x) => x.id)).ok);
  assert.equal(g2.over, true);
  assert.equal(K.endShow(g2, T, g2.winner).by50, true, "先に50点で終わった");
  assert.equal(K.aoriLine(K.endShow(g2, T, g2.winner), STR.AORI), "電光石火の快勝！");
});
