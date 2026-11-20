// 操作の計算：割る・くっつける・反転・巡り・同音・届き方・投げられるか・待ち時間
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { KJ, D, T } = require("./helpers");

test("割る：一段だけ（天 → 一 大。大 まではバラさない）", () => {
  assert.deepEqual(KJ.splitOnce(T, "天"), ["一", "大"]);
  assert.deepEqual(KJ.splitOnce(T, "大"), ["一", "人"]);
  assert.deepEqual(KJ.splitOnce(T, "休"), ["人", "木"]);
});

test("割る：割れない札はそのまま（一・卜）", () => {
  assert.deepEqual(KJ.splitOnce(T, "一"), ["一"]);
  assert.equal(KJ.canSplit(T, "一"), false);
  assert.deepEqual(KJ.splitOnce(T, "卜"), ["卜"]);
});

test("割る→くっつける：部品表のどの字も、割った2枚を左→右に並べると戻る（十口 を除く）", () => {
  for (const [c, [a, b]] of Object.entries(D.parts.parts)) {
    if (a + b === "十口") continue; // 古と田が同じ左右（data.test.js で見張っている）
    assert.equal(KJ.joinOf(T, a, b), c, `${a}+${b}`);
  }
});

test("くっつける：順番つき（人+木=休、木+人 はくっつかない）", () => {
  assert.equal(KJ.joinOf(T, "人", "木"), "休");
  assert.equal(KJ.joinOf(T, "木", "人"), undefined);
  assert.equal(KJ.joinOf(T, "卜", "一"), "上");
  assert.equal(KJ.joinOf(T, "一", "卜"), "下");
});

test("くっつける：中継ぎを経て二回（二+小=示、示+土=社）", () => {
  assert.equal(KJ.joinOf(T, "二", "小"), "示");
  assert.equal(KJ.isN5(T, "示"), false);
  assert.equal(KJ.joinOf(T, "示", "土"), "社");
});

test("くっつける：十+口 は 古 か 田（今は表の後に書いた方）", () => {
  assert.ok(["古", "田"].includes(KJ.joinOf(T, "十", "口")));
});

test("反転：対義の相手になり、もう一度反転すると戻る", () => {
  assert.equal(KJ.invertOf(T, "上"), "下");
  assert.equal(KJ.invertOf(T, "下"), "上");
  for (const [a, b] of D.antonyms.pairs) {
    assert.equal(KJ.invertOf(T, a), b);
    assert.equal(KJ.invertOf(T, KJ.invertOf(T, a)), a);
  }
  assert.equal(KJ.invertOf(T, "木"), undefined);
});

test("巡り：1つ先へ。最後から最初へ戻る", () => {
  assert.equal(KJ.cycleOf(T, "月"), "火");
  assert.equal(KJ.cycleOf(T, "日"), "月");
  assert.equal(KJ.cycleOf(T, "北"), "東");
  assert.equal(KJ.cycleOf(T, "十"), "一");
  for (const cy of D.cycles.cycles) {
    let c = cy.chars[0];
    for (let i = 0; i < cy.chars.length; i++) c = KJ.cycleOf(T, c);
    assert.equal(c, cy.chars[0], `${cy.name} を一周すると戻る`);
  }
  assert.equal(KJ.cycleOf(T, "人"), undefined);
});

test("同音：同じ読みの字に変えられる。自分は入らない", () => {
  const to = KJ.homoChars(T, "言");
  assert.ok(to.includes("出"), "言→出（訓 い）");
  assert.ok(!to.includes("言"));
  const g = KJ.homoGroups(T, "言").find(x => x.reading === "い");
  assert.ok(g && g.type === "kun" && g.chars.includes("出"));
});

test("同音：変えられる先は、どれも同じ組の読みを持つ", () => {
  for (const c of T.N5) {
    const groups = KJ.homoGroups(T, c);
    for (const x of KJ.homoChars(T, c)) {
      assert.ok(groups.some(g => g.chars.includes(x)), `${c}→${x}`);
    }
  }
  assert.deepEqual(KJ.homoChars(T, "卜"), []);
});

test("届き方：1〜2字はそのまま、3字は一段、4字は二段", () => {
  assert.deepEqual(KJ.delivered(T, "休"), ["休"]);
  assert.deepEqual(KJ.delivered(T, "休日"), ["休", "日"]);
  assert.deepEqual(KJ.delivered(T, "一日中"), ["一", "日", "口", "｜"]);
  assert.deepEqual(KJ.delivered(T, "天上天下").join(""), "一一人卜一一一人一卜");
});

test("言葉の判定：words.json の語・N5 の1字は投げられる", () => {
  const used = new Set();
  assert.deepEqual(KJ.throwable(T, used, "休日"), { ok: true });
  assert.deepEqual(KJ.throwable(T, used, "天上天下"), { ok: true });
  assert.deepEqual(KJ.throwable(T, used, "休"), { ok: true });
  for (const c of T.N5) assert.ok(KJ.throwable(T, used, c).ok, c);
});

test("言葉の判定：部品だけ・辞書にない並び・空は投げられない", () => {
  const used = new Set();
  assert.deepEqual(KJ.throwable(T, used, "卜"), { ok: false, why: "部品は投げられない" });
  assert.deepEqual(KJ.throwable(T, used, "田"), { ok: false, why: "部品は投げられない" });
  assert.deepEqual(KJ.throwable(T, used, "日休"), { ok: false, why: "辞書にない" });
  assert.equal(KJ.throwable(T, used, "").ok, false);
  const partsOnly = Object.values(D.parts.parts).flat().filter(c => !T.N5.has(c));
  for (const c of partsOnly) assert.equal(KJ.throwable(T, used, c).ok, false, c);
});

test("言葉の判定：投げ済みの語・字は投げられない（語ごと。休 を投げても 休日 は投げられる）", () => {
  const used = new Set(["休"]);
  assert.deepEqual(KJ.throwable(T, used, "休"), { ok: false, why: "投げ済み" });
  assert.deepEqual(KJ.throwable(T, used, "休日"), { ok: true });
});

test("待ち時間：反転・巡り・同音は rules.json の秒数だけ待つ", () => {
  const sec = D.rules.cooldown_sec;
  for (const k of KJ.COOLDOWN_KINDS) {
    const cd = KJ.newCooldowns();
    assert.ok(KJ.ready(cd, k, 100));
    KJ.useCooldown(cd, k, sec, 100);
    assert.equal(KJ.ready(cd, k, 100), false, `${k} 直後`);
    assert.equal(KJ.ready(cd, k, 100 + sec[k] - 0.01), false, `${k} 解ける直前`);
    assert.equal(KJ.ready(cd, k, 100 + sec[k]), true, `${k} 解けた`);
    assert.equal(KJ.cooldownLeft(cd, k, 100 + 1), sec[k] - 1);
  }
});

test("待ち時間：操作ごとに別（反転を使っても巡り・同音は待たない）", () => {
  const sec = D.rules.cooldown_sec;
  const cd = KJ.newCooldowns();
  KJ.useCooldown(cd, "invert", sec, 0);
  assert.equal(KJ.ready(cd, "invert", 1), false);
  assert.equal(KJ.ready(cd, "cycle", 1), true);
  assert.equal(KJ.ready(cd, "homophone", 1), true);
});

test("待ち時間：人ごとに別（あなたが同音を使っても CPU は待たない）", () => {
  const sec = D.rules.cooldown_sec;
  const me = KJ.newCooldowns(), cpu = KJ.newCooldowns();
  KJ.useCooldown(me, "homophone", sec, 0);
  assert.equal(KJ.ready(me, "homophone", 1), false);
  assert.equal(KJ.ready(cpu, "homophone", 1), true);
});
