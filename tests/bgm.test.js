// 試合の曲と針の音（KJ-133・D-131・D-133）：時刻の計画（K.bgmPlan）・rules の bgm・加工した音の置き場・クレジット。
// 音そのもの（鳴っているか）は耳でしか確かめられないので、ここでは「いつ・どれを・どの速さで鳴らすか」を見る。画面の呼び出しは tests/bgm.browser.test.mjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { K, D } = require("./helpers");
const STR = require("../js/strings.js");

const ROOT = path.join(__dirname, "..");
const B = D.rules.bgm;

test("rules.bgm：数え下げは 参・弐・壱 を1秒ずつ。曲が鳴り出す所・最後の1分・止める長さ・音の置き場が1か所にある", () => {
  assert.deepEqual(B.count, ["参", "弐", "壱"]);
  assert.equal(B.step_sec, 1);
  assert.ok(B.onset_sec > 1.5 && B.onset_sec < 3, "元の録音は頭の針のノイズのあと約2.3秒で曲が鳴り出す");
  assert.equal(B.fast_last_sec, 60);
  assert.equal(B.fast_rate, 1.1);
  assert.equal(B.fade_out_sec, 1);
  for (const k of ["song", "needle", "noise"]) assert.ok(fs.existsSync(path.join(ROOT, B.files[k])), B.files[k] + " がある");
  assert.ok(/^2026-11-28/.test(D.rules.version), "rules の version を上げた");
  assert.ok(D.rules.note.includes("KJ-133"), "note に KJ-133");
});

test("K.bgmPlan：「参」で針の音・曲が鳴り出す所が「壱」が消える瞬間に重なる・最後の1分で速くする", () => {
  const p = K.bgmPlan(D.rules, 100, 600);
  assert.equal(p.count, 3);
  assert.equal(p.needleAt, 100, "針の音は「参」と同時");
  assert.equal(p.goAt, 103, "試合は3秒後");
  assert.ok(Math.abs(p.songAt + B.onset_sec - p.goAt) < 1e-9, "曲が鳴り出す所（頭から onset 秒）が試合の始まりに重なる（ずれ 0）");
  assert.ok(p.songAt >= p.needleAt, "曲は針の音のあとに始まる（頭のノイズ→曲）");
  assert.equal(p.fastAt, 103 + 600 - 60, "試合が終わる60秒前から速く");
  assert.equal(p.fastRate, 1.1);
  const q = K.bgmPlan(D.rules, 100, 300);
  assert.equal(q.fastAt, 103 + 300 - 60, "5分でも最後の1分");
});

test("合言葉の部屋：始まりの時刻（'start' 行の created_at）が同じなら、二人の数え下げは同じ時刻に終わる", () => {
  // 作る側と入る側で、端末の時計の目盛りも、行が届いた時刻もちがう
  const created = 1_800_000_000;
  const a = K.bgmPlan(D.rules, K.roomStartAt(created, created + 0.4, 5000, 3), 600);
  const b = K.bgmPlan(D.rules, K.roomStartAt(created, created + 1.1, 91000, 3), 600);
  const endA = created + 0.4 + (a.goAt - 5000), endB = created + 1.1 + (b.goAt - 91000); // 行が届いた時刻 ＋ あと何秒 ＝ サーバーの時刻での終わり
  assert.ok(Math.abs(endA - (created + 3)) < 1e-6 && Math.abs(endB - (created + 3)) < 1e-6, "どちらも created_at の3秒後に終わる");
});

test("加工した音：音量をそろえた軽い形で置いてある（曲は元より小さい・全部で2MB以内）・元のファイルは残っている", () => {
  const sz = (f) => fs.statSync(path.join(ROOT, f)).size;
  const total = ["song", "needle", "noise"].reduce((a, k) => a + sz(B.files[k]), 0);
  assert.ok(total < 2 * 1024 * 1024, `合計 ${total} バイト`);
  assert.ok(sz(B.files.song) < sz("audio/src/japanese_sandman_whiteman_1920.mp3") / 3, "モノラル・軽い形式");
  for (const f of ["japanese_sandman_whiteman_1920.mp3", "vinylstart.mp3", "SOURCES.md"]) assert.ok(fs.existsSync(path.join(ROOT, "audio/src", f)), "元のファイルは残す：" + f);
  // ノイズの輪は WAV（つなぎ目なしで輪にするため。mp3 は頭と尻に余白が付く）
  const w = fs.readFileSync(path.join(ROOT, B.files.noise));
  assert.equal(w.toString("ascii", 0, 4), "RIFF");
  const sr = w.readUInt32LE(24), bytes = w.readUInt32LE(40);
  assert.ok(Math.abs(bytes / 2 / sr - 6) < 0.01, "6秒の輪");
});

test("クレジット：遊び方の説明の末尾（ja・en）と CREDITS.md に、曲と針の音の作者・権利・置き場", () => {
  const arg = { R: D.rules, min: 10, levelLabel: "N4", chars: 1, words: 1, cycles: ["a"], radKeys: ["x"], radVals: ["y"] };
  const ja = STR.howto(arg), jaLast = ja[ja.length - 1];
  assert.ok(/The Japanese Sandman/.test(jaLast) && /Paul Whiteman/.test(jaLast) && /Public domain/.test(jaLast) && /Wikimedia Commons/.test(jaLast));
  assert.ok(/Vinyl/.test(jaLast) && /Aidan Walker/.test(jaLast) && /CC0/.test(jaLast) && /OpenGameArt/.test(jaLast));
  STR.setLang("en");
  const en = STR.howto(arg), enLast = en[en.length - 1];
  STR.setLang("ja");
  assert.ok(/The Japanese Sandman/.test(enLast) && /Aidan Walker/.test(enLast) && /CC0/.test(enLast));
  const c = fs.readFileSync(path.join(ROOT, "CREDITS.md"), "utf8");
  assert.ok(/The Japanese Sandman/.test(c) && /Paul Whiteman/.test(c) && /Public domain/.test(c) && /Wikimedia Commons/.test(c) && /Vinyl/.test(c) && /Aidan Walker/.test(c) && /CC0/.test(c) && /OpenGameArt/.test(c));
});

test("歯車の欄の「曲」の文（ja・en）", () => {
  assert.equal(STR.t("lblBgm"), "曲");
  STR.setLang("en");
  assert.equal(STR.t("lblBgm"), "Music");
  STR.setLang("ja");
});
