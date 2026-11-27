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
    bJoin: Object.freeze(["Jo", "burst", "in"]),
    bRelease: Object.freeze(["Play", "arc", ""]),
    bInvert: Object.freeze(["Fl", "invert", "p"]),
    bCycle: Object.freeze(["", "cycle", "ycle"]),
    bHomo: Object.freeze(["", "homophone", "ame reading"]),
  });
  // Join（KJ-103。作者の決め：見本「Join の印」の案B＋衝撃 放射）：Jo｜in を上がくっつくハの字に寄りかからせ（線は入れない）、継ぎ目の真上に墨の放射3本（漫画の「ぶつかり」）。
  // 放射の SVG は 16×8（ボタンの字 17px のとき）：線3本・太さ1.6・端は丸・色は墨（--ink）。傾き・置き場・押せないときの薄さは index.html の .jn-a・.jn-b・.jn-fx
  const BURST_SVG = '<svg class="jn-fx" viewBox="0 0 16 8" aria-hidden="true" focusable="false"><g fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round"><path d="M8 7.5V1"/><path d="M6.2 7.5L2 2.5"/><path d="M9.8 7.5L14 2.5"/></g></svg>';
  // Play（KJ-120。作者の決め：案C 放物線）：字の上に点線の弧と矢（右上へ飛んで右下へ落ちる）。SVG は 54×16・弧 M2 14 Q26 -4 50 10・矢 M45 6 L51 10 L45 13・太さ 1.6・端は丸・点線 3 3・色は字と同じ（currentColor）。置き場・押せないときの薄さは index.html の .pl-arc
  const ARC_SVG = '<svg class="pl-arc" viewBox="0 0 54 16" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 14Q26 -4 50 10" stroke-dasharray="3 3"/><path d="M45 6L51 10L45 13"/></g></svg>';
  // Back の左向きの矢印（KJ-078。矢印の形は仮決め）。文字と同じ高さ・色（currentColor）。読み上げには出さない（文字は Back のまま）
  const BACK_ARROW = '<svg class="ic ic-back" viewBox="0 0 16 24" style="width:1.1em;height:1.2em" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 12H3M7.5 7.5L3 12L7.5 16.5"/></g></svg>';
  // ボタンの中身の HTML（LOGO のあるボタンは印の SVG 入り。無いボタンは文字だけ。Back だけ左向きの矢印＋文字）
  function buttonHtml(id) {
    if (id === "bBack") return `${BACK_ARROW}<span class="bk">${BUTTONS.bBack}</span>`;
    const lg = LOGO[id];
    if (lg && lg[1] === "cut") return `<span class="sp-a">${lg[0]}</span><span class="sp-cut" aria-hidden="true"></span><span class="sp-b">${lg[2]}</span>`;
    if (lg && lg[1] === "burst") return `<span class="jn-a">${lg[0]}</span><span class="jn-seam" aria-hidden="true">${BURST_SVG}</span><span class="jn-b">${lg[2]}</span>`;
    if (lg && lg[1] === "arc") return `<span class="pl-t">${lg[0]}${ARC_SVG}</span>`;
    return lg ? `${lg[0]}${iconSvg(lg[1])}${lg[2]}` : BUTTONS[id];
  }
  // 引き直しの添え字（KJ-049）：次の値段と残りの回数（例：Redraw 0pt あと5回・Redraw -10pt あと3回。回数の言い方は仮）。
  // 値段は、その試合で何回目かで決まる（0・5・10・15・20）。使いきったら 値段は出さず「あと0回」
  const redrawNote = {
    cost: (pt) => (pt > 0 ? `-${pt}pt` : `${pt}pt`),
    left: (n) => `あと${n}回`,
    text: (pt, n) => (pt === null ? redrawNote.left(0) : `${redrawNote.cost(pt)} ${redrawNote.left(n)}`),
  };
  // 歯車の印（KJ-123。作者「何処かに歯車マークつけて設定で変えられるように」）：墨の線だけ（currentColor）。角丸の箱・影・光彩はつけない。形・大きさは仮。読み上げには出さない（ボタンは aria-label＝TEXT.settings）
  const GEAR_SVG = '<svg class="gear-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M10.4 5.4L10.4 2.5L13.6 2.5L13.6 5.4L15.5 6.2L17.6 4.2L19.8 6.4L17.8 8.5L18.6 10.4L21.5 10.4L21.5 13.6L18.6 13.6L17.8 15.5L19.8 17.6L17.6 19.8L15.5 17.8L13.6 18.6L13.6 21.5L10.4 21.5L10.4 18.6L8.5 17.8L6.4 19.8L4.2 17.6L6.2 15.5L5.4 13.6L2.5 13.6L2.5 10.4L5.4 10.4L6.2 8.5L4.2 6.4L6.4 4.2L8.5 6.2Z"/><circle cx="12" cy="12" r="3"/></g></svg>';
  // ボタン以外の短い文言（KJ-042。作者「文は仮」。ここ1か所で直せる）。ボタンではないので日本語のまま
  const TEXT = Object.freeze({
    lead: (score, min) => `漢字を割ってくっつけて、放つ。\n${score}点先取か${min}分経過時に、得点の多い方が勝ち。`, // 作者の文（KJ-110。2行。作者の言葉のまま。\n は画面で改行）
    leadEn: (score, min) => `Split kanji, join them, and play words. First to ${score} points — or the higher score after ${min} minutes — wins.`, // 説明文の英訳（KJ-110。仮。作者が直す。Play に合わせて words）
    tray: (n, max) => `ストック ${n} / ${max}`,
    masthead: "漢対普請瓦版", // 表紙の題字（KJ-093。KJ-109 で替えた。作者「漢対普請瓦版 / Split & Join — a Kanji Duel でいきます」）。題は共有の文（KJ-107／KJ-108）もここから取る
    mastheadRuby: "かんたいふしんかわらばん", // 題字の上のルビ（KJ-109）
    mastheadSub: "Split & Join — a Kanji Duel", // 題字の下の英字の副題（KJ-109）
    hashtag: "#漢対普請瓦版", // 戦果の共有の文の最後の行（KJ-126。URL の行の次。合言葉の共有には付けない）
    shareButton: "共有", // 合言葉の共有（KJ-107）。部屋を作って合言葉が出たら、合言葉の横に出す
    shareText: (code, title, sub, url) => `${title} ${sub}\n漢字を組み合わせて、言葉づくり対戦しよう。合言葉 ${code} ${url}`, // 共有の文（KJ-122。作者の文。題＝masthead・副題＝mastheadSub・リンクは K.roomShareUrl。全部この1本に入るので navigator.share では url を別に渡さない）
    shareCopied: "コピーした", // navigator.share が無い端末で、文とリンクをクリップボードに写したとき
    shareFailed: "共有できなかった。合言葉を口で伝えてください", // 共有もコピーもできなかったとき
    shareEndFailed: "共有できなかった", // 戦果の共有（KJ-108）：共有もコピーもできなかったとき（ボタンの字を一時これにする）
    faceLabel: "札の字", // 設定：札の字体（KJ-093。初期は大正風）
    faceTaisho: "大正風", // Kaisei Tokumin
    faceMincho: "明朝", // Shippori Mincho
    settings: "設定", // 歯車のボタンの読み上げ（KJ-123）
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
    take: "山札ヨリ{cards}ヲ取ル。",
    sep: "・",
    face: "明朝体！札ノ字ガ明朝ニ", // 明朝体を放ったとき（KJ-131。仮）。戦況の欄に1行。試合のログには core.js が別に1行書く
  });
  // 戦果の共有の文（KJ-108。作者「共有機能って入れれる？ 合言葉の共有と、戦果の共有。」。文は新聞の見出し風・仮。作者が直す。ここ1か所）。字は js/core.js の K.shareResultText が組む。
  // 戦況（SENKYO）と同じく漢字カタカナ交じり・数は漢数字。{issue}＝号数／{who}＝相手／{me}・{opp}＝点／{word}・{pts}＝いちばん点の高かった言葉と点／{level}＝レベル。
  // 行は、勝ち・負け・引き分け・ひとりのどれか1行（head）→決め手（best。放った言葉が無ければ出さない）→レベル。相手の呼び名は who
  const SHARE_RESULT = Object.freeze({
    title: "{title} {issue}", // 1行目（{title}＝TEXT.masthead）
    win: "{who}ニ勝ツ {me}対{opp}",
    lose: "{who}ニ敗ル {me}対{opp}",
    draw: "{who}ト引キ分ケ {me}対{opp}",
    solo: "一人デ{me}点",
    best: "決メ手ハ『{word}』{pts}点",
    level: "（{level}）",
    minus: "負", // 点がマイナスのとき、漢数字の前に付ける（引き直しで払いすぎたとき。仮。作者が直す）
    sep: "／", // 行と行の間
    whoCpu: { weak: "CPU（トテモヨワイ）", fair: "CPU（フツウ）", normal: "CPU（ツヨイ）" }, // CPU の強さ（画面の呼び名のカタカナ）
    whoRoom: "友ダチ", // 合言葉の部屋の相手
  });
  // 煽り文句（KJ-126。作者「いまのResult、少し寂しかったので入れたいです」「外野っつうか、記者かな。野球や相撲のみたいな」「號外」）。話し手：記者（スポーツ新聞の見出し）。文は全部仮。話し手も仮。作者が直す。ここ1か所。
  // 選ぶのは js/core.js の K.aoriLine（終わりの画面）・K.aoriShareLine（戦果の共有）。上から順に見て最初に合ったもの。{word}＝語・{n}＝字数（漢数字）・{me}{opp}＝点（漢数字）
  // closeMax＝大接戦とみる点差（以下）・longMin＝大技とみる字数（以上）
  // 終わりの画面：遊んだ本人を褒める（勝ち負けの見出しのすぐ下）
  const AORI = Object.freeze({
    closeMax: 10,
    longMin: 4,
    silent: "沈黙の一戦、語らずして幕", // 言葉を1つも放っていない
    winSpecial: "{word}、ここに極まれり！", // 勝ち・特別な語を放った
    winLong: "{n}字の大技、炸裂！", // 勝ち・一番長い語が longMin 字以上
    winFast: "電光石火の快勝！", // 勝ち・時間切れの前に勝ちの点に届いた
    winClose: "手に汗握る大接戦！", // 勝ち・点差が closeMax 以下
    win: "堂々の一番勝ち！",
    draw: "互角の名勝負、決着は次号へ！",
    loseClose: "惜敗！雪辱は次の一番で", // 負け・点差が closeMax 以下
    lose: "涙の敗走、されど再起を誓う",
  });
  // 戦果の共有：見た人を呼び込む（見出しの行のすぐ下）。勝ち負けより、面白い語・接戦を先に見る。言葉を1つも放っていないときは出さない
  const AORI_SHARE = Object.freeze({
    closeMax: 10,
    longMin: 4,
    special: "號外！『{word}』現る", // 特別な語を放った
    long: "號外！{n}字の大技『{word}』", // 一番長い語が longMin 字以上
    draw: "互角！決着は次号へ",
    close: "{me}対{opp}、手に汗握る大接戦！", // 点差が closeMax 以下
    win: "快勝！決め手は『{word}』", // {word}＝その試合で一番点の高い語
    lose: "無念。されど『{word}』を放つ",
  });
  // 背景の記事（KJ-094。見本「新聞21」の文。遊びの決まりを新聞の文体にしたもの。文は仮）。画面の背景いっぱいに繰り返す。点は決まり（data/rules.json）と同じ：三字九点・四字十二点・四字熟語は倍・引き直しは五度まで
  const NEWS = "本紙特報。漢字ヲ割リ、回シ、裏返シ、合セテ別ノ字ト為シ、言葉ヲ放ツ遊戯、市中ニ大流行ス。相手ノ放チタル言葉ハ其ノ儘返ス能ハズ、必ズ一工夫ヲ要ス。山札ニ出デタル札ハ早キ者ノ物ナリ。三字ノ言葉ハ九点、四字ハ十二点、四字熟語ハ其ノ倍ナリ。引直シハ五度マデ、回ヲ重ヌル毎ニ値上ル。記者曰ク、待ツモ一手、攻ムルモ一手、勝敗ハ十分ニシテ決ス。";
  // ---------- 言語の切り替え（KJ-127。作者「別の言語に変えれるよう、スイッチできるようにしたい」「こっちは韓国語なしで」）----------
  // 言語は 日本語（ja）・English（en）の2つ。選んだ言語は端末に覚える（localStorage kj-lang。index.html）。初めて開いたときは navigator.language（ja→日本語、ほか→English。仮）。
  // 訳は係が作った（仮。英語に強い人が見るまで）。短く、学ぶ人に分かる英語。漢字・語・読み（かな）は訳さずそのまま出す。en に無い文は ja に落ちる（t）。
  // 範囲（段1）：はじめる前の画面・遊び方の説明（しくみ）・終わりの画面・はじかれた理由・合言葉と戦果の共有の文。題字・説明の2行・戦況・背景の記事・煽り文句・ログ・チュートリアル・部品の札の意味は日本語のまま（段2は P-128）。
  // core.js（DOM に触らない。日本語のまま）が返す画面向けの文（レベル・遊び方・強さ・終わりの見出し・はじかれた理由・部屋のエラー）は、下の CORE_EN で英語に言い換える（tr）。
  const LANGS = Object.freeze([
    Object.freeze({ key: "ja", label: "日本語", short: "JP" }),
    Object.freeze({ key: "en", label: "English", short: "EN" }),
  ]);
  let lang = "ja";
  const normLang = (v) => (v === "en" ? "en" : "ja");
  // 端末に覚えた言語（ja・en）があればそれ。無ければ navigator.language（ja で始まれば日本語。ほかは English。空なら日本語）
  const detectLang = (stored, nav) => (stored === "ja" || stored === "en" ? stored : !nav || /^ja([-_]|$)/i.test(String(nav)) ? "ja" : "en");
  const getLang = () => lang;
  const setLang = (v) => { lang = normLang(v); return lang; };
  const U = {
    setHead: { ja: "はじめる前に選ぶ", en: "Choose before you start" },
    lblPlay: { ja: "遊び方", en: "Mode" },
    lblPower: { ja: "強さ", en: "CPU level" },
    lblRoom: { ja: "合言葉の部屋", en: "Room" },
    lblLevel: { ja: "レベル", en: "Level" },
    lblTime: { ja: "時間", en: "Time" },
    lblVib: { ja: "振動", en: "Vibration" },
    lblFace: { ja: TEXT.faceLabel, en: "Card font" },
    faceTaisho: { ja: TEXT.faceTaisho, en: "Taisho style" },
    faceMincho: { ja: TEXT.faceMincho, en: "Mincho" },
    on: { ja: "入", en: "On" },
    off: { ja: "切", en: "Off" },
    actHost: { ja: "部屋を作る", en: "Create a room" },
    actEnter: { ja: "部屋に入る", en: "Join a room" },
    codePh: { ja: "数字4けた", en: "4 digits" },
    codeAria: { ja: "合言葉", en: "Room code" },
    enterBtn: { ja: "合言葉で入る", en: "Join with code" },
    enterNote: { ja: "入る側は、作った人のレベル・時間で遊ぶ", en: "If you join, you play at the host's level and time" },
    cancel: { ja: "やめる", en: "Cancel" },
    start: { ja: "はじめる", en: "Start" },
    langBtn: { ja: "言語", en: "Language" },
    settings: { ja: TEXT.settings, en: "Settings" },
    counts: { ja: (c, w, l) => `字 ${c}・語 ${w}（レベル ${l}）`, en: (c, w, l) => `${c} kanji, ${w} words; level ${l}` },
    dataFail: { ja: "データを読めませんでした（file:// では開けません。Pages かローカルのサーバーで開いてください）", en: "Couldn't load the data (it won't open from file://. Use Pages or a local server)" },
    roomMaking: { ja: "部屋を作っている…", en: "Creating the room..." },
    roomHosted: { ja: (l, t) => `合言葉を相手に伝えてください（レベル ${l}・${t}）。相手を待っています`, en: (l, t) => `Tell your friend the room code (level ${l}, ${t}). Waiting for them...` },
    roomFinding: { ja: "部屋を探している…", en: "Looking for the room..." },
    roomVersion: { ja: "相手と版がちがう（二人とも読み込み直してから、もう一度）", en: "Version mismatch (both of you reload the page, then try again)" },
    roomTheirs: { ja: (l, t) => `相手の設定：レベル ${l}・${t}`, en: (l, t) => `Host's settings: level ${l}, ${t}` },
    roomJoining: { ja: (set) => `${set}。入っている…`, en: (set) => `${set}. Joining...` },
    roomWaiting: { ja: (set) => `${set}。始まるのを待っています`, en: (set) => `${set}. Waiting for the game to start` },
    roomCancelled: { ja: "やめた", en: "Cancelled" },
    roomHostSet: { ja: (l, t) => `作った人の設定：レベル ${l}・${t}`, en: (l, t) => `Host's settings: level ${l}, ${t}` },
    howtoSum: { ja: "しくみ", en: "How it works" },
    again: { ja: "もう一度", en: "Play again" },
    setupBtn: { ja: "設定を変える", en: "Change settings" },
    logBtn: { ja: "ログ", en: "Log" },
    copyBtn: { ja: "コピー", en: "Copy" },
    copyLog: { ja: "ログをコピー", en: "Copy log" },
    copied: { ja: "コピーした", en: "Copied" },
    copyFail: { ja: "選んである文字を手でコピーしてください", en: "Please copy the selected text by hand" },
    shareButton: { ja: TEXT.shareButton, en: "Share" },
    shareCopied: { ja: TEXT.shareCopied, en: "Copied" },
    shareFailed: { ja: TEXT.shareFailed, en: "Couldn't share. Tell your friend the room code another way" },
    shareEndFailed: { ja: TEXT.shareEndFailed, en: "Couldn't share" },
    // 合言葉の共有の文（KJ-122。ja は作者の文）。題＝masthead・副題＝mastheadSub・リンクは K.roomShareUrl。全部この1本に入る（navigator.share では url を別に渡さない）
    shareText: { ja: TEXT.shareText, en: (code, title, sub, url) => `${title} ${sub}\nCombine kanji and make words — a word duel! Room code ${code} ${url}` },
    hashtag: { ja: TEXT.hashtag, en: `${TEXT.hashtag} #KanjiDuel` }, // 戦果の共有の最後の行（KJ-126・KJ-127。合言葉の共有には付けない）
    msgWin: { ja: (a, b) => `勝ち（${a} 対 ${b}）`, en: (a, b) => `You win (${a}-${b})` },
    msgLose: { ja: (a, b) => `負け（${a} 対 ${b}）`, en: (a, b) => `You lose (${a}-${b})` },
    msgDraw: { ja: (a, b) => `引き分け（${a} 対 ${b}）`, en: (a, b) => `Draw (${a}-${b})` },
    msgSolo: { ja: (a) => `ひとりで ${a} 点`, en: (a) => `Solo: ${a} pts` },
    esPts: { ja: "点", en: "pts" },
    esVs: { ja: "対", en: "vs" },
    esPlus: { ja: (n) => `+${n}点`, en: (n) => `+${n} pts` },
    esMissed: { ja: "見逃した言葉：", en: "Missed word: " },
    esReading: { ja: "読み：", en: "Reading: " },
    esMeaning: { ja: "意味：", en: "Meaning: " },
    esSep: { ja: "　", en: "  " },
    esKotoban: { ja: "コトバンクで引く", en: "Look up on Kotobank" },
    // 台の行の注（KJ-128）：点・四字熟語・地名・名字・数＋助数詞・くっつけると・並べる順が逆・はじかれた理由のかっこ
    notePts: { ja: "点", en: " pts" },
    noteYoji: { ja: "（四字熟語）", en: " (four-character idiom)" },
    pn_地名: { ja: "地名", en: "place" },
    pn_名字: { ja: "名字", en: "surname" },
    pnSep: { ja: "・", en: " / " },
    noteCounter: { ja: "（数＋助数詞）", en: " (number + counter)" },
    noteJoins: { ja: (a) => `くっつけると ${a.join(" か ")}`, en: (a) => `Joins to make ${a.join(" or ")}` },
    noteRev: { ja: "並べる順が逆", en: "Wrong order" },
    noteParen: { ja: (x) => `（${x}）`, en: (x) => `(${x})` },
  };
  // 文を引く。en に無ければ ja。値が関数なら引数を渡して呼ぶ
  function t(key, ...args) {
    const e = U[key];
    if (!e) return key;
    const v = lang === "en" && e.en !== undefined ? e.en : e.ja;
    return typeof v === "function" ? v(...args) : v;
  }
  // core.js が日本語で返す画面向けの文を、English のときだけ言い換える（表に無い文はそのまま）。レベル・遊び方・強さ・終わりの見出し・はじかれた理由（K.rejectText の結果）・部屋のエラー
  const CORE_EN = Object.freeze({
    "小1（小学1年の漢字80字）": "Grade 1 (the 80 kanji of elementary grade 1)", "小1": "Grade 1", "N4（N5＋N4 の字）": "N4 (N5 + N4 kanji)",
    "CPU戦": "vs CPU", "友達と対戦": "vs a friend",
    "とても弱い": "Very weak", "ふつう": "Normal", "つよい": "Strong",
    "勝ち！": "You win!", "負け…": "You lose...", "引き分け": "Draw", "おわり": "Done",
    "2字から！": "2+ characters!", "漢字の札が要る！": "Needs a kanji card!", "もう放った言葉！": "Already played!", "順番が逆！": "Wrong order!",
    "山札から取りきるまで動けない！": "Take from the deck first!", "山札にない！": "Not in the deck!", "辞書にない！": "Not in the dictionary!",
    "手札もストックもいっぱい！": "Hand and stock are full!", "手札がいっぱい！": "Hand is full!", "ストックがいっぱい！": "Stock is full!",
    "くっつかない！": "Doesn't join!", "割れない！": "Can't split!", "できない字！": "Not a valid kanji!", "待ち時間！": "Cooling down!",
    "同じ読みの字がない！": "No kanji with the same reading!", "取れる枚数がない！": "Nothing left to take!",
    "相手が先に放った！": "Opponent played it first!", "1枚だけ！": "Select exactly 1 card!", "2枚だけ！": "Select exactly 2 cards!", "その字にはならない！": "That isn't the result!", "その面ではくっつかない！": "Doesn't join on that side!", "同じ読みではない！": "Not the same reading!", "札がない！": "No such card!", "通信中！": "Please wait!", "終わった！": "The game is over!", "相手が先に取った！": "Opponent took it first!", "引き直しは5回まで！": "Redraw limit: 5!",
    "合言葉は数字4けた": "The room code is 4 digits", "つながらない": "Can't connect", "その合言葉の部屋がない": "No room with that code",
    "合言葉を作れなかった（もう一度）": "Couldn't make a room code (try again)", "その部屋はもう始まっている": "That room has already started",
  });
  function tr(s) {
    if (lang !== "en") return s;
    if (Object.prototype.hasOwnProperty.call(CORE_EN, s)) return CORE_EN[s];
    const m = /^〇(.+)は一度きり！?$/.exec(String(s)); // 使った助数詞（〇円は一度きり！）
    return m ? `Only one ${m[1]} per match!` : s;
  }
  const timeLabel = (sec) => (lang === "en" ? `${sec / 60} min` : `${sec / 60}分`); // core.js の timeLabel と同じ形（ja）。English は「5 min」
  // 戦果の共有の文の型（English。KJ-127。型の読み方は SHARE_RESULT と同じ。数は算用数字〔arabic〕）。煽り文句の行（AORI_SHARE）は日本語のまま
  const SHARE_RESULT_EN = Object.freeze({
    arabic: true,
    title: "{title} {issue}",
    win: "Beat {who} {me}-{opp}",
    lose: "Lost to {who} {me}-{opp}",
    draw: "Drew with {who} {me}-{opp}",
    solo: "Solo: {me} pts",
    best: "Best word: '{word}' {pts} pts",
    level: "({level})",
    minus: "-",
    sep: " / ",
    whoCpu: { weak: "CPU (very weak)", fair: "CPU (normal)", normal: "CPU (strong)" },
    whoRoom: "a friend",
  });
  const shareResult = () => (lang === "en" ? SHARE_RESULT_EN : SHARE_RESULT);
  const hashtag = () => t("hashtag");
  // 遊び方の説明（しくみ。KJ-127 で index.html から移した）。p＝{R:rules, S:rules.score, p.min:分, levelLabel, chars, words, cycles:[巡りの名前], radKeys, radVals}。1行ずつ HTML
  const HOWTO = {
    ja: (p) => { const R = p.R, S = R.score; return [
    `<b>選ぶ</b>：手札・ストックの札をタップすると、札はそのマスに残ったまま色が変わって選ばれ、角に選んだ順の数字（1・2・3…）が出る。台には、選んだ札の写しが選んだ順に左から並ぶ。もう一度タップ（手札の札でも、台の写しでも）で外れる。ボタンは選んだ札に、選んだ順で働く。`,
    `<b>入れ替え・移す</b>：札を指で引きずって、別の札の上で離すと位置が入れ替わる（手札とストックの間でもよい）。空いたマスの上で離すと、そこへ移る。`,
    `<b>放つ</b>：台の札が辞書の語（2〜4字）なら放てる。<b>1字では放てない</b>（くっつけて作った字でも同じ）。一度放った言葉は二人とも二度と使えない。放った札は消える（相手には届かない）。`,
    `<b>点数</b>：${Object.entries(S.by_length).map(([n,p])=>`${n}字 ${p}点`).join("・")}。四字熟語は ${S.yoji_mult} 倍、特別な語（天上天下）はさらに ${S.special_mult} 倍。`,
    `<b>取る</b>：放ったら、放った字数と同じ枚数を<b>山札</b>から選んで取れる（上の段 ${R.hand_max} 枚・ストック ${R.split_extra} 枚の合わせて ${R.hand_max+R.split_extra} マスが埋まるまで）。<b>取りきるまで、ほかの手は何もできない</b>（山札が光る）。取れる枚数はためられない。取ったところには山から次の字が出る。相手も同じ山札から取るので早い者勝ち（ひとりでは取り合いなし）。`,
    `<b>ストック</b>：手札（${R.hand_max} マス）の下の ${R.split_extra} マス。字も部品も置ける。割る・くっつけるでできた札は、手札に空きがなければストックに入る（全部で ${R.hand_max+R.split_extra} 枚まで）。山札から取った札も、上の段が埋まっていればストックに入る。ストックの札も選んで使える。`,
    `<b>はじまり</b>：はじめの手札は ${R.start_hand} 枚。はじめたらすぐ時間が動く。ストックには、使いやすい部品が ${R.start_stock_parts} 枚、最初から入っている。`,
    `<b>台</b>は並べて見る場所：選んだ札は手札・ストックのマスにいるまま、台にはその写しが出る（枚数は変わらない）。`,
    `<b>レベル</b>：はじめる前に選ぶ（小1／N5／N4。小1 は小学1年の漢字80字、N4 は N5＋N4 の字）。山に入る字・語・割り方・対義・巡り・同音がレベルで変わる。いまは ${p.levelLabel}（字 ${p.chars}・語 ${p.words}）。`,
    `<b>遊び方・強さ</b>：はじめる前に選ぶ。CPU戦：とても弱い（CPU は ${R.cpu.weak_interval_sec[0]}〜${R.cpu.weak_interval_sec[1]} 秒に1回）／ふつう（${R.cpu.fair_interval_sec[0]}〜${R.cpu.fair_interval_sec[1]} 秒に1回）／つよい（${R.cpu.interval_sec[0]}〜${R.cpu.interval_sec[1]} 秒に1回）。`,
    `<b>割る</b>：台の1枚を部品表で一段だけ割る。<b>くっつける</b>：台の2枚を、左→右の順でくっつける。逆に並べたときは「並べる順が逆」と出る。十・口（古・田）や 大・丶（太・犬）のように2通りの字になるときは選ぶ。`,
    `<b>反転</b>（印：${iconSvg("invert")}）対義の字に。${R.cooldown_sec.invert} 秒待ち。<b>巡り</b>（印：${iconSvg("cycle")}）${p.cycles.join("・")}を1つ先へ。${R.cooldown_sec.cycle} 秒待ち。<b>同音</b>：同じ読みの字から選ぶ。${R.cooldown_sec.homophone} 秒待ち。待ち時間は操作ごとで、二人は別々。`,
    `<b>引き直し</b>：手札を全部入れ替える（${R.start_hand} 枚）。値段は、その試合で何回目かで上がる（${R.redraw.costs.map(c=>c+" 点").join("→")}）。${R.redraw.costs.length} 回まで。点が足りなくても払える（マイナスになってよい）。`,
    `<b>勝ち</b>：先に ${R.win.score} 点。または ${p.min} 分たって点の多い方。CPU の速さは強さで変わる。`,
    `${p.radKeys.join("・")} を左に置いてくっつけられるときは、${p.radVals.join("・")} の形で見せる（札はもとの字のまま）。色の薄い札は部品（字ではない）。`,
    `<b>ヒント</b>：${R.hint.timed_sec ? `${R.hint.timed_sec} 秒なにも放たない・引き直さないと` : ""}${R.hint.fail_streak ? `${R.hint.timed_sec ? "、または続けて " : "続けて "}${R.hint.fail_streak} 回はじかれると` : ""}、使う札と操作のボタンが光る（${R.hint.glow_sec} 秒。ほかの手をしても残る。光らせた言葉を放つ・光らせた札が無くなる・引き直しを使うと消える）。言葉は文字では出ない。点はかからない。`,
    `<b>ログ</b>：一手ごとの記録。上の「ログ」で見てコピーできる。終わったら「ログをコピー」が出る。`,
    ]; },
    en: (p) => { const R = p.R, S = R.score; return [
    `<b>Select</b>: tap cards in your hand or stock. A selected card stays in its slot, changes colour and gets a number (1, 2, 3, ...) in its corner. Copies of the selected cards line up on the stand from the left, in the order you picked them. Tap again (the card or its copy) to deselect. The buttons act on the selected cards in that order.`,
    `<b>Swap / move</b>: drag a card onto another card and release to swap places (hand and stock too). Release on an empty slot to move it there.`,
    `<b>Play</b>: a word on the stand can be played if it is in the dictionary (2-4 characters). <b>A single character can't be played</b> (even one you made by joining). A word that has been played can't be used again by either player. Played cards disappear (they don't reach your opponent).`,
    `<b>Points</b>: ${Object.entries(S.by_length).map(([n,p])=>`${n} characters ${p} pts`).join(" / ")}. Four-character idioms x${S.yoji_mult}; the special word (天上天下) another x${S.special_mult}.`,
    `<b>Take</b>: after you play, take as many cards from the <b>deck</b> as the word had characters (until the ${R.hand_max} top slots and ${R.split_extra} stock slots, ${R.hand_max+R.split_extra} in all, are full). <b>You can't do anything else until you have taken them all</b> (the deck glows). Unused takes can't be saved. A new kanji appears from the pile where you took one. Your opponent takes from the same deck, so it's first come, first served (no rush when you play solo).`,
    `<b>Stock</b>: the ${R.split_extra} slots below your hand (${R.hand_max} slots). They hold kanji and parts. Cards made by splitting or joining go to the stock when the hand is full (up to ${R.hand_max+R.split_extra} cards in all). Cards taken from the deck go to the stock when the top row is full. You can select and use stock cards too.`,
    `<b>Start</b>: you begin with ${R.start_hand} cards in hand, and the clock starts right away. The stock begins with ${R.start_stock_parts} handy parts.`,
    `<b>The stand</b> is where you line cards up: selected cards stay in their slots, and copies appear on the stand (the number of cards doesn't change).`,
    `<b>Level</b>: chosen before the game (Grade 1 / N5 / N4. Grade 1 is the 80 kanji of elementary grade 1; N4 is the N5 + N4 kanji). The kanji, words, splits, opposites, cycles and same-readings in the deck change with the level. Now: ${p.levelLabel} (${p.chars} kanji, ${p.words} words).`,
    `<b>Mode and CPU level</b>: chosen before the game. vs CPU: very weak (the CPU moves once every ${R.cpu.weak_interval_sec[0]}-${R.cpu.weak_interval_sec[1]} s) / normal (${R.cpu.fair_interval_sec[0]}-${R.cpu.fair_interval_sec[1]} s) / strong (${R.cpu.interval_sec[0]}-${R.cpu.interval_sec[1]} s).`,
    `<b>Split</b>: splits one card on the stand by one step in the parts table. <b>Join</b>: joins two cards on the stand, left to right. In the wrong order you'll see "Wrong order". When two kanji are possible (like 十 + 口 gives 古 or 田, 大 + 丶 gives 太 or 犬) you choose.`,
    `<b>Flip</b> (icon: ${iconSvg("invert")}) turns a kanji into its opposite; ${R.cooldown_sec.invert} s cooldown. <b>Cycle</b> (icon: ${iconSvg("cycle")}) moves one step along ${p.cycles.join(", ")}; ${R.cooldown_sec.cycle} s cooldown. <b>Same reading</b>: choose among kanji read the same way; ${R.cooldown_sec.homophone} s cooldown. Cooldowns are per action, and separate for each player.`,
    `<b>Redraw</b>: replaces your whole hand (${R.start_hand} cards). The price goes up with each redraw in a game (${R.redraw.costs.map(c=>c+" pts").join(" / ")}), up to ${R.redraw.costs.length} times. You can pay even without enough points (your score can go negative).`,
    `<b>Winning</b>: first to ${R.win.score} points, or the higher score after ${p.min} minutes. The CPU's speed depends on its level.`,
    `When ${p.radKeys.join(", ")} sit on the left and can be joined, they are shown as ${p.radVals.join(", ")} (the card is still the original kanji). Pale cards are parts, not kanji.`,
    `<b>Hint</b>: ${R.hint.timed_sec ? `if you play nothing and don't redraw for ${R.hint.timed_sec} s` : ""}${R.hint.fail_streak ? `${R.hint.timed_sec ? ", or after " : "after "}${R.hint.fail_streak} rejections in a row` : ""}, the cards to use and the button glow (for ${R.hint.glow_sec} s; the glow stays if you do something else, and goes away when you play the hinted word, lose the hinted cards, or redraw). The word itself is never shown. It costs no points.`,
    `<b>Log</b>: a record of every move. Open it with "Log" above and copy it. When the game ends, "Copy log" appears.`,
    ]; },
  };
  const howto = (p) => HOWTO[lang === "en" ? "en" : "ja"](p);
  return Object.freeze({ ICON_SHAPES, iconSvg, BUTTONS, LOGO, buttonHtml, redrawNote, TEXT, GEAR_SVG, SENKYO, SHARE_RESULT, SHARE_RESULT_EN, shareResult, hashtag, AORI, AORI_SHARE, NEWS, LANGS, normLang, detectLang, getLang, setLang, t, tr, timeLabel, howto, CORE_EN });
});
