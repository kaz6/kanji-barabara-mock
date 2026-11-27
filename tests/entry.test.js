// KJ-123：はじめる前の画面の組み直し（決まりの部分）。遊び方の呼び名・時間の2択・15分の読み替え・合言葉で入った試合のログの頭の「入り方」
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T } = require("./helpers");

test("遊び方の呼び名は「CPU戦」「友達と対戦」", () => {
  assert.deepEqual(K.PLAY_MODES.map((o) => o.label), ["CPU戦", "友達と対戦"]);
});

test("制限時間は 5分・10分 だけ。覚えてあった 900（15分）は 10分 として扱う", () => {
  assert.deepEqual(K.timeChoices(D), [300, 600]);
  assert.equal(K.normTime(D, "900"), 600);
  assert.equal(K.normTime(D, 900), 600);
  assert.equal(K.normTime(D, "300"), 300);
  assert.equal(K.normTime(D, null), 600);
  const g = K.createGame(D, T, { opponent: "weak", timeLimit: 900 });
  assert.equal(g.timeLimit, 600);
  assert.match(D.rules.note, /KJ-123/);
});

function room(role, entry) {
  const clock = { t: 5000 };
  return K.createGame(D, T, { now: () => clock.t, date: () => new Date(2026, 10, 27, 9, 0, 0), match: { id: "m-entry-" + role, role, startAt: clock.t, entry } });
}

test("合言葉で入った側のログの頭に「入り方」が1行：リンク／手入力。作る側・CPU戦には書かない", () => {
  const link = room("guest", "link").logText().split("\n");
  assert.equal(link[0], "# 入り方：リンク", "ログの頭の行");
  assert.match(link[1], /^# 漢対普請瓦版 ログ/);
  assert.equal(room("guest", "typed").logText().split("\n")[0], "# 入り方：手入力");
  assert.match(room("host", "link").logText().split("\n")[0], /^# 漢対普請瓦版 ログ/, "作る側には書かない");
  assert.match(room("host", undefined).logText().split("\n")[0], /^# 漢対普請瓦版 ログ/);
  assert.match(room("guest", undefined).logText().split("\n")[0], /^# 漢対普請瓦版 ログ/, "知らない入り方は書かない");
  assert.match(room("guest", "x").logText().split("\n")[0], /^# 漢対普請瓦版 ログ/);
  const cpu = K.createGame(D, T, { opponent: "weak" });
  assert.doesNotMatch(cpu.logText(), /入り方/);
});

test("play_logs の行の形は変わらない（列は増やさない）。入り方は log の文の中", () => {
  const g = room("guest", "link");
  g.me.score = 3; g.log.push({ t: 1, who: "あなた", op: "放つ", from: [], to: [], pts: 3, meScore: 3, cpuScore: 0, me: "", cpu: "", note: "" });
  const row = K.playLogRow(g, "dev");
  assert.deepEqual(Object.keys(row).sort(), ["app_version", "device_id", "level", "log", "opponent", "result"]);
  assert.ok(row.log.startsWith("# 入り方：リンク\n"));
});
