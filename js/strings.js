// 画面の文言（KJ-024。作者 2026-11-21 22:56〜23:02。D-041）
// 操作のボタンの文字は英語。ボタンの文字と角の印はここに置き、index.html はここから出す（日本語を直書きしない）。
// ボタン以外の画面の文言（はじめる前・場・手札・台の行・しくみ など）は今は日本語のまま。ログは日本語のまま（core.js）。
// 一覧（日本語の元の文言と英語）は docs/STRINGS.md
(function (root, factory) {
  const S = factory();
  if (typeof module === "object" && module.exports) module.exports = S;
  else root.KJ_STR = S;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  // 角の印とボタンの前のアイコン（作者「アイコンは（⇄・↻・♪）で！」）
  const ICONS = Object.freeze({ invert: "⇄", cycle: "↻", homophone: "♪" });
  // ボタン（id → 文字）。反転・巡り・同音は、角の印と同じアイコンを前に付ける
  const BUTTONS = Object.freeze({
    bRelease: "Play",
    bSplit: "Split",
    bJoin: "Join",
    bInvert: `${ICONS.invert} Flip`,
    bCycle: `${ICONS.cycle} Cycle`,
    bHomo: `${ICONS.homophone} Sound conversion`,
    bBack: "Back",
    bRedraw: "Redraw",
  });
  // 引き直しの添え字（Redraw 5pt・Redraw 30s・待っているあいだは Redraw wait 12s）
  const redrawNote = {
    cost: (pt) => `${pt}pt`,
    free: (sec) => `${sec}s`,
    wait: (sec) => `wait ${sec}s`,
  };
  return Object.freeze({ ICONS, BUTTONS, redrawNote });
});
