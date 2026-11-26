// 合言葉の共有（KJ-107）：リンクの ?room= の読み取りと、共有のリンクの組み立て・共有の文
const test = require("node:test");
const assert = require("node:assert/strict");
const { K } = require("./helpers");
const STR = require("../js/strings.js");

test("?room= の合言葉：数字4けたならそのまま・全角も受ける・合わなければ null（KJ-107）", () => {
  assert.equal(K.roomCodeFromSearch("?room=1234"), "1234");
  assert.equal(K.roomCodeFromSearch("?x=1&room=4821&y=2"), "4821");
  assert.equal(K.roomCodeFromSearch("?room=１２３４"), "1234");
  for (const bad of ["", "?", "?room=", "?room=123", "?room=12345", "?room=abcd", "?room=12 34", "?room=1234a", "?other=1234", null, undefined]) {
    assert.equal(K.roomCodeFromSearch(bad), null, String(bad));
  }
});

test("共有のリンク：ページの URL に ?room=合言葉。もとの ? や # は除く（KJ-107）", () => {
  assert.equal(K.roomShareUrl("https://kaz6.github.io/kanji-barabara-mock/", "1234"), "https://kaz6.github.io/kanji-barabara-mock/?room=1234");
  assert.equal(K.roomShareUrl("https://kaz6.github.io/kanji-barabara-mock/?room=9999#x", "1234"), "https://kaz6.github.io/kanji-barabara-mock/?room=1234");
  // 作ったリンクを読み戻せる
  assert.equal(K.roomCodeFromSearch(new URL(K.roomShareUrl("http://h/p/", "5678")).search), "5678");
});

test("共有の文：題（masthead）と合言葉が入る。題を直せば文も変わる（KJ-107）", () => {
  const t = STR.TEXT;
  assert.equal(t.shareButton, "共有");
  assert.equal(t.shareText("1234", t.masthead), `${t.masthead}で対戦しよう。合言葉 1234`);
  assert.ok(t.shareText("1234", t.masthead).includes("漢対普請瓦版"));
});
