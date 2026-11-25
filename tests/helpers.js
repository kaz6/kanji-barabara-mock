// テスト用：data/ を読み、時計と乱数を差し替えたゲームを作る
const fs = require("fs");
const path = require("path");
const K = require("../js/core.js");

const ROOT = path.join(__dirname, "..");
function loadData() {
  const D = {};
  for (const f of K.FILES) D[f] = JSON.parse(fs.readFileSync(path.join(ROOT, "data", f + ".json"), "utf8"));
  return D;
}
const D = loadData();
const T = K.makeTables(D, "N5"); // 既存のテストは N5（KJ-006 より前の前提）
const T4 = K.makeTables(D, "N4");
const TG1 = K.makeTables(D, "G1"); // 小1（KJ-044）

// 決まった乱数（mulberry32）
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// opponent は "solo"（ひとりで）／"weak"（とても弱い）／"normal"（いまの強さ。既存のテストの前提）
// level は "N5"（既存のテストの前提）／"N4"（KJ-006）／"G1"（小1。KJ-044）
// opts.startStock を true にすると、ストックに部品1枚つき（KJ-013。画面と同じはじまり。既存のテストは外した形が前提）。はじめの1枚は KJ-016 でやめた
function newGame(seed = 1, opponent = "normal", level = "N5", opts = {}) {
  const clock = { t: 1000 };
  const g = K.createGame(D, level === "N4" ? T4 : level === "G1" ? TG1 : T, { now: () => clock.t, rand: seeded(seed), date: () => new Date(2026, 10, 20, 18, 0, 0), opponent,
    startStock: !!opts.startStock });
  g.clock = clock;
  return g;
}
// プレイヤーのカゴを決まった札にする（id は振り直す）
function setHand(g, p, chars) {
  let id = 100000 + Math.floor(Math.random() * 1e6);
  p.cards = [...chars].map((c) => ({ id: ++id, c, t: g.now(), fresh: false }));
  return p.cards.map((x) => x.id);
}
// 取れる枚数を、場の左の札から取りきる（KJ-039：放ったら取りきるまで、ほかの手はできない）
function takeAll(g, p) {
  let n = 0;
  while (p.takes > 0) {
    const r = g.take(p, g.field[0].id);
    if (!r.ok) throw new Error("取りきれない：" + r.why);
    n++;
  }
  return n;
}
// 時限ヒント（KJ-086）：何も放たずに hint.timed_sec 秒たたせて tick する（ヒントが出る）。数字は rules.json から読む
function hintNow(g) {
  g.clock.t += D.rules.hint.timed_sec;
  g.tick();
}
// rules.json の hint を一時的に差し替える（KJ-086。続けてはじかれた形・時限なしの形を確かめる用。終わったら元に戻す）
function withHint(over, fn) {
  const old = { ...D.rules.hint };
  Object.assign(D.rules.hint, over);
  try { return fn(); } finally { for (const k of Object.keys(D.rules.hint)) delete D.rules.hint[k]; Object.assign(D.rules.hint, old); }
}
module.exports = { K, D, T, T4, TG1, newGame, setHand, takeAll, hintNow, withHint, ROOT };
