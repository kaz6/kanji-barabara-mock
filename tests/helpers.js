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
const T = K.makeTables(D);

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
function newGame(seed = 1) {
  const clock = { t: 1000 };
  const g = K.createGame(D, T, { now: () => clock.t, rand: seeded(seed), date: () => new Date(2026, 10, 20, 18, 0, 0) });
  g.clock = clock;
  return g;
}
// プレイヤーのカゴを決まった札にする（id は振り直す）
function setHand(g, p, chars) {
  let id = 100000 + Math.floor(Math.random() * 1e6);
  p.cards = [...chars].map((c) => ({ id: ++id, c, t: g.now(), fresh: false }));
  return p.cards.map((x) => x.id);
}
module.exports = { K, D, T, newGame, setHand, ROOT };
