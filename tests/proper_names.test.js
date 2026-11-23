// 地名・名字（KJ-032・D-047）と、全レベルで外す語（D-048）
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { K, D, T, T4, TG1, setHand, ROOT } = require("./helpers");

const PN = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "proper_names.json"), "utf8"));
const BLOCKED = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "blocked_words.json"), "utf8"));
const W = new Map(D.words.words.map((w) => [w.w, w]));
const TT = { G1: TG1, N5: T, N4: T4 };
const opts = { now: () => 1000, rand: () => 0.5, date: () => new Date(2026, 10, 23), opponent: "solo" };
const holdAt = (text) => Object.keys(TT).filter((lv) => [...text].every((c) => TT[lv].HOLD.has(c)));
// 一覧の表記と、付いた形（〇〇県・〇〇市）
function forms(r) {
  const out = [r.w];
  if (r.suffix) out.push(r.w + r.suffix);
  if (r.city_suffix) out.push(r.w + r.city_suffix);
  return out;
}

test("地名・名字の一覧：都道府県47・県庁所在地と政令指定都市・名字の上位100。種類は 地名／名字 だけ。読みと出典がある", () => {
  assert.ok(PN.version);
  const g = (name) => PN.names.filter((r) => r.groups.includes(name));
  assert.equal(g("都道府県").length, 47);
  assert.equal(g("名字").length, 100);
  assert.deepEqual(g("名字").map((r) => r.rank).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1), "名字は出典の順位どおり");
  assert.ok(g("県庁所在地").length >= 45 && g("政令指定都市").length >= 19);
  const cities = new Set([...g("県庁所在地"), ...g("政令指定都市")].map((r) => r.w));
  assert.ok(cities.size >= 45 && cities.size <= 55, `市はあわせて約50（${cities.size}）`);
  assert.equal(new Set(PN.names.map((r) => r.w)).size, PN.names.length, "重なりは1つに");
  for (const r of PN.names) {
    assert.ok(/^[ぁ-ゖー]+$/.test(r.kana), `${r.w} の読み`);
    assert.ok(r.kinds.length && r.kinds.every((k) => k === "地名" || k === "名字"), `${r.w}：下の名前は入れない`);
  }
  assert.match(PN.sources["名字"], /office-morioka\.com/);
  assert.ok(PN.names.some((r) => r.q), "読みが2つ以上ある名字に ？");
});

test("地名・名字：手に持てる字だけで書けるときだけ語に入り、印（pn）が付く。書けないものは入らない（D-029）", () => {
  let seen = 0;
  for (const r of PN.names) {
    for (const f of forms(r)) {
      const w = W.get(f);
      const can = f.length >= 2 && f.length <= 4 && holdAt(f).length > 0;
      if (f.length === 1) continue; // 1字（林・森・原・津・堺）は放てないので、地名・名字としては入れない
      if (f === r.w) assert.equal(!!w, can, `${f}：手に持てる字だけで書ける＝語にある`);
      else if (w) assert.ok(can, `${f}：付いた形は手に持てるときだけ`);
      if (w) {
        assert.ok(Array.isArray(w.pn) && w.pn.length, `${f} に印`);
        seen++;
      }
    }
  }
  assert.equal(seen, D.words.stats.pn, "印の付いた語の数");
  assert.ok(!W.get("林").pn, "1字の名字には印を付けない");
  // 印は一覧から来たものだけ
  const allForms = new Set(PN.names.flatMap(forms));
  for (const w of D.words.words) if (w.pn) assert.ok(allForms.has(w.w), `${w.w} は一覧の外`);
});

test("地名・名字：田中 は小1・N5・N4 で放てて、点数は普通の2字の言葉と同じ。台の印は〔名字〕", () => {
  const w = W.get("田中");
  assert.deepEqual(w.pn, ["名字"]);
  assert.equal(w.kana, "たなか");
  for (const lv of ["G1", "N5", "N4"]) {
    assert.ok(TT[lv].WORDS.has("田中"), lv);
    const g = K.createGame(D, TT[lv], opts);
    setHand(g, g.me, "田中");
    const r = g.canRelease(g.me, g.me.cards.map((c) => c.id));
    assert.equal(r.ok, true, `${lv} で 田中 を放てる`);
    assert.equal(r.pts, K.scoreOf(D, TT[lv], "山川").pts, "普通の2字の言葉（山川）と同じ点");
  }
  assert.deepEqual(W.get("石川").pn, ["地名", "名字"], "地名でも名字でもあるものは両方");
  assert.ok(T4.WORDS.has("東京") && W.get("東京").pn.includes("地名"), "辞書にもとからある語にも印");
  assert.ok(T4.WORDS.has("東京都") && T4.WORDS.has("石川県"), "〇〇県・〇〇都の形も通る");
});

test("地名・名字：大阪・福岡・佐藤 は一覧にあるが、いまのどのレベルでも 阪・福・佐・藤 を手に持てないので語に無い（持てるようになれば通る）", () => {
  for (const [t, c] of [["大阪", "阪"], ["福岡", "福"], ["佐藤", "佐"], ["佐藤", "藤"]]) {
    assert.ok(PN.names.some((r) => r.w === t), `${t} は一覧にある`);
    assert.deepEqual(holdAt(c), [], `${c} はどのレベルでも手に持てない`);
    assert.ok(!W.has(t), `${t} はいまは語に無い`);
  }
});

test("地名・名字：下の名前は通らない（花子・太郎・一郎）", () => {
  for (const t of ["花子", "太郎", "一郎"]) {
    for (const lv of ["G1", "N5", "N4"]) assert.ok(!TT[lv].WORDS.has(t), `${t}（${lv}）`);
  }
});

test("地名・名字：CPU が知っている語（common）は増やさない。新しく足した語に common は付けない", () => {
  assert.ok(D.words.stats.pn_added > 0, "辞書（JMdict）に無かった地名・名字を足した");
  const added = D.words.words.filter((w) => w.pn && !w.common);
  assert.ok(added.length >= D.words.stats.pn_added, "足した語はどれも common なし");
  assert.ok(!W.get("東京都").common && !W.get("石川県").common);
  assert.ok(!T4.COMMON_WORDS.some((w) => w.w === "東京都"), "足した 東京都 は CPU が使わない");
});

test("全レベルで外す語：買春・売春 は語に無く、どのレベルでも放てない", () => {
  assert.ok(BLOCKED.version);
  assert.deepEqual(BLOCKED.words, ["買春", "売春"]);
  for (const t of BLOCKED.words) {
    assert.ok(!W.has(t), `${t} は words に無い`);
    for (const lv of ["G1", "N5", "N4"]) {
      assert.ok(!TT[lv].WORDS.has(t), `${t}（${lv}）`);
      assert.ok(!TT[lv].COMMON_WORDS.some((w) => w.w === t), `CPU も使わない ${t}（${lv}）`);
      const g = K.createGame(D, TT[lv], opts);
      setHand(g, g.me, t);
      assert.equal(g.canRelease(g.me, g.me.cards.map((c) => c.id)).ok, false, `${t} を ${lv} で放てない`);
    }
  }
});
