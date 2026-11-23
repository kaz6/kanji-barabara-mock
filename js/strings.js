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
  // 角の印（KJ-048。作者 2026-11-23。D-063）：⇄・↻・♪ の文字はやめて、ボタンの文字の1字に組み込んだ形の SVG にした。
  // Flip＝i の位置に「上の点＋両向きの縦矢印」（F2）／Cycle＝C の位置に「矢じり付きの C」（C1）／Same reading＝S の位置に「両端が矢じりの S」（S1）。
  // 形は相談チャットの見本。線の太さ・大きさは仮。色は文字と同じ（currentColor）。ボタンでは字と同じ高さ、札の角では今の印の大きさ
  const ICON_SHAPES = Object.freeze({
    invert: { w: 12, h: 24, sw: 2.2, dot: [6, 3, 1.7], d: ["M6 8.5V21.5M3.5 11L6 8.5L8.5 11M3.5 19L6 21.5L8.5 19"] },
    cycle: { w: 20, h: 24, sw: 2.4, d: ["M16 6.5A8 8 0 1 0 16 17.5", "M12.5 3.5L16 6.5L12 8.5"] },
    homophone: { w: 18, h: 24, sw: 2.3, d: ["M14.5 6.5C13.5 4 4 3 4 8C4 12.5 14 11.5 14 16C14 21 4.5 20.5 3.5 17.5", "M14.5 3.5V6.5H11.5", "M3.5 20.5V17.5H6.5"] },
  });
  // 印の SVG（文字列）。k＝invert／cycle／homophone。高さは 1.2em（字の大きさに合わせる）。読み上げには出さない（ボタンは aria-label）
  function iconSvg(k) {
    const sh = ICON_SHAPES[k];
    const dot = sh.dot ? `<circle cx="${sh.dot[0]}" cy="${sh.dot[1]}" r="${sh.dot[2]}" fill="currentColor" stroke="none"/>` : "";
    const w = Math.round((sh.w / sh.h) * 12) / 10;
    return `<svg class="ic ic-${k}" viewBox="0 0 ${sh.w} ${sh.h}" style="width:${w}em;height:1.2em" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="${sh.sw}" stroke-linecap="round" stroke-linejoin="round">${sh.d.map((d) => `<path d="${d}"/>`).join("")}</g>${dot}</svg>`;
  }
  // ボタンの読み上げの名前（aria-label）。画面の字は下の LOGO（印を字の1つに組み込む）
  const BUTTONS = Object.freeze({
    bRelease: "Play",
    bSplit: "Split",
    bJoin: "Join",
    bInvert: "Flip",
    bCycle: "Cycle",
    bHomo: "Same reading",
    bBack: "Back",
    bRedraw: "Redraw",
  });
  // 印を字に組み込むボタン：[印の前の字, 印, 印のあとの字]（Fl＋印＋p／印＋ycle／印＋ame reading）
  const LOGO = Object.freeze({
    bInvert: Object.freeze(["Fl", "invert", "p"]),
    bCycle: Object.freeze(["", "cycle", "ycle"]),
    bHomo: Object.freeze(["", "homophone", "ame reading"]),
  });
  // ボタンの中身の HTML（LOGO のあるボタンは印の SVG 入り。無いボタンは文字だけ）
  function buttonHtml(id) {
    const lg = LOGO[id];
    return lg ? `${lg[0]}${iconSvg(lg[1])}${lg[2]}` : BUTTONS[id];
  }
  // 引き直しの添え字（点があるとき Redraw -5pt〔作者「Redraw には『-5pt』で。」〕・点がないとき Redraw 30s）。
  // 30秒待っているあいだは添え字 30s のまま、ボタンの地のゲージで残りを見せる（KJ-034。秒数の文字は出さない）
  const redrawNote = {
    cost: (pt) => `-${pt}pt`,
    free: (sec) => `${sec}s`,
  };
  // ボタン以外の短い文言（KJ-042。作者「文は仮」。ここ1か所で直せる）。ボタンではないので日本語のまま
  const TEXT = Object.freeze({
    title: "漢字版（仮）",
    lead: (score, min) => `漢字を割ってくっつけて、言葉を放つ。先に ${score} 点か ${min} 分で、多い方が勝ち。`,
    tray: (n, max) => `ストック ${n} / ${max}`,
  });
  return Object.freeze({ ICON_SHAPES, iconSvg, BUTTONS, LOGO, buttonHtml, redrawNote, TEXT });
});
