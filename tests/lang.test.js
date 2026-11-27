// KJ-127：言語の切り替え（段1）。文の表（ja・en）・初めの言語・en に落ちない・core.js の画面向けの文の言い換え・共有の文。
// 画面は tests/lang.browser.test.mjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../js/strings.js");
const K = require("../js/core.js");

const kana = /[぀-ヿㇰ-ㇿ]/;
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "rules.json"), "utf8"));
const radical = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "radical_forms.json"), "utf8"));
const howtoArg = { R: rules, min: 5, levelLabel: "N5", chars: 100, words: 900, cycles: ["春夏秋冬"], radKeys: Object.keys(radical.left), radVals: Object.values(radical.left) };

test.afterEach(() => S.setLang("ja"));

test("KJ-127 言語は日本語と English の2つ（韓国語は作らない）", () => {
  assert.deepEqual(S.LANGS.map((l) => l.key), ["ja", "en"]);
  assert.deepEqual(S.LANGS.map((l) => l.short), ["JP", "EN"]);
  assert.equal(S.normLang("ko"), "ja");
  assert.equal(S.setLang("en"), "en");
  assert.equal(S.getLang(), "en");
  assert.equal(S.setLang("zz"), "ja");
});

test("KJ-127 初めの言語：覚えていればそれ・無ければ navigator.language（ja→日本語、ほか→English）", () => {
  assert.equal(S.detectLang("en", "ja-JP"), "en");
  assert.equal(S.detectLang("ja", "en-US"), "ja");
  assert.equal(S.detectLang(null, "ja"), "ja");
  assert.equal(S.detectLang(null, "ja-JP"), "ja");
  assert.equal(S.detectLang(null, "en-US"), "en");
  assert.equal(S.detectLang(null, "fr"), "en");
  assert.equal(S.detectLang("xx", "ko-KR"), "en"); // 読めない値は無いものと同じ
  assert.equal(S.detectLang(null, ""), "ja");
});

test("KJ-127 文の表：ja は今までの文のまま・en は別の文・en に無い文は ja に落ちる", () => {
  assert.equal(S.t("setHead"), "はじめる前に選ぶ");
  assert.equal(S.t("counts", 1, 2, "N5"), "字 1・語 2（レベル N5）");
  assert.equal(S.t("shareText", "2901", "漢対普請瓦版", "Split & Join — a Kanji Duel", "https://x/?room=2901"), S.TEXT.shareText("2901", "漢対普請瓦版", "Split & Join — a Kanji Duel", "https://x/?room=2901"));
  S.setLang("en");
  assert.equal(S.t("setHead"), "Choose before you start");
  assert.equal(S.t("counts", 1, 2, "N5"), "1 kanji, 2 words; level N5");
  assert.equal(S.t("nothing-here"), "nothing-here"); // 無い鍵はそのまま
  for (const k of Object.keys(S.CORE_EN)) assert.ok(typeof S.CORE_EN[k] === "string" && S.CORE_EN[k]);
});

test("KJ-127 en の文に、かな・漢字（題字を除く）が残らない（文の表）", () => {
  S.setLang("en");
  const keys = ["setHead", "lblPlay", "lblPower", "lblRoom", "lblLevel", "lblTime", "lblVib", "lblFace", "faceTaisho", "faceMincho", "on", "off", "actHost", "actEnter", "codePh", "codeAria", "enterBtn", "enterNote", "cancel", "start", "langBtn", "settings", "dataFail", "roomMaking", "roomFinding", "roomVersion", "roomCancelled", "howtoSum", "again", "setupBtn", "logBtn", "copyBtn", "copyLog", "copied", "copyFail", "shareButton", "shareCopied", "shareFailed", "shareEndFailed", "esPts", "esVs", "esMissed", "esReading", "esMeaning", "esKotoban"];
  for (const k of keys) assert.ok(!/[぀-ヿ㐀-鿿]/.test(S.t(k)), `${k}: ${S.t(k)}`);
  for (const [k, args] of [["counts", [1, 2, "N5"]], ["roomHosted", ["N5", "5 min"]], ["roomTheirs", ["N5", "5 min"]], ["roomHostSet", ["N5", "5 min"]], ["msgWin", [3, 2]], ["msgLose", [3, 2]], ["msgDraw", [3, 3]], ["msgSolo", [3]], ["esPlus", [6]]]) {
    assert.ok(!/[぀-ヿ㐀-鿿]/.test(S.t(k, ...args)), `${k}: ${S.t(k, ...args)}`);
  }
  assert.equal(S.t("roomJoining", "x"), "x. Joining...");
  assert.equal(S.timeLabel(300), "5 min");
  S.setLang("ja");
  assert.equal(S.timeLabel(300), "5分");
  assert.equal(S.timeLabel(600), K.timeLabel(600));
});

test("KJ-127 core.js が日本語で返す画面向けの文を、en のときだけ言い換える（表に無い文はそのまま）", () => {
  const ja = [...K.PLAY_MODES, ...K.CPU_POWERS].map((o) => o.label).concat(K.LEVELS.flatMap((l) => [l.label, l.short]), ["勝ち！", "負け…", "引き分け", "おわり"]);
  for (const s of ja) assert.equal(S.tr(s), s, "ja では言い換えない");
  S.setLang("en");
  for (const s of ja) { const e = S.tr(s); assert.ok(!kana.test(e), `${s} → ${e}`); }
  assert.equal(S.tr("CPU戦"), "vs CPU");
  assert.equal(S.tr("友達と対戦"), "vs a friend");
  assert.equal(S.tr("N5"), "N5");
  assert.equal(S.tr(K.levelShort("G1")), "Grade 1");
  assert.equal(S.tr("知らない文"), "知らない文");
  // はじかれた理由（K.rejectText の結果）：docs/REJECT_MESSAGES.md の表
  for (const why of ["1字では放てない（2字以上の言葉）", "かなだけでは放てない（漢字の札が1枚以上いる）", "放った言葉", "並べる順が逆", "辞書にない", "手札もストックもいっぱい", "手札がいっぱい", "ストックがいっぱい", "くっつかない", "割れない", "できない字", "待ち時間", "同じ読みの字がない", "取れる枚数がない", "相手が先に放った", "相手が先に取った", "引き直しは5回まで", "場から取りきるまで動けない", "場にない"]) {
    const out = S.tr(K.rejectText(why));
    assert.ok(!/[぀-ヿ㐀-鿿]/.test(out), `${why} → ${out}`);
  }
  assert.equal(S.tr(K.rejectText("1字では放てない（2字以上の言葉）")), "2+ characters!");
  assert.equal(S.tr("〇円は一度きり！"), "Only one 円 per match!");
  for (const why of ["合言葉は数字4けた", "つながらない", "その合言葉の部屋がない", "合言葉を作れなかった（もう一度）", "その部屋はもう始まっている"]) assert.ok(!kana.test(S.tr(why)), why);
});

test("KJ-127 遊び方の説明（しくみ）：ja は17行のまま・en は同じ行数で、かな・読点が残らない", () => {
  const ja = S.howto(howtoArg);
  assert.equal(ja.length, 17);
  assert.ok(ja[0].startsWith("<b>選ぶ</b>：手札・ストックの札をタップすると"));
  assert.ok(ja.some((x) => x.includes(`先に ${rules.win.score} 点`)));
  S.setLang("en");
  const en = S.howto(howtoArg);
  assert.equal(en.length, ja.length);
  const text = en.join("\n").replace(/<[^>]*>/g, "");
  assert.ok(!kana.test(text), "かなが残っている：" + (text.match(kana) || []).join(""));
  assert.ok(!/[。、（）]/.test(text), "日本語の句読点が残っている");
  assert.ok(text.includes(`${rules.win.score} points`));
  for (const x of en) assert.ok(!/undefined|NaN|\$\{/.test(x), x);
});

test("KJ-127 戦果の共有の文：en は算用数字・英語の型・最後の行のタグは2つ／ja は今のまま1つ。合言葉の共有にタグは付かない", () => {
  const d = { kind: "win", me: 48, cpu: 30, items: [{ text: "十円", pts: 9, special: false }], by50: false };
  const base = { title: S.TEXT.masthead, issue: "第壱號", level: "N5", opponent: "weak", aori: S.AORI_SHARE, url: "https://example.test/", };
  const ja = K.shareResultText(d, { ...base, tpl: S.shareResult(), hashtag: S.hashtag() });
  assert.match(ja.text, /ニ勝ツ 四十八対三十／決メ手ハ『十円』九点／（N5）\nhttps:\/\/example.test\/\n#漢対普請瓦版$/);
  S.setLang("en");
  const en = K.shareResultText(d, { ...base, tpl: S.shareResult(), hashtag: S.hashtag() });
  assert.match(en.text, /^漢対普請瓦版 第壱號 \/ /);
  assert.match(en.text, /Beat CPU \(very weak\) 48-30/);
  assert.match(en.text, /Winning word: '十円' 9 pts \/ \(N5\)\nhttps:\/\/example.test\/\n#漢対普請瓦版 #KanjiDuel$/);
  assert.match(en.text, /^[^\/]+ \/ 快勝！決め手は『十円』 \/ Beat /, "煽り文句の行（P-126）は日本語のまま〔段1の範囲外〕");
  const lose = K.shareResultText({ kind: "lose", me: -5, cpu: 12, items: [], by50: false }, { ...base, tpl: S.shareResult(), hashtag: S.hashtag() });
  assert.match(lose.text, /Lost to CPU \(very weak\) -5-12/);
  const room = S.t("shareText", "2901", S.TEXT.masthead, S.TEXT.mastheadSub, "https://x/?room=2901");
  assert.ok(!room.includes("#"), "合言葉の共有にタグは付かない");
  assert.match(room, /^漢対普請瓦版 Split & Join — a Kanji Duel\nCombine kanji and make words — a word duel! Room code 2901 https:\/\/x\/\?room=2901$/);
  S.setLang("ja");
  assert.ok(S.t("shareText", "2901", "a", "b", "u").includes("漢字を組み合わせて、言葉づくり対戦しよう。合言葉 2901 u"));
});
