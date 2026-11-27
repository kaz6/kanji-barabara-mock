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

test("共有の文：作者の文（KJ-122）。題・副題・合言葉・リンクが1本に入り、リンクは1つだけ", () => {
  const t = STR.TEXT, url = K.roomShareUrl("https://kaz6.github.io/kanji-barabara-mock/", "2901");
  assert.equal(t.shareButton, "共有");
  const s = t.shareText("2901", t.masthead, t.mastheadSub, url);
  assert.equal(s, "漢対普請瓦版 Split & Join — a Kanji Duel\n漢字を組み合わせて、言葉づくり対戦しよう。合言葉 2901 https://kaz6.github.io/kanji-barabara-mock/?room=2901");
  assert.equal(s.split("https://").length - 1, 1);
  assert.equal(s.split("2901").length - 1, 2, "合言葉とリンクの ?room= の2か所だけ");
  assert.ok(!s.includes("#"));
  // 題・副題を直せば文も変わる
  assert.ok(t.shareText("1234", "題X", "副Y", "u").startsWith("題X 副Y\n"));
});
