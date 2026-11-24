// KJ-053（D-069）：部品の ノ・儿・ナ を、言葉の中でかな（の・る・な）として使う
const test = require("node:test");
const assert = require("node:assert/strict");
const { K, D, T, T4, TG1, newGame, setHand, takeAll } = require("./helpers");

const KANA = ["の", "る", "な"];
const isKana = (c) => c >= "぀" && c <= "ヿ";
const tryN = (g, n, p = g.me) => { for (let i = 0; i < n; i++) g.tried(p, [p.cards[0].c, p.cards[1].c], "辞書にない"); };

test("かなに読む部品：data/parts.json の kana_parts は ノ→の・儿→る・ナ→な。どのレベルでも部品が割り方の行に出てくる", () => {
  assert.deepEqual(D.parts.kana_parts, { "ノ": "の", "儿": "る", "ナ": "な" });
  for (const L of [T, T4, TG1]) {
    assert.deepEqual([...L.KANA_OK].sort(), [...KANA].sort(), L.level);
    assert.equal(K.kanaText(L, "天ノ川"), "天の川");
    assert.equal(K.kanaText(L, ["見", "儿"]), "見る");
    assert.equal(K.kanaText(L, "主ナ"), "主な");
    assert.equal(K.kanaText(L, "休日"), "休日", "ほかの字はそのまま");
    // かなは手に持てる字（字の札）ではない。札は部品のまま
    for (const c of KANA) assert.ok(!L.HOLD.has(c), `${L.level}：${c}`);
    for (const c of ["ノ", "儿", "ナ"]) assert.ok(!K.isChar(L, c), `${L.level}：${c} は部品の見た目`);
  }
});

test("かなの語（words.json）：かなはちょうど1つ・先頭でない・2〜4字。kana_at はかなの位置。ほかの語に kana_at は無い", () => {
  const kw = D.words.words.filter((w) => [...w.w].some(isKana));
  assert.ok(kw.length > 300, `かなの語 ${kw.length}`);
  for (const w of D.words.words) {
    const cs = [...w.w];
    const ks = cs.filter(isKana);
    if (!ks.length) { assert.equal(w.kana_at, undefined, w.w); continue; }
    assert.equal(ks.length, 1, `${w.w}：かなは1つ`);
    assert.ok(KANA.includes(ks[0]), `${w.w}：の・る・な のどれか`);
    assert.ok(!isKana(cs[0]), `${w.w}：かなで始まらない`);
    assert.ok(cs.length >= 2 && cs.length <= 4, w.w);
    assert.equal(w.kana_at, cs.indexOf(ks[0]), `${w.w} の kana_at`);
  }
  for (const [w, lv, g1] of [["天の川", "N5", true], ["見る", "N5", true], ["日の出", "N5", true], ["目の前", "N5", true], ["出る", "N5", true], ["主な", "N4", false], ["大切な人", "N4", false]]) {
    const row = D.words.words.find((x) => x.w === w);
    assert.ok(row, w);
    assert.equal(row.lv, lv, w);
    assert.equal(!!row.g1, g1, `${w} の g1`);
  }
  // 数（tools/build_data.py の stats）と表が合う
  for (const lv of ["N5", "N4", "G1"]) {
    const ws = D.words.words.filter((w) => (lv === "G1" ? w.g1 : w.lv && (lv === "N4" || w.lv === "N5")));
    for (const k of KANA) assert.equal(ws.filter((w) => w.w.includes(k)).length, D.words.stats.by_level[lv].kana[k], `${lv} の ${k}`);
  }
});

test("天・ノ・川 で 天の川 が3字6点。見・儿 で 見る が2字3点（かなは1字に数える）", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "天ノ川");
  const pre = g.canRelease(g.me, g.me.cards.map((x) => x.id));
  assert.ok(pre.ok, pre.why);
  assert.equal(pre.text, "天の川", "言葉の書き方はひらがな");
  assert.equal(K.scoreOf(D, T, "天ノ川").how, "3字6");
  const r = g.release(g.me, g.me.cards.map((x) => x.id));
  assert.ok(r.ok);
  assert.deepEqual([r.text, r.pts, g.me.score, g.me.takes], ["天の川", 6, 6, 3 * D.rules.take_per_char]);
  takeAll(g, g.me);
  setHand(g, g.me, "見儿");
  const r2 = g.release(g.me, g.me.cards.map((x) => x.id));
  assert.ok(r2.ok, r2.why);
  assert.deepEqual([r2.text, r2.pts, g.me.score], ["見る", 3, 9]);
  // 並べる順はそのまま（儿・見 は る見 で、辞書にない）
  takeAll(g, g.me);
  setHand(g, g.me, "儿見");
  assert.equal(g.canRelease(g.me, g.me.cards.map((x) => x.id)).why, "辞書にない");
});

test("部品だけ（かなだけ）の並びは放てない。1枚だけも放てない", () => {
  const g = newGame(1, "weak", "N4");
  for (const hand of ["ノナ", "ナノ", "儿ノ", "ノ儿ナ"]) {
    setHand(g, g.me, hand);
    const r = g.canRelease(g.me, g.me.cards.map((x) => x.id));
    assert.equal(r.ok, false, hand);
    assert.equal(r.why, K.KANA_ONLY_WHY, hand);
  }
  setHand(g, g.me, "ノ");
  assert.equal(g.canRelease(g.me, g.me.cards.map((x) => x.id)).ok, false);
  assert.equal(g.release(g.me, g.me.cards.map((x) => x.id)).ok, false);
});

test("一度放ったかなの語は二人とも使えない。ログ・放った言葉・終わりの表示はひらがな", () => {
  const g = newGame(1, "normal", "N5");
  setHand(g, g.me, "天ノ川");
  assert.ok(g.release(g.me, g.me.cards.map((x) => x.id)).ok);
  assert.ok(g.used.has("天の川"));
  setHand(g, g.cpu, "天ノ川");
  const again = g.canRelease(g.cpu, g.cpu.cards.map((x) => x.id));
  assert.equal(again.ok, false);
  assert.equal(again.why, "放った言葉");
  const e = g.log.find((x) => x.op === "放つ");
  assert.equal(e.from.join(""), "天の川", "ログの 放つ はひらがな");
  const es = K.endShow(g, T, g.me);
  assert.deepEqual(es.items.map((x) => [x.text, x.kana, x.pts]), [["天の川", "あまのがわ", 6]]);
});

test("CPU もかなの語を放つ（ノ・儿・ナ の札をかなとして使う）", () => {
  const g = newGame(1, "normal", "N5");
  setHand(g, g.cpu, "天ノ川");
  const r = g.cpuTurn();
  assert.ok(r && r.ok, r && r.why);
  assert.equal(r.text, "天の川");
  assert.equal(g.cpu.score, 6);
  const g2 = newGame(1, "normal", "N5");
  setHand(g2, g2.cpu, "見儿");
  const r2 = g2.cpuTurn();
  assert.ok(r2 && r2.ok);
  assert.equal(r2.text, "見る");
});

test("動けない・ヒントも、ノ・儿・ナ の札をかなとして数える", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "天ノ川");
  const w = g.releasableInHand(g.me); // 天の・天の川 のどちらか（表の先に出る方）
  assert.ok(w && T.WORDS.has(w) && w.includes("の"), w);
  // 段1：いま並べれば放てる
  const ids = setHand(g, g.me, "天ノ川");
  tryN(g, 3);
  const h = g.hintActive();
  assert.equal(h.tier, 1);
  assert.equal(h.word, "天の川");
  assert.deepEqual([...h.ids].sort(), [...ids].sort());
  // 段2：割って 儿 が出れば 見る（見見 → 見 目 儿）
  const g2 = newGame(1, "weak", "N5");
  setHand(g2, g2.me, "見見");
  tryN(g2, 3);
  const h2 = g2.hintActive();
  assert.equal(h2.tier, 2);
  assert.equal(h2.op, "割る");
  assert.equal(h2.word, "見る");
});

test("外す語の一覧も効く（かなの語でも、一覧にあれば語の表から外れる）", () => {
  const D2 = { ...D, blocked_words_g1: { ...D.blocked_words_g1, words: [...D.blocked_words_g1.words, "天の川"] } };
  const L = K.makeTables(D2, "G1");
  assert.ok(!L.WORDS.has("天の川"));
  assert.ok(TG1.WORDS.has("天の川"));
  assert.equal(K.releasable(L, new Set(), "天ノ川").why, "辞書にない");
});

test("ほかの言葉は今まで通り（休日・山川・四字熟語の倍）。かなを含まない並びは書き方が変わらない", () => {
  const g = newGame(1, "weak", "N5");
  setHand(g, g.me, "休日");
  const r = g.release(g.me, g.me.cards.map((x) => x.id));
  assert.deepEqual([r.text, r.pts], ["休日", 3]);
  const yoji = [...T.WORDS.values()].find((w) => w.yoji && ![...w.w].some(isKana));
  assert.equal(K.scoreOf(D, T, yoji.w).pts, D.rules.score.by_length["4"] * D.rules.score.yoji_mult);
});
