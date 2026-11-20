// 漢字版（仮）モックの「操作の計算」。DOM に触らない。
// ブラウザでは window.KJ、Node では require("./js/core.js") で使う。
// 札の状態・CPU・描画は index.html に残している（KJ-003 で作り直すため。R-025）。
(function (root) {
  "use strict";

  // data/*.json（D）から表を引く。index.html の index() と同じ作り方
  function buildTables(D) {
    const T = {};
    T.parts = D.parts.parts;
    T.N5 = new Set(D.kanji.kanji.map(k => k.c));
    T.WORDS = new Map(D.words.words.map(w => [w.w, w]));
    // 同じ左右から2字できるとき（十口＝古・田）は後に書いた方が残る（KJ-001 のまま）
    T.JOIN = new Map(Object.entries(D.parts.parts).map(([k, [a, b]]) => [a + b, k]));
    T.INV = new Map();
    for (const [a, b] of D.antonyms.pairs) { T.INV.set(a, b); T.INV.set(b, a); }
    T.NEXT = new Map();
    for (const cy of D.cycles.cycles) {
      const c = cy.chars;
      c.forEach((x, i) => { if (!T.NEXT.has(x)) T.NEXT.set(x, c[(i + 1) % c.length]); });
    }
    T.HOMO = new Map();
    for (const g of D.readings.same_reading_groups) {
      for (const c of g.chars) {
        if (!T.HOMO.has(c)) T.HOMO.set(c, []);
        T.HOMO.get(c).push(g);
      }
    }
    T.SPECIAL = new Map(D.special.special.map(s => [s.w, s]));
    T.COMMON_WORDS = D.words.words.filter(w => w.common && w.w.length >= 2);
    return T;
  }

  const isN5 = (T, c) => T.N5.has(c);

  // 割る：一段だけ。割れない札はそのまま
  const splitOnce = (T, c) => T.parts[c] || [c];
  const canSplit = (T, c) => !!T.parts[c];

  // くっつける：左→右の順だけ（R-005）。できないときは undefined
  const joinOf = (T, a, b) => T.JOIN.get(a + b);

  // 反転・巡り。できないときは undefined
  const invertOf = (T, c) => T.INV.get(c);
  const cycleOf = (T, c) => T.NEXT.get(c);

  // 同音：c と同じ読みの組（音・訓は別の組。R-004）と、変えられる先の字
  const homoGroups = (T, c) => T.HOMO.get(c) || [];
  const homoChars = (T, c) => [...new Set(homoGroups(T, c).flatMap(g => g.chars))].filter(x => x !== c);

  // 投げたときに相手に届く札（D-004）：1〜2字はそのまま、3字は一段、4字は二段
  function delivered(T, text) {
    const cs = [...text];
    if (cs.length <= 2) return cs;
    const one = cs.flatMap(c => splitOnce(T, c));
    return cs.length === 3 ? one : one.flatMap(c => splitOnce(T, c));
  }

  // 投げられるか：words.json の語か N5 の1字。投げ済み（used）は投げられない（D-005・R-011）
  function throwable(T, used, text) {
    if (!text) return { ok: false, why: "" };
    if (used.has(text)) return { ok: false, why: "投げ済み" };
    if (T.WORDS.has(text) || (text.length === 1 && isN5(T, text))) return { ok: true };
    if (text.length === 1) return { ok: false, why: "部品は投げられない" };
    return { ok: false, why: "辞書にない" };
  }

  // 待ち時間（D-010・D-014）。cd は一人ずつ持つ {invert, cycle, homophone}（解ける時刻、秒）
  const COOLDOWN_KINDS = ["invert", "cycle", "homophone"];
  const newCooldowns = () => ({ invert: 0, cycle: 0, homophone: 0 });
  const ready = (cd, k, t) => t >= cd[k];
  function useCooldown(cd, k, cooldownSec, t) { cd[k] = t + cooldownSec[k]; }
  function cooldownLeft(cd, k, t) { return Math.max(0, cd[k] - t); }

  const KJ = {
    buildTables, isN5, splitOnce, canSplit, joinOf, invertOf, cycleOf,
    homoGroups, homoChars, delivered, throwable,
    COOLDOWN_KINDS, newCooldowns, ready, useCooldown, cooldownLeft,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = KJ;
  else root.KJ = KJ;
})(typeof window !== "undefined" ? window : this);
