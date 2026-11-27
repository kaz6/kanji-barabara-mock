// 戦果の共有の文（KJ-108）：K.shareResultText・K.siteUrl。文の型は js/strings.js の SHARE_RESULT（仮）
const test = require("node:test");
const assert = require("node:assert/strict");
const { K } = require("./helpers");
const STR = require("../js/strings.js");

const o = (opponent = "normal", extra = {}) => ({ tpl: STR.SHARE_RESULT, title: STR.TEXT.masthead, issue: K.issueLabel(2), level: "N4", opponent, ...extra });
const d = (kind, me, cpu, items = []) => ({ kind, label: "", me, cpu, items, missed: null });
const it = (text, pts) => ({ text, pts });

test("勝ち：題・号数／CPU（強さ）に勝ツ 点（漢数字）／決め手（いちばん点の高い言葉）／レベル（KJ-108）", () => {
  const r = K.shareResultText(d("win", 51, 45, [it("休日", 3), it("大問題", 9), it("山", 1)]), o("normal"));
  assert.equal(r.text, "漢対普請瓦版 第参號／CPU（ツヨイ）ニ勝ツ 五十一対四十五／決メ手ハ『大問題』九点／（N4）");
  assert.equal(r.title, "漢対普請瓦版");
});

test("負け：敗ル。CPU の強さの呼び名（KJ-108）", () => {
  assert.equal(K.shareResultText(d("lose", 12, 50, [it("日", 1)]), o("weak")).text, "漢対普請瓦版 第参號／CPU（トテモヨワイ）ニ敗ル 十二対五十／決メ手ハ『日』一点／（N4）");
  assert.ok(K.shareResultText(d("lose", 12, 50), o("fair")).text.includes("CPU（フツウ）"));
});

test("引き分け・友だち（合言葉）・0点は 〇（KJ-108）", () => {
  assert.equal(K.shareResultText(d("draw", 20, 20, [it("休日", 3)]), o("room", { level: "N5" })).text, "漢対普請瓦版 第参號／友ダチト引キ分ケ 二十対二十／決メ手ハ『休日』三点／（N5）");
  const z = K.shareResultText(d("lose", 0, 7), o("weak")).text;
  assert.ok(z.includes("〇対七"), z);
});

test("ひとり：点だけ。CPU の点は出さない（KJ-108）", () => {
  const r = K.shareResultText(d("solo", 33, null, [it("休日", 3), it("十円", 3)]), o("solo", { level: "小1" }));
  assert.equal(r.text, "漢対普請瓦版 第参號／一人デ三十三点／決メ手ハ『休日』三点／（小1）"); // 同点は先のもの
});

test("言葉を放たずに終わった：決め手の行は出ない。レベルは出る（KJ-108）", () => {
  const r = K.shareResultText(d("lose", 0, 50, []), o("normal"));
  assert.equal(r.text, "漢対普請瓦版 第参號／CPU（ツヨイ）ニ敗ル 〇対五十／（N4）");
});

test("型は SHARE_RESULT の1か所：型を替えれば文が変わる・題は masthead（KJ-108）", () => {
  const tpl = { ...STR.SHARE_RESULT, win: "{who}ヲ倒ス {me}ー{opp}", sep: " | " };
  const r = K.shareResultText(d("win", 5, 3), { ...o("normal"), tpl });
  assert.equal(r.text, "漢対普請瓦版 第参號 | CPU（ツヨイ）ヲ倒ス 五ー三 | （N4）");
  assert.ok(STR.SHARE_RESULT.title.includes("{title}"));
});

test("endShow の結果からそのまま組める：ひとりで放った言葉・点・レベル（KJ-108）", () => {
  const { T, newGame, setHand } = require("./helpers");
  const g = newGame(1, "solo", "N5");
  setHand(g, g.me, "休日");
  assert.ok(g.release(g.me, g.me.cards.map((x) => x.id)).ok);
  g.clock.t += g.timeLimit; g.tick();
  const e = K.endShow(g, T, g.winner), pts = e.items[0].pts;
  const r = K.shareResultText(e, o("solo", { level: K.levelShort(g.level) }));
  assert.ok(r.text.includes(`一人デ${K.kansuji(g.me.score)}点`), r.text);
  assert.ok(r.text.includes(`決メ手ハ『休日』${K.kansuji(pts)}点`), r.text);
  assert.ok(r.text.endsWith("（N5）"), r.text);
});

test("共有のリンク：ページの URL から ? と # を除く（?room= は付けない）（KJ-108）", () => {
  assert.equal(K.siteUrl("https://kaz6.github.io/kanji-barabara-mock/?room=1234#x"), "https://kaz6.github.io/kanji-barabara-mock/");
  assert.equal(K.siteUrl("https://kaz6.github.io/kanji-barabara-mock/"), "https://kaz6.github.io/kanji-barabara-mock/");
  assert.equal(K.siteUrl(undefined), "");
});

test("点がマイナス（引き直しの払いすぎ）：一 と出さず「負」を付ける（KJ-108）", () => {
  assert.equal(K.shareResultText(d("lose", -5, 50), o("normal")).text, "漢対普請瓦版 第参號／CPU（ツヨイ）ニ敗ル 負五対五十／（N4）");
  assert.ok(K.shareResultText(d("solo", -10, null), o("solo")).text.includes("一人デ負十点"));
});
