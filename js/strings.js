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
  // 印を字に組み込むボタン：[印の前の字, 印, 印のあとの字]（Fl＋印＋p／印＋ycle／印＋ame reading）。
  // Split（KJ-059。D-075）だけ印は SVG ではなく「割れ目」（札の割れ目と同じ縦の点線）：Sp｜lit。傾きと色は index.html の .sp-a・.sp-b・.sp-cut
  const LOGO = Object.freeze({
    bSplit: Object.freeze(["Sp", "cut", "lit"]),
    bInvert: Object.freeze(["Fl", "invert", "p"]),
    bCycle: Object.freeze(["", "cycle", "ycle"]),
    bHomo: Object.freeze(["", "homophone", "ame reading"]),
  });
  // Back の左向きの矢印（KJ-078。矢印の形は仮決め）。文字と同じ高さ・色（currentColor）。読み上げには出さない（文字は Back のまま）
  const BACK_ARROW = '<svg class="ic ic-back" viewBox="0 0 16 24" style="width:1.1em;height:1.2em" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 12H3M7.5 7.5L3 12L7.5 16.5"/></g></svg>';
  // ボタンの中身の HTML（LOGO のあるボタンは印の SVG 入り。無いボタンは文字だけ。Back だけ左向きの矢印＋文字）
  function buttonHtml(id) {
    if (id === "bBack") return `${BACK_ARROW}<span class="bk">${BUTTONS.bBack}</span>`;
    const lg = LOGO[id];
    if (lg && lg[1] === "cut") return `<span class="sp-a">${lg[0]}</span><span class="sp-cut" aria-hidden="true"></span><span class="sp-b">${lg[2]}</span>`;
    return lg ? `${lg[0]}${iconSvg(lg[1])}${lg[2]}` : BUTTONS[id];
  }
  // 引き直しの添え字（KJ-049）：次の値段と残りの回数（例：Redraw 0pt あと5回・Redraw -10pt あと3回。回数の言い方は仮）。
  // 値段は、その試合で何回目かで決まる（0・5・10・15・20）。使いきったら 値段は出さず「あと0回」
  const redrawNote = {
    cost: (pt) => (pt > 0 ? `-${pt}pt` : `${pt}pt`),
    left: (n) => `あと${n}回`,
    text: (pt, n) => (pt === null ? redrawNote.left(0) : `${redrawNote.cost(pt)} ${redrawNote.left(n)}`),
  };
  // ボタン以外の短い文言（KJ-042。作者「文は仮」。ここ1か所で直せる）。ボタンではないので日本語のまま
  const TEXT = Object.freeze({
    title: "漢字版（仮）",
    lead: (score, min) => `漢字を割ってくっつけて、言葉を放つ。先に ${score} 点か ${min} 分で、多い方が勝ち。`,
    tray: (n, max) => `ストック ${n} / ${max}`,
    masthead: "バラバラ新報", // 表紙の題字（KJ-093。作者「題字は表紙に回します〜」。名は仮）
    faceLabel: "札の字", // 設定：札の字体（KJ-093。初期は大正風）
    faceTaisho: "大正風", // Kaisei Tokumin
    faceMincho: "明朝", // Shippori Mincho
    newsLabel: "背景の記事", // 設定：背景の記事の入り切り（KJ-094。初期は入）
    newsOn: "入",
    newsOff: "切",
    btnLabel: "ボタン", // 設定：卓の操作5つ（Split・Join・Flip・Cycle・Same reading）の押せる／押せないの見え方（KJ-099。初期は白抜き）
    btnWhite: "白抜き", // 押せる＝墨の地に札の色の太字／押せない＝紙の地に薄い字
    btnLine: "下線", // 押せる＝札の色の地に墨の太字＋弁柄の下線／押せない＝紙の地に薄い字
    redrawHold: "長押しで引き直し", // Redraw を1回タップしたときに小さく出す（KJ-078。引き直しは長押し。🚫 ではない）
  });
  // 戦況の欄（KJ-094。P-094。作者「戦況は読まないけど賑やかしにいいので好きです」「戦況で使われるひらがなに相当する箇所はカタカナにしたい。読めたらすごいよってことで」）
  // 放った言葉を、漢字カタカナ交じりの文にする。文の型はここ1か所（仮）。{who}＝あなた→アナタ・CPU はそのまま／{word}＝放った言葉（漢字のまま）／{yomi}＝読み（カタカナ。語の表に無ければ出さない）／
  // {n}・{pts}＝字数・点（漢数字）／{cards}＝場から取った字（取ったぶんだけ。まだ取っていなければ文ごと出さない）。字は js/core.js の K.senkyoLines が組む
  const SENKYO = Object.freeze({
    head: "戦況", // 欄の左の縦書きの見出し
    release: "{who}、{word}{yomi}ヲ放ツ。",
    yomi: "（{kana}）",
    score: "{n}字ニテ{pts}点。",
    take: "場ヨリ{cards}ヲ取ル。",
    sep: "・",
  });
  // 背景の記事（KJ-094。見本「新聞21」の文。遊びの決まりを新聞の文体にしたもの。文は仮）。画面の背景いっぱいに繰り返す。点は決まり（data/rules.json）と同じ：三字九点・四字十二点・四字熟語は倍・引き直しは五度まで
  const NEWS = "本紙特報。漢字ヲ割リ、回シ、裏返シ、合セテ別ノ字ト為シ、言葉ヲ放ツ遊戯、市中ニ大流行ス。相手ノ放チタル言葉ハ其ノ儘返ス能ハズ、必ズ一工夫ヲ要ス。場ニ出デタル札ハ早キ者ノ物ナリ。三字ノ言葉ハ九点、四字ハ十二点、四字熟語ハ其ノ倍ナリ。引直シハ五度マデ、回ヲ重ヌル毎ニ値上ル。記者曰ク、待ツモ一手、攻ムルモ一手、勝敗ハ十分ニシテ決ス。";
  return Object.freeze({ ICON_SHAPES, iconSvg, BUTTONS, LOGO, buttonHtml, redrawNote, TEXT, SENKYO, NEWS });
});
