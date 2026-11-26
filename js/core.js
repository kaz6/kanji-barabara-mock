/* 漢対普請瓦版（漢字版〔仮〕モック。KJ-109）の遊びの決まり。画面（DOM）には触らない。
   ブラウザでは window.KJ、Node では require("./js/core.js") で使う（tests/ から）。
   KJ-003：「役づくりの競争」（D-017・D-018）。手札で言葉を作って放つと点が入り、場から字を取れる */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KJ = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 相手の選び方（KJ-004）。ひとりで＝CPU なし・場の取り合いなし・50点で終わらず制限時間で終わる
  const OPPONENTS = [
    { key: "solo", label: "ひとりで" },
    { key: "weak", label: "とても弱い" },
    { key: "fair", label: "ふつう" },
    { key: "normal", label: "いまの強さ" },
  ];
  // レベル（KJ-006・KJ-044）。選ぶ順は 小1／N5／N4。N4＝N5＋N4 の字。小1＝小学1年の漢字80字（N5・N4 と重なるが、入れ物ではない別の組。
  // 字に g1:true が付いている）。レベルが変えるのは字・語・割り方・対義・巡り・同音の範囲だけ。short＝選びのボタンの文字
  const LEVELS = [
    { key: "G1", label: "小1（小学1年の漢字80字）", short: "小1" },
    { key: "N5", label: "N5", short: "N5" },
    { key: "N4", label: "N4（N5＋N4 の字）", short: "N4" },
  ];
  const levelLabel = (key) => (LEVELS.find((l) => l.key === key) || LEVELS.find((l) => l.key === "N5")).label;
  const levelShort = (key) => (LEVELS.find((l) => l.key === key) || LEVELS.find((l) => l.key === "N5")).short;
  // 制限時間（KJ-007）。選べる値は rules.win.time_choices_sec、既定は win.time_limit_sec（D-024）。知らない値は既定
  const timeChoices = (D) => (D.rules.win.time_choices_sec && D.rules.win.time_choices_sec.length ? D.rules.win.time_choices_sec : [D.rules.win.time_limit_sec]);
  const normTime = (D, v) => (timeChoices(D).includes(Number(v)) && v !== null && v !== "" ? Number(v) : D.rules.win.time_limit_sec);
  // 振動の形（KJ-074。D-092）。rules.vibrate の値（ms の数か配列）を返す。kind＝take／release／reject／split／join／win／lose。
  // release は o＝{len（字数）, special（特別な語）, yoji（四字熟語）}：特別な語 ＞ 4字以上・四字熟語 ＞ 3字 ＞ 2字。形が無ければ null（何もしない）
  const vibratePattern = (D, kind, o = {}) => {
    const V = D.rules.vibrate;
    if (!V) return null;
    if (kind === "release") {
      if (o.special || (o.text && (V.special_words || []).includes(o.text))) return V.special; // 特別な語（special.json）と、振動だけ特別の語（金玉。点は変えない）
      return o.yoji || o.len >= 4 ? V.release4 : o.len === 3 ? V.release3 : V.release2;
    }
    return V[kind] === undefined ? null : V[kind];
  };
  const timeLabel = (sec) => `${sec / 60}分`;
  const cpuInterval = (D, key) => (key === "weak" ? D.rules.cpu.weak_interval_sec : key === "fair" ? D.rules.cpu.fair_interval_sec : D.rules.cpu.interval_sec);

  const FILES = ["kanji", "words", "readings", "parts", "antonyms", "cycles", "radical_forms", "special", "rules", "split_shapes", "tutorial", "blocked_words_g1", "radical_meanings", "counters"];

  // ---------- 表を引く ----------
  // level を省くと rules.json の level_default（なければ N4）
  function makeTables(D, level) {
    const T = {};
    const keys = LEVELS.map((l) => l.key);
    if (!keys.includes(level)) level = keys.includes(D.rules.level_default) ? D.rules.level_default : "N4";
    // N5＜N4 は入れ物（N4 は N5 を含む）。小1 は別の組（字の g1、語の g1 で決める。N5・N4 の外の字は lv="G1" で、小1 のときだけ入る）
    const rank = { N5: 0, N4: 1 };
    const inLevel = (lv) => (lv === null ? false : rank[lv || "N5"] !== undefined && rank[lv || "N5"] <= rank[level]); // lv の無い古いデータは N5。null（小1 だけの語）と G1 は N5・N4 に入らない
    const isG1 = level === "G1";
    T.level = level;
    T.CHARS = new Set(D.kanji.kanji.filter((k) => (isG1 ? k.g1 : inLevel(k.lv))).map((k) => k.c)); // 遊ぶレベルの字（山に入る字）
    T.JOUYOU = new Set(D.parts.jouyou || []); // レベルの外でも「字」として見せる（KJ-003）
    // 小1 のときだけ放てない語（data/blocked_words_g1.json。KJ-044 追記）。語の表から外すので、放てない・CPU も使わない・ヒントにも出ない
    T.BLOCKED = new Set(isG1 && D.blocked_words_g1 ? D.blocked_words_g1.words : []);
    T.WORDS = new Map(D.words.words.filter((w) => (isG1 ? w.g1 : inLevel(w.lv)) && !T.BLOCKED.has(w.w)).map((w) => [w.w, w]));
    T.NEXT = new Map();
    // 巡りの字がすべて「レベルの字か outside（レベルの外で、巡りでだけ手に入る字。十二支。KJ-009）」のものだけ使う。四季は N4 から
    T.CYCLES = D.cycles.cycles.filter((cy) => cy.chars.every((c) => T.CHARS.has(c) || (cy.outside || []).includes(c)));
    T.OUTSIDE = new Set(); // レベルの外の字（山には入らない。巡り・同音で手に入る。「字」として見せる）
    for (const cy of T.CYCLES) for (const c of cy.outside || []) if (!T.CHARS.has(c)) T.OUTSIDE.add(c);
    for (const cy of T.CYCLES) {
      const c = cy.chars;
      c.forEach((x, i) => { if (!T.NEXT.has(x)) T.NEXT.set(x, c[(i + 1) % c.length]); });
    }
    // 小1 のときだけ、同音の行き先に N5 の字（lv が N5 で小1 でない字）も入る（KJ-070・D-089）。山には入らない。同音でだけ出会える字（十二支と同じ考え方）。
    // 小1 の字（か巡りの外の字）を1つも含まない組は使わない（N5 の字どうしだけの組へは行けない）
    const N5X = new Set(isG1 ? D.kanji.kanji.filter((k) => k.lv === "N5" && !k.g1).map((k) => k.c) : []);
    const anchor = (c) => T.CHARS.has(c) || T.OUTSIDE.has(c);
    T.HOMO = new Map();
    for (const g0 of D.readings.same_reading_groups) {
      const g = { ...g0, chars: g0.chars.filter((c) => anchor(c) || N5X.has(c)) };
      if (g.chars.length < 2 || !g.chars.some(anchor)) continue;
      for (const c of g.chars) { if (!T.HOMO.has(c)) T.HOMO.set(c, []); T.HOMO.get(c).push(g); }
    }
    T.HOMO_ONLY = new Set([...T.HOMO.keys()].filter((c) => N5X.has(c))); // 同音でだけ手に入る N5 の字（小1 のときだけ。巡りの outside とは別）
    // 小1 のとき、手に持てる N5 の字（KJ-071・D-089 追記）＝同音で手に入る字（HOMO_ONLY）と、その字の割り方で出る N5 の字・対義の相手の N5 の字（N5 のときと同じ）。
    // この字には N5 のときと同じ割り方・対義の行を使う（巡りは小1 のまま）。山には入らない。くっつけてできる字は、行がある字（この字）だけ
    T.N5HELD = new Set(T.HOMO_ONLY);
    const rowsAll = D.parts.parts, relayAll0 = new Set(D.parts.relay || []);
    if (isG1) {
      for (let grew = true; grew;) {
        grew = false;
        const base = (c) => T.CHARS.has(c) || T.N5HELD.has(c);
        const kp = new Set(Object.keys(rowsAll).filter(base));
        for (let g2 = true; g2;) { g2 = false; for (const r of relayAll0) { if (!kp.has(r) && rowsAll[r] && [...kp].some((k) => rowsAll[k].includes(r))) { kp.add(r); g2 = true; } } }
        const add = (c) => { if (N5X.has(c) && !T.N5HELD.has(c)) { T.N5HELD.add(c); grew = true; } };
        for (const k of kp) for (const c of rowsAll[k]) add(c);
        for (const [x, y] of D.antonyms.pairs) { if (base(x)) add(y); if (base(y)) add(x); }
      }
    }
    // 割り方：できる字がレベルの字の行と、そこへ届く中継ぎだけ（N5 では N4 の字の行を外す）
    const all = D.parts.parts, relayAll = new Set(D.parts.relay || []);
    const keep = new Set(Object.keys(all).filter((k) => T.CHARS.has(k) || T.N5HELD.has(k))); // 小1 は、手に持てる N5 の字の行も使う（KJ-071）
    for (let grew = true; grew;) {
      grew = false;
      for (const r of relayAll) {
        if (keep.has(r) || !all[r]) continue;
        if ([...keep].some((k) => all[k].includes(r))) { keep.add(r); grew = true; }
      }
    }
    T.parts = {};
    for (const k of Object.keys(all)) if (keep.has(k)) T.parts[k] = all[k]; // もとの並びのまま（十口 は 古 が先）
    // 行き先だけの字（KJ-077・D-095。data/parts.json の reach。氷・丸・刃・凡・勺）：山には入らず、くっつけるでだけ手に入る（割ると部品に戻る）。
    // 行は、左右の部品が両方「そのレベルで手に入る」ときだけ使う（レベルの字・手に持てる N5 の字・上の割り方の行に出てくる字）。行き先の行どうしでは手に入る字にしない
    T.REACH = new Set();
    const reachSeen = new Set(Object.entries(T.parts).flatMap(([k, v]) => [k, ...v]));
    for (const [k, [a, b]] of Object.entries(D.parts.reach || {})) {
      const got = (c) => T.CHARS.has(c) || T.N5HELD.has(c) || reachSeen.has(c);
      if (got(a) && got(b)) { T.parts[k] = [a, b]; T.REACH.add(k); }
    }
    T.RELAY = new Set([...relayAll].filter((r) => keep.has(r) && !T.CHARS.has(r) && !T.N5HELD.has(r)));
    T.SHAPES = (D.split_shapes && D.split_shapes.shapes) || {};
    T.JOIN = new Map(); // "左右" → [できる字…]（十口 は 古・田 の2つ。R-016）
    for (const [k, [a, b]] of Object.entries(T.parts)) {
      const key = a + b;
      if (!T.JOIN.has(key)) T.JOIN.set(key, []);
      T.JOIN.get(key).push(k);
    }
    // 面でくっつける（KJ-017・D-035）：引きずった札を相手の札のどの面に落とすと何になるか。割り方の形（split_shapes）を逆に引く
    // 上下の字 [上, 下]：上の札を下の札の「上」に／下の札を上の札の「下」に。左右も同じ。囲み：中の札を外の札の「中央」に（out＝外の部品の番号）
    // 形が「それ以外」（辶・广 など）や out の無い囲みの字は、面ではくっつけない
    T.FACE = new Map(); // "面\t引きずった字\t相手の字" → [できる字…]
    const addFace = (f, d, t, k) => { const key = f + "\t" + d + "\t" + t; if (!T.FACE.has(key)) T.FACE.set(key, []); T.FACE.get(key).push(k); };
    for (const [k, [a, b]] of Object.entries(T.parts)) {
      const sp = T.SHAPES[k];
      if (!sp) continue;
      if (sp.s === "tb") { addFace("top", a, b, k); addFace("bottom", b, a, k); }
      else if (sp.s === "lr") { addFace("left", a, b, k); addFace("right", b, a, k); }
      else if (sp.kind === "囲み" && (sp.out === 0 || sp.out === 1)) { const pr = [a, b]; addFace("center", pr[1 - sp.out], pr[sp.out], k); }
    }
    T.INV = new Map();
    for (const [a, b] of D.antonyms.pairs) { if ((T.CHARS.has(a) || T.N5HELD.has(a)) && (T.CHARS.has(b) || T.N5HELD.has(b))) { T.INV.set(a, b); T.INV.set(b, a); } }
    // 手に持てる字（KJ-011・D-029）：レベルの字＋割る・くっつけるで出る字（中継ぎ 交・里 など）＋巡り・対義・同音で行ける字のうち、
    // 「字」として見せるもの。放てる言葉はこの字だけで書ける語（words.json はこれで作る。tools/build_data.py の holdable と同じ決め方）
    T.HOLD = new Set(T.CHARS);
    for (const [k, v] of Object.entries(T.parts)) for (const c of [k, ...v]) if (T.CHARS.has(c) || T.JOUYOU.has(c) || T.N5HELD.has(c)) T.HOLD.add(c);
    for (const c of T.NEXT.keys()) T.HOLD.add(c);
    for (const c of T.INV.keys()) T.HOLD.add(c);
    for (const c of T.HOMO.keys()) T.HOLD.add(c);
    // かなに読む部品（KJ-053・D-069。data/parts.json の kana_parts）：ノ→の・儿→る・ナ→な。台に並べたとき、この札はかなとして言葉に入る。
    // KANA_OK＝このレベルの割り方の行に部品が出てくる（手に入る）かな。語の表（words.json）はこの決め方で作る（tools/build_data.py）
    T.KANA = new Map(Object.entries(D.parts.kana_parts || {}));
    // 別の字に読み替える部品（KJ-096。data/parts.json の reads_as）：囗→口。言葉を作るときだけ。かなではない（isKanaChar・KANA_OK には入れない）
    T.READS = new Map(Object.entries(D.parts.reads_as || {}));
    const partsSeen = new Set(Object.entries(T.parts).flatMap(([k, v]) => [k, ...v]));
    T.KANA_OK = new Set([...T.KANA].filter(([pt]) => partsSeen.has(pt)).map(([, k]) => k));
    T.SPECIAL = new Map(D.special.special.map((s) => [s.w, s]));
    T.EFFECTS = new Map(Object.entries(D.special.effects || {}).filter(([w]) => T.WORDS.has(w)).map(([w, e]) => [w, { op: e.op, target: e.target, n: e.n === undefined ? 1 : e.n }])); // 放つと効く語（KJ-079・KJ-080。語→{op, target, n}。レベルの語の表にある語だけ。点・演出は変えない）
    T.FX_WORDS = new Map((D.special.fx_words || []).map((s) => [s.w, s])); // 演出だけ特別の語（KJ-064。金玉。点・倍率・つながりは special と別で、変えない）
    // CPU が知っている語＝よく使う語（このレベルの語の表にあるものだけ。KJ-015：表にない語を知っていると、放てずに止まる）
    T.COMMON_WORDS = D.words.words.filter((w) => w.common && w.w.length >= 2 && T.WORDS.has(w.w));
    // 数＋助数詞（KJ-022・D-040。data/counters.json）：数（一〜十・百・千・万、2字は 二十〜九十・十一〜十九）＋助数詞は、辞書に無くても言葉として放てる
    const CT = D.counters;
    T.COUNTERS = new Set(CT ? CT.counters : []);
    T.COUNTER_NUMS = new Set(CT ? [...CT.numbers, ...CT.numbers2] : []);
    T.COUNTER_READ = new Map(CT ? Object.entries(CT.readings) : []);
    return T;
  }
  const isLevelChar = (T, c) => T.CHARS.has(c);
  const isN5 = isLevelChar; // 古い名前（いまは「遊ぶレベルの字」）
  // 画面で「字」として見せるか（レベルの字か常用漢字）。部品の見た目にしない
  const isChar = (T, c) => T.CHARS.has(c) || T.JOUYOU.has(c) || T.OUTSIDE.has(c) || T.N5HELD.has(c);
  // 部品の札が何と同じ意味か（KJ-021・D-039。data/radical_meanings.json）。台の行に出す一行。字の札・表にない札は null
  // 同じ意味の字があれば 亻（にんべん）＝人 の形、無ければ 艹（くさかんむり）草のこと の形。呼び名の無い部品は（）を省く
  const radicalNote = (D, T, c) => {
    const R = D.radical_meanings && D.radical_meanings.parts;
    if (!R || isChar(T, c) || !R[c]) return null;
    const e = R[c];
    return c + (e.name ? `（${e.name}）` : "") + (e.same ? `＝${e.same}` : (e.name ? "" : " ") + (e.mean || ""));
  };
  // 台で札の字が左の形（亻・氵 など。radical_forms.json）に変わっているとき、その形の一行（亻（にんべん）＝人）。base＝札の字（人）。無ければ null
  const radicalFormNote = (D, base) => {
    const form = D.radical_forms && D.radical_forms.left && D.radical_forms.left[base];
    const e = form && D.radical_meanings && D.radical_meanings.forms && D.radical_meanings.forms[form];
    return e ? `${form}（${e.name}）＝${e.same}` : null;
  };
  // 部品の札 sel を選んだとき、自分の手札（上の段）・ストックに今あるくっつく相手（KJ-083・D-101）。cards＝自分の札（手札とストック）。
  // 並べる順どおり（左右・上下の「先に選ぶほう」が前）の組 {a, b, to}。手元に無い相手は入れない。字の札・表にない札は空
  const joinPartners = (T, cards, sel) => {
    if (!sel || isChar(T, sel.c)) return [];
    const seen = new Set(), out = [];
    for (const x of cards) {
      if (x.id === sel.id) continue;
      for (const [a, b] of [[sel.c, x.c], [x.c, sel.c]]) {
        const to = joinResults(T, a, b);
        if (!to.length || seen.has(a + b)) continue;
        seen.add(a + b);
        out.push({ a, b, to: to.slice() });
      }
    }
    return out;
  };
  // 台の行に出す「くっつく：…」の一行。形は data/rules.json の join_note（full＝禾＋火→秋／partner＝禾＋火／mask＝禾＋？）。3組まで・あとは「ほか N組」。無ければ null
  const JOIN_NOTE_MODES = ["full", "partner", "mask"];
  const joinNote = (D, T, cards, sel) => {
    const mode = (D.rules && D.rules.join_note) || "full";
    const ps = joinPartners(T, cards, sel);
    if (!ps.length) return null;
    const show = (p) => {
      if (mode === "mask") return p.a === sel.c && p.b !== sel.c ? `${p.a}＋？` : p.b === sel.c && p.a !== sel.c ? `？＋${p.b}` : `${p.a}＋？`;
      return mode === "partner" ? `${p.a}＋${p.b}` : `${p.a}＋${p.b}→${p.to.join("・")}`;
    };
    const items = [...new Set(ps.map(show))];
    const head = items.slice(0, 3).join("　");
    return "くっつく：" + head + (items.length > 3 ? `　ほか${items.length - 3}組` : "");
  };
  const splitOnce = (T, c) => T.parts[c] || [c];
  const canSplit = (T, c) => !!T.parts[c];
  // 部品にバラして届く形（D-003・D-004）。KJ-003 の遊びでは使わない（消すかは作者が決める）
  function delivered(T, text) {
    const cs = [...text];
    if (cs.length <= 2) return cs;
    const one = cs.flatMap((c) => splitOnce(T, c));
    return cs.length === 3 ? one : one.flatMap((c) => splitOnce(T, c));
  }
  const joinResults = (T, a, b) => T.JOIN.get(a + b) || [];
  // 最初にストックへ入れる「使いやすい部品」の候補（KJ-013）：部品表で「くっつけてできる字」の数が多い、字として見せない部品（山に無い札）の上位 top 個
  function stockCandidates(T, top) {
    const dest = new Map();
    for (const [key, res] of T.JOIN) {
      for (const c of [...key]) {
        if (isChar(T, c)) continue;
        if (!dest.has(c)) dest.set(c, new Set());
        for (const r of res) dest.get(c).add(r);
      }
    }
    return [...dest].map(([c, set]) => ({ c, n: set.size }))
      .sort((a, b) => b.n - a.n || a.c.codePointAt(0) - b.c.codePointAt(0)).slice(0, top);
  }
  // 面（KJ-017）。上＝引きずった札が上、下＝下、左＝左、右＝右、中央＝相手の中に入る（囲み）
  const FACES = ["top", "bottom", "left", "right", "center"];
  const FACE_LABEL = { top: "上", bottom: "下", left: "左", right: "右", center: "中央" };
  const faceResults = (T, face, dragged, target) => (T.FACE && T.FACE.get(face + "\t" + dragged + "\t" + target)) || [];
  // 引きずった字 dragged を相手の字 target に落としたとき、面ごとにできる字。字にならない面は入れない（光らせない）
  function faceJoins(T, dragged, target) {
    const out = {};
    for (const f of FACES) { const rs = faceResults(T, f, dragged, target); if (rs.length) out[f] = rs.slice(); }
    return out;
  }
  // 逆に並べればくっつく（順番の決まりは変えない。表示だけ）
  const joinReversed = (T, a, b) => joinResults(T, a, b).length === 0 && joinResults(T, b, a).length > 0;
  // かなに読む部品（KJ-053）：札の字 → 言葉の中の字（ノ→の・儿→る・ナ→な。ほかはそのまま）。kanaText は札の並び（字の配列か文字列）を言葉の書き方にする（天ノ川 → 天の川）
  // 囗 は 口 として読める（KJ-096。reads_as。ろ とは読まない）
  const kanaOf = (T, c) => (T.KANA && T.KANA.get(c)) || (T.READS && T.READS.get(c)) || c;
  const kanaText = (T, chars) => [...(typeof chars === "string" ? chars : chars.join(""))].map((c) => kanaOf(T, c)).join("");
  const isKanaChar = (T, c) => !!T.KANA && [...T.KANA.values()].includes(c);
  // 語の字として使えるか：手に持てる字か、このレベルで手に入るかな（KJ-053）
  const wordCharOk = (T, c) => T.HOLD.has(c) || (!!T.KANA_OK && T.KANA_OK.has(c));
  // 放てるか：words.json の2〜4字の語。1字は放てない（KJ-008。くっつけて作った字でも例外なし）。一度放った言葉は二人とも使えない（D-005）
  // text は札の並びのまま渡してよい（ノ・儿・ナ はかなに読む。KJ-053）。部品だけ（かなだけ）の並びは放てない
  // 数＋助数詞（KJ-022・D-040）：2〜3字の言葉が 数＋助数詞 の形なら { num, counter }。そうでなければ null
  const counterParts = (T, text) => {
    const cs = [...text];
    if (!T.COUNTERS || cs.length < 2 || cs.length > 3 || !T.COUNTERS.has(cs[cs.length - 1])) return null;
    const num = cs.slice(0, -1).join("");
    return T.COUNTER_NUMS.has(num) ? { num, counter: cs[cs.length - 1] } : null;
  };
  // 放った言葉（used）に使われた助数詞（辞書にもともとある 百円・一人 なども数える。二人とも同じ）
  const usedCounters = (T, used) => {
    const out = new Set();
    for (const w of used) { const p = counterParts(T, w); if (p) out.add(p.counter); }
    return out;
  };
  // text が 数＋助数詞 で、その助数詞がもう使われていれば、その助数詞。使えるなら null
  const counterBlocked = (T, used, text) => {
    const p = counterParts(T, text);
    return p && usedCounters(T, used).has(p.counter) ? p.counter : null;
  };
  const counterWhy = (c) => `〇${c}は一度きり`;
  const counterReading = (T, text) => (T.COUNTER_READ && T.COUNTER_READ.get(text)) || null; // 組み合わせごとの読み（先頭が代表）。数＋助数詞でなければ null
  // はじかれたときに画面の真ん中へ出す理由（KJ-022・D-040）：言い切り・！で終える。決まりの側の理由（ログの「ためした」）はそのまま、出すときだけこれで言い換える
  // 表にあるもの以外は、短い理由に ！ を足す。長い文（チュートリアルの案内など）は足さない。一覧は docs/REJECT_MESSAGES.md
  const REJECT_TEXT = {
    "1字では放てない（2字以上の言葉）": "2字から！",
    "かなだけでは放てない（漢字の札が1枚以上いる）": "漢字の札が要る！",
    "放った言葉": "もう放った言葉！",
    "並べる順が逆": "順番が逆！",
  };
  const rejectText = (why) => {
    if (!why) return "";
    if (REJECT_TEXT[why]) return REJECT_TEXT[why];
    return /[！？。…]$/.test(why) || why.length > 16 ? why : why + "！";
  };
  // 放つと効く語の画面の文（KJ-079・KJ-080）。e＝{type:"effect", who, text, op, hit, from, to, ...}
  // 自分の札に効く語（自刃。e.victim が無い）：「自刃：休 が切れた」／切れる札が無ければ「自刃：切れる札が無かった」
  // 相手の札に効く語（e.victim＝効かされた側の名前。e.hits＝[{from:[字…], to:[字…]}]）：「CPU の 切る：あなたの 休 が割れた」「あなたの 回転：CPU の 六 が 七 に」。効く札が無ければ「あなたの 切る：空振り」
  const effectText = (e) => {
    if (!e.victim) return e.hit ? `${e.text}：${e.from} が切れた` : `${e.text}：切れる札が無かった`;
    const no = (n) => (n === "あなた" ? "あなたの" : `${n} の`);
    const head = `${no(e.who)} ${e.text}：`;
    if (!e.hits || !e.hits.length) return head + "空振り";
    const v = no(e.victim);
    if (e.op === "split") return head + e.hits.map((h) => `${v} ${h.from.join(" ")} が割れた`).join("、");
    if (e.op === "join") return head + e.hits.map((h) => `${v} ${h.from.join(" と ")} が ${h.to.join(" ")} に`).join("、");
    return head + e.hits.map((h) => `${v} ${h.from.join(" ")} が ${h.to.join(" ")} に`).join("、");
  };
  const SINGLE_WHY = "1字では放てない（2字以上の言葉）";
  const KANA_ONLY_WHY = "かなだけでは放てない（漢字の札が1枚以上いる）";
  function releasable(T, used, text, opts) {
    if (!text) return { ok: false, why: "" };
    text = kanaText(T, text);
    if ([...text].length === 1) return { ok: false, why: SINGLE_WHY };
    if ([...text].every((c) => isKanaChar(T, c))) return { ok: false, why: KANA_ONLY_WHY };
    if (used.has(text)) return { ok: false, why: "放った言葉" };
    const cb = opts && opts.skipCounter ? null : counterBlocked(T, used, text); // 数＋助数詞は、助数詞ごとに一度きり（辞書にある語も。KJ-022）
    if (cb) return { ok: false, why: counterWhy(cb), counter: cb };
    if (T.WORDS.has(text)) return { ok: true };
    if (counterParts(T, text)) return { ok: true, numCounter: true }; // 辞書に無くても、数＋助数詞は言葉として通す
    return { ok: false, why: "辞書にない" };
  }
  // 役の点数（R-026）。1字1・2字3・3字9・4字12、四字熟語の印つきは倍、特別な語はさらに倍
  function scoreOf(D, T, text) {
    const S = D.rules.score;
    text = kanaText(T, text); // かなは1字に数える（KJ-053。見る＝2字）
    const n = [...text].length;
    let pts = S.by_length[String(n)] || 0;
    const parts = [`${n}字${pts}`];
    const w = T.WORDS.get(text);
    if (w && w.yoji) { pts *= S.yoji_mult; parts.push(`四字熟語×${S.yoji_mult}`); }
    if (T.SPECIAL.has(text)) { pts *= S.special_mult; parts.push(`特別な語×${S.special_mult}`); }
    return { pts, how: parts.join("・") };
  }
  const homoChars = (T, c) => [...new Set((T.HOMO.get(c) || []).flatMap((g) => g.chars))].filter((x) => x !== c);
  // 割れる札の点線（KJ-014）。割れない札は null。v＝縦の点線（左右に割れる）／h＝横の点線（上下）／x＝角に「割」（囲みなど、1本の線で表せない）
  // at＝線の位置（0〜1。左右は左から、上下は上から）。形が付いていない割り方は x にする（データのテストで無いことを確かめる）
  function cutSpec(T, c) {
    if (!T.parts[c]) return null;
    const sp = T.SHAPES && T.SHAPES[c];
    if (!sp || (sp.s !== "lr" && sp.s !== "tb")) return { kind: "x", at: 0.5, enclose: !!(sp && sp.kind === "囲み") };
    return { kind: sp.s === "lr" ? "v" : "h", at: sp.at };
  }
  // 角の印。icons を渡すとその字で出す（画面は印の種類 markKinds から js/strings.js の SVG を出す。KJ-048）。渡さなければ 反・巡
  function marks(T, c, icons) {
    const ic = icons || { invert: "反", cycle: "巡" };
    return markKinds(T, c).map((k) => ic[k]).join("");
  }
  // 角の印の種類を、印の並びの順（反転・巡り）で返す。画面が印ごとに待ち時間で薄くするために使う（KJ-040）
  // 同音（S）の印は出さない（KJ-057。作者 2026-11-23「そもそも、S表記なくそうかな…」。D-073）。ボタンの Same reading と、同音の決まりはそのまま
  function markKinds(T, c) {
    const ks = [];
    if (T.INV.has(c)) ks.push("invert");
    if (T.NEXT.has(c)) ks.push("cycle");
    return ks;
  }
  // ログの頭に書く仮置きの値
  function opponentLabel(D, key, limit) {
    limit = normTime(D, limit);
    if (key === TUTORIAL_OPPONENT.key) return "チュートリアル（決まった手札と場。時間なし・CPU なし・場の取り合いなし。点は勝ち負けに関係しない）";
    if (key === ROOM_OPPONENT.key) return `${ROOM_OPPONENT.label}（相手は人。CPU なし。場の札・言葉・勝ちの点は先に入れた方。相手の手は、こちらから見えたものだけ書く）`;
    if (key === "solo") return `ひとりで（CPU なし。場の取り合いなし。50点では終わらず、${limit / 60}分たったら終わって点を出す。CPU の列は 0）`;
    const [a, b] = cpuInterval(D, key);
    const NAMES = { invert: "反転", cycle: "巡り", homophone: "同音", split: "割る" };
    const ah = ((D.rules.cpu.ahead || {})[key] || []).map((k) => NAMES[k] || k);
    const aheadText = ah.length ? `1手先は${ah.join("・")}` : "1手先は使わない"; // rules.cpu.ahead から作る（KJ-058）
    if (key === "fair") return `ふつう（CPU は ${a}〜${b}秒に1回動く。${aheadText}）`;
    return `${key === "weak" ? "とても弱い" : "つよい"}（CPU は ${a}〜${b}秒に1回動く。${aheadText}）`; // 呼び名は画面と同じ（KJ-019 追記2。前は つよい も「いまの強さ」と出ていた）
  }
  function rulesLabel(D, key, level, limit) {
    const R = D.rules, S = R.score;
    limit = normTime(D, limit);
    level = level || R.level_default || "N4";
    key = key || R.opponent_default;
    const [a, b] = cpuInterval(D, key);
    if (key === TUTORIAL_OPPONENT.key) return ["チュートリアル（KJ-043）：手札・ストック・場は data/tutorial.json の決まったもの。段ごとに、その手だけ押せる（ほかのボタンは押せない見た目）。時間なし・CPU なし・ヒントなし"];
    return [
      `場=${R.field_size}枚 最初の手札=${R.start_hand}枚 手札の上限=${R.hand_max}枚＋ストック${R.split_extra}枚（全部で${R.hand_max + R.split_extra}マス。場から取るのは上の段・ストックを合わせて${R.hand_max + R.split_extra}マスが埋まるまで（上の段が埋まっていればストックへ）。割る・くっつけるでできた札は、字も部品も、手札が埋まっていればストックへ。手札とストックの間は自分で動かせる）山=${levelShort(level)} の字を${R.same_char_in_deck}枚ずつ${level === "G1" && R.g1 && R.g1.extra_chars ? `（小1 の基本の字 ${R.g1.extra_chars.join("")} は${R.g1.extra_count}枚）` : ""}（尽きたら足す）`,
      `点数 ${Object.entries(S.by_length).map(([n, p]) => `${n}字${p}`).join("・")} 四字熟語×${S.yoji_mult} 特別な語×${S.special_mult}（1字は放てない）`,
      `はじまり：最初の手札${R.start_hand}枚で、すぐ時間が動く。ストックに使いやすい部品を${R.start_stock_parts}枚入れて始める（部品表で行き先が多い字でない部品の上位${R.start_stock_top}個から無作為）`,
      `台（机）は並べて見る場所。台に出した札は出す前の段にいるままで、上の段・下の段の枚数に数える`,
      `放ったら 放った字数×${R.take_per_char}枚を場から選んで、取りきるまで、ほかの手は何もできない（取れる枚数はためられない）。放った言葉は消える（相手には届かない）`,
      `引き直し 1試合${R.redraw.costs.length}回まで・${R.redraw.costs.map((c) => c + "点").join("→")}と回数で上がる・手札を全部入れ替え（${R.start_hand}枚）。点はマイナスになってよい（足りなくても払える）`,
      `勝ち 先に${R.win.score}点、または${limit / 60}分で点の多い方（同点は引き分け）。ひとりでは50点で終わらず${limit / 60}分で終わる`,
      `ヒント ${R.hint.timed_sec ? `人が${R.hint.timed_sec}秒なにも放たない（放つ・引き直しで数え直し）と` : "時限は無し。"}${R.hint.fail_streak ? `${R.hint.timed_sec ? "、または" : ""}人が続けて${R.hint.fail_streak}回はじかれると` : ""}、自動で札とボタンを光らせる（${R.hint.glow_sec}秒のあいだ、ほかの手をしても残る。光らせた言葉を放つか、光らせた札が（1枚でも）手札から無くなる・引き直しを使うと消える。言葉は文字で出さない。点はかけない）`,
      `待ち時間 反転=${R.cooldown_sec.invert}秒 巡り=${R.cooldown_sec.cycle}秒 同音=${R.cooldown_sec.homophone}秒（その人の操作ごと）`,
      key === "solo" || key === ROOM_OPPONENT.key ? "CPU なし" : `CPU ${a}〜${b}秒に1回動く`,
    ];
  }

  // ---------- 合言葉の部屋（KJ-033・D-049）：決まった種 ----------
  // 文字列から 32bit の種（FNV-1a）。二人が同じ match_id から同じ「場の列」を作るのに使う
  function strSeed(s) {
    let h = 0x811c9dc5;
    for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  // 決まった乱数（mulberry32）
  function seededRand(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // match_id と用途（"field"＝場の列、"host"／"guest"＝その人の手札と引き直し）ごとの乱数
  const matchRand = (matchId, tag) => seededRand(strSeed(matchId + ":" + tag));
  const ROLES = ["host", "guest"];
  const ROOM_OPPONENT = { key: "room", label: "人と（合言葉）" }; // 画面の「遊び方」の「友だちと（合言葉）」（KJ-033 後半・KJ-045）
  // はじめる前の画面の「相手」は2段（KJ-045）。1段目「遊び方」：CPU と／友だちと（合言葉）。「CPU と」のときだけ2段目「強さ」。
  // 「ひとりで」は画面から外した（KJ-056・D-072）。中の「CPU なしで動く」作り（solo。チュートリアル・テストが使う）は残してある
  // 中で使う相手のキー（solo・weak・fair・normal・room）と OPPONENTS・ROOM_OPPONENT の label は変えない（ログの頭の「相手」の行は opponentLabel が画面の呼び名で書く。KJ-019）。画面の呼び名だけ別に持つ
  const PLAY_MODES = [
    { key: "cpu", label: "CPU と" },
    { key: ROOM_OPPONENT.key, label: "友だちと（合言葉）" },
  ];
  const CPU_POWERS = [
    { key: "weak", label: "とても弱い" },
    { key: "fair", label: "ふつう" },
    { key: "normal", label: "つよい" }, // 前の呼び名は「いまの強さ」（ログの頭の「相手」の行は opponentLabel が画面の呼び名で書く。KJ-019）
  ];
  // 端末に覚えた相手のキー（前の形のまま）を、新しい形（遊び方＋強さ）に読み替える。読めなければ初期値（rules.opponent_default。CPU と＋とても弱い）
  function readOpponent(D, stored) {
    const defKey = D.rules.opponent_default;
    // 端末に solo（ひとりで）を覚えていたら、読めない値と同じに扱う（CPU と＋とても弱い）。画面から選べなくなったため（KJ-056）
    const known = (k) => k === ROOM_OPPONENT.key || OPPONENTS.some((o) => o.key === k && o.key !== "solo");
    const key = known(stored) ? stored : known(defKey) ? defKey : "weak";
    const isPower = (k) => CPU_POWERS.some((o) => o.key === k);
    const power = isPower(key) ? key : isPower(defKey) ? defKey : "weak";
    return { key, mode: key === ROOM_OPPONENT.key ? "room" : "cpu", power };
  }
  // 遊び方＋強さ → 中で使う相手のキー
  const opponentKey = (mode, power) => (mode === "cpu" ? (CPU_POWERS.some((o) => o.key === power) ? power : "weak") : mode === "room" ? ROOM_OPPONENT.key : "weak");
  const ROOM_OPP_NAME = "相手";
  // チュートリアル（KJ-043）。相手の選びには出さない（はじめる前の「チュートリアル」ボタンと、はじめて「はじめる」を押したときだけ）
  const TUTORIAL_OPPONENT = { key: "tutorial", label: "チュートリアル" };
  // 時間切れのあと、相手の最後の点（end の行）を待つ秒数。届かなければ、最後に見えた相手の点で比べる（技術の値。遊びの数値ではない）
  const MATCH_END_GRACE_SEC = 5;
  // つなぎの技術の値（遊びの数値ではない。KJ-033 後半・R-059）
  const MATCH_INSERT_TIMEOUT_SEC = 8; // insert の返事を待つ秒数。過ぎたら「つながらない」（試合は止めない）
  const MATCH_PING_SEC = 8; // 相手に「まだいる」を送る間隔
  const MATCH_GONE_SEC = 25; // 相手の行がこの秒数届かなければ「相手の通信が切れた」と見せる（試合は時間どおり進む）
  const ROOM_LOBBY_TTL_SEC = 30 * 60; // 合言葉が効く長さ（作ってからこの秒数まで）
  // 試合ごとに一意の match_id（"m-" ＋ 英数字 16）。合言葉（4けた）は使い回すので、match_id は合言葉と別に作る
  function newMatchId(rand) {
    const r = rand || Math.random, a = "0123456789abcdefghijklmnopqrstuvwxyz";
    let s = "m-";
    for (let i = 0; i < 16; i++) s += a[Math.floor(r() * 36) % 36];
    return s;
  }
  const MATCH_ID_RE = /^m-[0-9a-z]{16}$/;
  // 合言葉：数字4けた（1000〜9999。頭の 0 で迷わないように）
  const newRoomCode = (rand) => String(1000 + (Math.floor((rand || Math.random)() * 9000) % 9000));
  const ROOM_CODE_RE = /^[0-9]{4}$/;
  const roomLobbyId = (code) => "room-" + code; // 合言葉の行の match_id（kind "join"・key＝本当の match_id）

  // ---------- 遊び ----------
  // env: { now: () => 秒, rand: () => 0..1, date: () => Date }
  // 合言葉の部屋（KJ-033）：env.match = { id: match_id, role: "host"|"guest", startAt: 始まりの時刻（now と同じ秒の目盛り。'start' 行の created_at から） }
  //   相手は人（この端末では点と手札の枚数だけ見える。g.cpu の欄に入れる）。場は試合の種から作る「場の列」で、取られていない番号の小さい field_size 枚。
  //   手札・引き直しは自分の種から配る（取り合わない）。先着（場の札・言葉・勝ち）は createMatchClient が表 kj_claims の主キーで決める
  function createGame(D, T, env) {
    env = env || {};
    const M = env.match && env.match.id && ROLES.includes(env.match.role) ? env.match : null;
    const now = env.now || (() => Date.now() / 1000);
    const rand = env.rand || (M ? matchRand(M.id, M.role) : Math.random);
    const R = D.rules;
    let uid = 0;
    const TUT = env.tutorial && !M ? env.tutorial : null; // チュートリアル（KJ-043）：決まった手札・ストック・場。時間なし・CPU なし
    const opponent = M ? ROOM_OPPONENT.key : TUT ? TUTORIAL_OPPONENT.key : OPPONENTS.some((o) => o.key === env.opponent) ? env.opponent : R.opponent_default;
    const g = { D, T, level: T.level, opponent, solo: opponent === "solo" || !!TUT, tutorial: !!TUT, log: [], events: [], used: new Set(), over: false, winner: null,
      startedAt: (env.date || (() => new Date()))() };
    // 使えない語か：放った言葉、または 数＋助数詞 でその助数詞がもう使われている（KJ-022）。CPU・ヒント・動けない の語えらびはこれで見る
    let ucN = -1, ucS = new Set();
    g.isUsed = (w) => {
      if (g.used.has(w)) return true;
      const p = counterParts(T, w);
      if (!p) return false;
      if (g.used.size !== ucN) { ucN = g.used.size; ucS = usedCounters(T, g.used); }
      return ucS.has(p.counter);
    };
    g.timeLimit = normTime(D, env.timeLimit); // 制限時間（秒。KJ-007）
    g.match = M ? { id: M.id, role: M.role, oppRole: M.role === "host" ? "guest" : "host" } : null;
    g.hold = false; // 合言葉の部屋：先着の返事を待っているあいだ、自分の手を止める（createMatchClient が立てる）
    g.closed = false; // 合言葉の部屋：時間切れで点を送ったあと（相手の点を待つあいだ）。もう手を打てない
    const t0 = M && typeof M.startAt === "number" ? M.startAt : now();
    g.now = now;
    // はじめの1枚（KJ-013）は KJ-016 でやめた（作者 2026-11-21 20:14）。はじめたらすぐ時間が動く
    g.elapsed = () => now() - t0;
    g.endsAt = t0 + g.timeLimit;
    g.timeLeft = () => Math.max(0, g.endsAt - now());
    // ログの秒は制限時間を超えない（画面が裏に回って時計が止まり、戻ったときに終わっても。KJ-036）
    const logT = () => Math.min(g.elapsed(), g.timeLimit);

    const card = (c, fresh) => ({ id: ++uid, c, t: now(), fresh: !!fresh });
    function shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
    // 山（と、合言葉の部屋の場の列）の字の数：どの字も same_char_in_deck 枚。小1 のときだけ、基本の字（R.g1.extra_chars。くっつける相手の多い字。KJ-067・D-085）は R.g1.extra_count 枚
    const extraSet = T.level === "G1" && R.g1 && R.g1.extra_chars ? new Set(R.g1.extra_chars) : null;
    // N5・N4 は今のまま（並びも変えない）。小1 は、基本の字を extra_count 枚になるまで足す
    const fullSet = () => {
      const out = [];
      for (let i = 0; i < R.same_char_in_deck; i++) out.push(...T.CHARS);
      if (extraSet) for (const c of extraSet) if (T.CHARS.has(c)) for (let i = R.same_char_in_deck; i < (R.g1.extra_count || 0); i++) out.push(c);
      return out;
    };
    g.deck = shuffle(fullSet());
    function draw(n) {
      const out = [];
      for (let i = 0; i < n; i++) {
        if (!g.deck.length) g.deck.push(...shuffle(fullSet())); // 山が尽きたら足す
        out.push(g.deck.shift());
      }
      return out;
    }
    function player(key, name, n) {
      return { key, name, cards: draw(n).map((c) => card(c)), cd: { invert: 0, cycle: 0, homophone: 0 },
        score: 0, takes: 0, redraws: 0, lastSpecial: null, pendingFx: [], stuck: false };
    }
    g.me = player("me", "あなた", R.start_hand);
    if (M) {
      // 相手は人。札はこの端末に無い（枚数だけ。相手が送る 'event' で更新）。山からも引かない
      g.cpu = { key: "cpu", name: ROOM_OPP_NAME, cards: [], remote: true, hand: R.start_hand, count: R.start_hand + (env.startStock !== false ? R.start_stock_parts || 0 : 0),
        cd: { invert: 0, cycle: 0, homophone: 0 }, score: 0, takes: 0, redraws: 0, lastSpecial: null, pendingFx: [], stuck: false };
    } else {
      g.cpu = player("cpu", "CPU", g.solo ? 0 : R.start_hand); // ひとりで：CPU は出さない（山からも引かない）
    }
    const players = () => (g.solo || M ? [g.me] : [g.me, g.cpu]); // この端末が動かす人（相手が人なら自分だけ）
    const nCards = (p) => (p.remote ? p.count : p.cards.length);
    // 手札の枠（上の8マス）と、ストック（下の4マス。KJ-004 の部品の置き場を、作者 2026-11-21、KJ-006 のあとに字も部品も置ける場所に）。札の tray が true ならストック
    // 台（机）は並べて見る場所（作者 2026-11-21 20:18「台は並べて見る場所にします」。KJ-016・D-034）。台に出した札は、出す前にいた段にいるままで、枚数にも数える
    const handCount = (p) => p.cards.filter((x) => !x.tray).length;
    const trayCount = (p) => p.cards.filter((x) => x.tray).length;
    const counted = (p) => handCount(p) + trayCount(p);
    const totalMax = R.hand_max + R.split_extra;
    // 札 srcs を n 枚に替えたあと、段に収まるか
    const fits = (p, srcs, n) => counted(p) - srcs.length + n <= totalMax;
    // 放ったら、放った字数ぶんを場から取りきるまで、ほかの手は何もできない（KJ-039・D-053）。取れる枚数はためられない
    const locked = (p) => p.takes > 0;
    const LOCK_WHY = "場から取りきるまで動けない";
    g.locked = locked;
    g.canTakeMore = (p) => counted(p) < totalMax; // 上の段・ストックを合わせた16マスに空きがあるか
    // 場から取った札は、上の段に空きがあれば上、無ければストックへ（割る・くっつけると同じ）
    const settle = (p, x) => { if (handCount(p) >= R.hand_max) x.tray = true; p.cards.push(x); return x; };
    g.handCount = handCount;
    g.trayCount = trayCount;
    g.fits = (p, ids, n) => fits(p, ids.map((id) => g.byId(p, id)).filter(Boolean), n); // 札 ids を n 枚に替えられる空きがあるか
    // 場：CPU 戦は山から field_size 枚。合言葉の部屋は「場の列」の、まだ取られていない番号の小さい field_size 枚（二人で同じに見える）
    if (M) {
      const fieldRand = matchRand(M.id, "field");
      const seq = [], cardsAt = new Map();
      g.taken = new Map(); // 番号 → "me"／"opp"（取った人）
      g.fieldAt = (n) => { // 場の列の n 番目の字（0 から）
        while (seq.length <= n) {
          const a = fullSet();
          for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(fieldRand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
          seq.push(...a);
        }
        return seq[n];
      };
      g.fieldCardAt = (n) => { if (!cardsAt.has(n)) { const x = card(g.fieldAt(n), n >= R.field_size); x.n = n; cardsAt.set(n, x); } return cardsAt.get(n); };
      g.refreshField = () => {
        const out = [];
        for (let n = 0; out.length < R.field_size; n++) if (!g.taken.has(n)) out.push(g.fieldCardAt(n));
        g.field = out;
      };
      g.refreshField();
    } else {
      g.field = draw(R.field_size).map((c) => card(c));
    }
    // 下のストックに、使いやすい部品を1枚入れて始める（KJ-013。部品表で行き先が多い部品の上位から無作為に1枚）
    g.stockCandidates = stockCandidates(T, R.start_stock_top || 5);
    if (env.startStock !== false && (R.start_stock_parts || 0) > 0 && g.stockCandidates.length) {
      for (const p of players()) {
        for (let i = 0; i < R.start_stock_parts; i++) {
          const c = g.stockCandidates[Math.floor(rand() * g.stockCandidates.length)].c;
          const x = card(c); x.tray = true; p.cards.push(x);
        }
      }
    }
    if (TUT) {
      // チュートリアル：手札・ストック・場・補充を決まったものに（data/tutorial.json）。ストックの部品は入れない
      g.me.cards = [...TUT.hand.map((c) => card(c)), ...TUT.stock.map((c) => { const x = card(c); x.tray = true; return x; })];
      g.field = TUT.field.map((c) => card(c));
      g.deck = TUT.refill.slice();
    }
    g.opp = (p) => (p === g.me ? g.cpu : g.me);
    g.byId = (p, id) => p.cards.find((x) => x.id === id);
    g.ready = (p, k) => now() >= p.cd[k];
    g.cdLeft = (p, k) => Math.max(0, p.cd[k] - now());
    // 引き直し（KJ-049）：その人がその試合で何回目かで値段が決まる（R.redraw.costs の並び）。回数は redraws
    g.redrawsLeft = (p) => Math.max(0, R.redraw.costs.length - p.redraws);
    g.redrawCost = (p) => (g.redrawsLeft(p) > 0 ? R.redraw.costs[p.redraws] : null); // 次の値段。もう引き直せないなら null
    // 待ち時間のゲージ（KJ-034）：0＝使った直後（空）〜1＝満ちた（押せる）。待っていなければ 1
    const frac = (left, total) => (total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) : 1);
    g.cdFrac = (p, k) => frac(g.cdLeft(p, k), R.cooldown_sec[k]);
    const useCd = (p, k) => { p.cd[k] = now() + R.cooldown_sec[k]; };

    const QUIET = new Set(["はじまり", "ためした", "ヒント", "終わり", "動けない", "動ける", "入れ替え", "移す", "段", "とばす"]);
    // 小1 の見逃しの光り（KJ-067）：人が最後に手をした時刻。ヒント・動けない・終わりなど、手でないログは数えない
    const NOT_MOVE = new Set(["はじめ", "はじまり", "ヒント", "終わり", "動けない", "動ける"]);
    let idleFrom = t0;
    let timedFrom = t0; // 時限ヒント（KJ-086）：人が最後に放った・引き直した・ヒントが出た時刻（はじめは試合のはじめ）
    function addLog(who, op, from, to, pts, note) {
      if (who === g.me.name && !NOT_MOVE.has(op)) idleFrom = now();
      if (who === g.me.name && (op === "放つ" || op === "引き直し" || op === "ヒント")) timedFrom = now();
      g.log.push({ t: logT(), who, op, from: from || [], to: to || [], pts: pts || 0,
        meScore: g.me.score, cpuScore: g.cpu.score, me: nCards(g.me), cpu: nCards(g.cpu), note: note || "" });
      if (!QUIET.has(op)) checkStuck();
    }
    g.addLog = addLog;

    // ---------- 動けない（R-023 を KJ-003 に合わせた） ----------
    // 手札をそのまま並べて放てる言葉（辞書の2字以上の語、放っていないもの）が1つも無い状態（KJ-008：1字は数えない）
    g.releasableInHand = (p) => {
      const cs = p.cards.map((x) => kanaOf(T, x.c)); // ノ・儿・ナ はかなとして数える（KJ-053）
      const have = {};
      for (const c of cs) have[c] = (have[c] || 0) + 1;
      for (const w of T.WORDS.values()) {
        if ([...w.w].length < 2 || g.isUsed(w.w)) continue;
        const need = {};
        let ok = true;
        for (const c of w.w) { need[c] = (need[c] || 0) + 1; if (!have[c] || need[c] > have[c]) { ok = false; break; } }
        if (ok) return w.w;
      }
      // 辞書に無い 数＋助数詞（十円 など。KJ-022）も放てる言葉
      for (const n of T.COUNTER_NUMS) for (const c of T.COUNTERS) {
        const w = n + c;
        if (g.isUsed(w)) continue;
        const need = {};
        let ok = true;
        for (const ch of w) { need[ch] = (need[ch] || 0) + 1; if (!have[ch] || need[ch] > have[ch]) { ok = false; break; } }
        if (ok) return w;
      }
      return null;
    };
    // 放つ以外で使える手（待ち時間は残りの秒数を添える）
    g.movesInHand = (p) => {
      const cs = p.cards.map((x) => x.c);
      const out = [];
      if (cs.some((c) => canSplit(T, c)) && counted(p) < totalMax) out.push("割る");
      if (p.cards.some((a) => p.cards.some((b) => a !== b && joinResults(T, a.c, b.c).length))) out.push("くっつける");
      for (const [name, k, ok] of [["反転", "invert", (c) => T.INV.has(c)], ["巡り", "cycle", (c) => T.NEXT.has(c)], ["同音", "homophone", (c) => T.HOMO.has(c)]]) {
        if (!cs.some(ok)) continue;
        const left = g.cdLeft(p, k);
        out.push(left > 0 ? `${name}（待ち ${Math.ceil(left)}秒）` : name);
      }
      if (g.redrawsLeft(p) > 0) out.push(`引き直し（${g.redrawCost(p)}点）`);
      return out;
    };
    function checkStuck() {
      if (!g.me || !g.cpu || g.over || g.tutorial) return; // チュートリアルでは「動けない」を数えない
      for (const p of players()) {
        const w = g.releasableInHand(p);
        if (!w && !p.stuck) {
          p.stuck = true;
          g.log.push({ t: logT(), who: p.name, op: "動けない", from: p.cards.map((x) => x.c), to: [], pts: 0,
            meScore: g.me.score, cpuScore: g.cpu.score, me: nCards(g.me), cpu: nCards(g.cpu),
            note: "放てる言葉なし。使える手：" + g.movesInHand(p).join("・") });
        } else if (w && p.stuck) {
          p.stuck = false;
          g.log.push({ t: logT(), who: p.name, op: "動ける", from: p.cards.map((x) => x.c), to: [], pts: 0,
            meScore: g.me.score, cpuScore: g.cpu.score, me: nCards(g.me), cpu: nCards(g.cpu), note: "放てる言葉：" + w });
        }
      }
    }
    const hs = (p) => p.cards.filter((x) => !x.tray).map((x) => x.c).join("") + (trayCount(p) ? `（ストック ${p.cards.filter((x) => x.tray).map((x) => x.c).join("")}）` : "");
    addLog("—", "はじめ", [], [], 0,
      `手札 ${hs(g.me)} / ${M ? "（相手の手札は見えない）" : hs(g.cpu)}・場 ${g.field.map((x) => x.c).join("")}`);

    function cardsOf(p, ids) {
      if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return null;
      const cs = ids.map((id) => g.byId(p, id));
      return cs.every(Boolean) ? cs : null;
    }
    // 1枚に効く操作のあとの選び（KJ-054・D-070）：最後に選んだ札の位置に、できた札がそのまま入る。前に選んでいた札の選びと順番は残る
    const selAfter = (ids, nc) => ids.slice(0, -1).concat(nc.map((x) => x.id));
    function replaceCards(p, ids, chars) { // ids の位置に chars を入れる
      const pos = p.cards.findIndex((x) => x.id === ids[0]);
      p.cards = p.cards.filter((x) => !ids.includes(x.id));
      const nc = chars.map((c) => card(c));
      // できた札は、手札に空きがあれば手札へ。なければストックへ（R-032・R-042。字も部品も）
      let room = R.hand_max - handCount(p);
      for (const x of nc) { if (room > 0) room--; else x.tray = true; }
      p.cards.splice(Math.max(0, pos), 0, ...nc);
      return nc;
    }
    const fail = (why) => ({ ok: false, why });
    const live = () => !g.over && !g.hold && !g.closed;

    // ---------- ヒント（KJ-037・D-052）：人が続けて3回はじかれたら、自動で札と操作のボタンを光らせる ----------
    // 数える＝自分の「ためした」（g.tried）。放つ・割る・くっつける・反転・巡り・同音が通ったら数え直し。ヒントを出したら数え直し。
    // 言葉は文字で出さない（光る札・ボタンだけ。狙った言葉はログにだけ書く）。CPU は関係しない
    const HINT_OPS = [["割る", "split", "bSplit"], ["反転", "invert", "bInvert"], ["巡り", "cycle", "bCycle"], ["同音", "homophone", "bHomo"]];
    const HR = R.hint || { fail_streak: 0, timed_sec: 90, glow_sec: 10 };
    g.hintStreak = 0;
    g.hintCount = 0;
    g.hinted = []; // KJ-082：その試合で人に出たヒントの「狙った言葉」（出た順。CPU・チュートリアルは入れない）。終わりの「見逃した言葉」に使う
    g.hint = null; // { tier: 1|2|3, ids: [光らせる札の id], button: ボタンの id（段1は無し）, op, word, until }
    // KJ-065：ヒントは glow_sec（10秒）のあいだ、ほかの手をしても残る。消えるのは、10秒たったとき・光らせた言葉が使われたとき（自分が放った・CPU や相手が先に放った）・光らせた札が手札から無くなったとき（1枚でも）
    g.hintActive = () => {
      const h = g.hint;
      if (!h || g.over || now() >= h.until) return null;
      if (h.word && g.isUsed(h.word)) return null;
      if (h.ids.some((id) => !g.byId(g.me, id))) return null; // 光らせた札が1枚でも手札から無くなったら（操作で替わった・放った）消える
      if (h.tier === 3 && g.me.redraws !== h.redraws) return null; // 引き直しを使ったら消える
      return h;
    };
    g.clearHint = () => { g.hint = null; };
    const solved = (p) => { if (p === g.me) g.hintStreak = 0; }; // 通った：数え直す（光りは消さない。KJ-065）
    const countOf = (chs) => { const m = new Map(); for (const c of chs) m.set(c, (m.get(c) || 0) + 1); return m; };
    const fitsIn = (word, have) => { // word の字が have（字→枚数）に収まるか
      const need = new Map();
      for (const c of word) { const n = (need.get(c) || 0) + 1; need.set(c, n); if ((have.get(c) || 0) < n) return false; }
      return true;
    };
    // 語の候補（よく使う語を先に。放てない語・放った語は除く）
    const hintWords = () => {
      const seen = new Set(), out = [];
      for (const w of T.COMMON_WORDS) { if (!seen.has(w.w)) { seen.add(w.w); out.push(w.w); } }
      for (const w of T.WORDS.values()) { if (!seen.has(w.w)) { seen.add(w.w); out.push(w.w); } }
      for (const n of T.COUNTER_NUMS) for (const c of T.COUNTERS) { if (!seen.has(n + c)) { seen.add(n + c); out.push(n + c); } } // 辞書に無い 数＋助数詞（KJ-022）も狙える
      // KJ-061（D-078）：字数の多い語を先に（4字＞3字＞2字）。同じ字数の中ではよく使う語（上で先に並べた順）のまま（安定ソート）
      return out.filter((w) => [...w].length >= 2 && !g.isUsed(w)).sort((a, b) => [...b].length - [...a].length);
    };
    // 札（pool）から word の字ぶんを順に選ぶ（手札を先に）。選べなければ null
    const pickFrom = (pool, word) => {
      const left = pool.slice(), ids = [];
      for (const c of word) { const i = left.findIndex((x) => kanaOf(T, x.c) === c); if (i < 0) return null; ids.push(left[i].id); left.splice(i, 1); }
      return ids;
    };
    const makeHint = (p) => {
      const cards = p.cards.slice().sort((a, b) => (a.tray ? 1 : 0) - (b.tray ? 1 : 0)); // 手札（上の段）を先に
      const words = hintWords();
      const have = countOf(cards.map((x) => kanaOf(T, x.c))); // ノ・儿・ナ はかな（KJ-053）
      // 段1：いま並べれば放てる
      for (const w of words) {
        if (!fitsIn(w, have)) continue;
        const ids = pickFrom(cards, w);
        if (ids) return { tier: 1, ids, button: null, op: "放つ", word: w };
      }
      // 段2：1手（割る・反転・巡り・同音）で放てる言葉になる。字数（多い順）→ よく使う語 → まだ使っていない操作 → 語の順（KJ-061）
      const usedOps = new Set(g.log.filter((e) => e.who === p.name).map((e) => e.op));
      const commonSet = new Set(T.COMMON_WORDS.map((x) => x.w));
      let best = null;
      for (const [opName, k, btn] of HINT_OPS) {
        if (k !== "split" && !g.ready(p, k)) continue;
        const seenChars = new Set();
        for (const x of cards) {
          if (seenChars.has(x.c)) continue;
          seenChars.add(x.c);
          let outs = [];
          if (k === "split") { if (canSplit(T, x.c) && fits(p, [x], splitOnce(T, x.c).length)) outs = [splitOnce(T, x.c)]; }
          else if (k === "invert") { if (T.INV.has(x.c) && fits(p, [x], 1)) outs = [[T.INV.get(x.c)]]; }
          else if (k === "cycle") { if (T.NEXT.has(x.c) && fits(p, [x], 1)) outs = [[T.NEXT.get(x.c)]]; }
          else if (fits(p, [x], 1)) outs = homoChars(T, x.c).map((c) => [c]);
          for (const out of outs) {
            const rest = cards.filter((y) => y !== x);
            const after = countOf(rest.map((y) => y.c).concat(out).map((c) => kanaOf(T, c)));
            for (let wi = 0; wi < words.length; wi++) {
              const w = words[wi];
              if (!fitsIn(w, after)) continue;
              // 光らせる札：操作する札＋言葉に使う残りの札（できる字のぶんは、操作したあとに出る）
              const virtual = rest.concat(out.map((c, i) => ({ id: -1 - i, c })));
              const ids = pickFrom(virtual, w);
              if (!ids) continue;
              const lit = [x.id, ...ids.filter((id) => id >= 0)];
              const rank = [-[...w].length, commonSet.has(w) ? 0 : 1, usedOps.has(opName) ? 1 : 0, wi]; // 字数の多い語 → よく使う語（追記 P-061）→ まだ使っていない操作 → 語の順（KJ-061）
              let better = !best;
              for (let i = 0; !better && i < rank.length && rank[i] <= best.rank[i]; i++) if (rank[i] < best.rank[i]) better = true; // 辞書順で小さければ入れ替え
              if (better) {
                best = { tier: 2, ids: lit, button: btn, op: opName, word: w, rank };
              }
              break; // この操作・この札の最初の語（よく使う語が先）
            }
          }
        }
      }
      if (best) return best;
      // 段3：引き直し
      if (g.redrawsLeft(p) > 0) return { tier: 3, ids: [], button: "bRedraw", op: "引き直し", word: "" };
      return { tier: 3, ids: [], button: null, op: "引き直し（使いきった）", word: "" };
    };
    // 続けてはじかれたヒント（KJ-037）は KJ-086 で止めた（fail_streak 0 のときは出ない。仕組みは残す）
    const maybeHint = (p) => {
      if (g.tutorial || !HR.fail_streak || g.hintStreak < HR.fail_streak) return; // チュートリアルは自分の光りを出す（createTutorial）。自動のヒントは出さない
      g.hintStreak = 0; // ヒントを出したら数え直し
      timedFrom = now();
      const h = makeHint(p);
      g.hint = h.ids.length || h.button ? { ...h, until: now() + HR.glow_sec, redraws: p.redraws } : null; // 光らせる物が無いとき（引き直しを使いきった）は、札も出さない
      g.hintCount++;
      if (h.word) g.hinted.push(h.word);
      const lit = h.ids.map((id) => g.byId(p, id)).filter(Boolean).map((x) => x.c);
      addLog(p.name, "ヒント", lit, [], 0, `段${h.tier}：${h.op}${h.word ? `。狙った言葉：${h.word}（${[...h.word].length}字）` : ""}`);
    };

    // 時限ヒント（KJ-086）：人が最後に放ってから（試合のはじめからも）hint.timed_sec 秒たったら、ヒントを出す（0 なら出さない）。
    // 数え直し＝人が放ったとき・引き直したとき・ヒントを出したとき（addLog ほか）。割る・くっつける・はじかれる・札を動かすでは数え直さない。
    // 場から取っている間は数えない（取り終えてから数え始める）。チュートリアル・時間切れのあとも数えない。光り方・段・狙う語は、はじかれ続けたヒントと同じ
    g.timedHint = () => {
      const sec = HR.timed_sec;
      if (!sec || g.tutorial || !live()) return false;
      if (locked(g.me)) { timedFrom = now(); return false; } // 取っている間は数えない
      if (now() - timedFrom < sec) return false;
      timedFrom = now(); // ヒントを出したら（光らせる物が無くても、すでに光っていても）数え直す
      if (g.hintActive()) return false; // ほかのヒント（小1 の見逃し）が光っているあいだは重ねない
      const p = g.me, h = makeHint(p);
      g.hint = h.ids.length || h.button ? { ...h, until: now() + HR.glow_sec, redraws: p.redraws } : null;
      g.hintCount++;
      if (h.word) g.hinted.push(h.word);
      const lit = h.ids.map((id) => g.byId(p, id)).filter(Boolean).map((x) => x.c);
      addLog(p.name, "ヒント", lit, [], 0, `放たない${sec}秒。段${h.tier}：${h.op}${h.word ? `。狙った言葉：${h.word}（${[...h.word].length}字）` : ""}`);
      return true;
    };

    // 小1 の見逃しの光り（KJ-067・D-085）：手札に放てる言葉があるのに、人が g1.idle_hint_sec（30秒）なにも手をしなかったら、その言葉の札を光らせる。
    // 光り方・消え方・狙う語の選び方は、はじかれ続けたときのヒント（段1）と同じ。小1 のときだけ。光らせたら（光らせなくても）数え直す。続けてはじかれたヒントは今のまま
    g.idleHint = () => {
      const sec = R.g1 && R.g1.idle_hint_sec;
      if (!sec || g.level !== "G1" || g.tutorial || !live() || locked(g.me) || now() - idleFrom < sec) return false;
      idleFrom = now();
      if (g.hintActive()) return false;
      const h = makeHint(g.me);
      if (h.tier !== 1) return false; // 手札で放てる言葉があるときだけ（1手で放てる段2・引き直しの段3は、見逃しでは光らせない）
      g.hint = { ...h, until: now() + HR.glow_sec, redraws: g.me.redraws };
      g.hintCount++;
      if (h.word) g.hinted.push(h.word);
      const lit = h.ids.map((id) => g.byId(g.me, id)).filter(Boolean).map((x) => x.c);
      addLog(g.me.name, "ヒント", lit, [], 0, `見逃し${sec}秒。段1：放つ。狙った言葉：${h.word}（${[...h.word].length}字）`);
      return true;
    };

    g.split = (p, ids) => {
      const cs = cardsOf(p, ids);
      if (live() && locked(p)) return fail(LOCK_WHY);
      if (!live() || !cs) return fail("1枚だけ");
      const t = cs[cs.length - 1]; // 2枚以上選んでいるときは、最後に選んだ札を割る（KJ-054・D-070）
      const c = t.c;
      if (!canSplit(T, c)) return fail("割れない");
      const parts = splitOnce(T, c);
      if (!fits(p, [t], parts.length)) return fail("手札もストックもいっぱい");
      const nc = replaceCards(p, [t.id], parts);
      addLog(p.name, "割る", [c], nc.map((x) => x.c));
      solved(p);
      return { ok: true, cards: nc, sel: selAfter(ids, nc) };
    };
    g.join = (p, ids, choice) => {
      const cs = cardsOf(p, ids);
      if (live() && locked(p)) return fail(LOCK_WHY);
      if (!live() || !cs || cs.length !== 2) return fail("2枚だけ");
      const rs = joinResults(T, cs[0].c, cs[1].c);
      if (!rs.length) return fail(joinReversed(T, cs[0].c, cs[1].c) ? "並べる順が逆" : "くっつかない");
      const to = choice === undefined ? rs[0] : choice;
      if (!rs.includes(to)) return fail("その字にはならない");
      if (!fits(p, cs, 1)) return fail("手札もストックもいっぱい");
      const nc = replaceCards(p, ids, [to]);
      addLog(p.name, "くっつける", cs.map((x) => x.c), [to]);
      solved(p);
      return { ok: true, cards: nc };
    };
    // 引きずってくっつける（KJ-017・D-035）：札 dragId を札 targetId の面 face に落とす。できた札は相手の札の並びの位置に入る（手札に空きがあれば手札。R-032 と同じ）。
    // 字にならない面ではくっつけない（画面はそのとき入れ替え・移すにする）。段が埋まっていて行き先が無ければくっつけない
    g.joinFace = (p, dragId, targetId, face, choice) => {
      const cs = cardsOf(p, [dragId, targetId]);
      if (live() && locked(p)) return fail(LOCK_WHY);
      if (!live() || !cs) return fail("2枚だけ");
      const rs = faceResults(T, face, cs[0].c, cs[1].c);
      if (!rs.length) return fail("その面ではくっつかない");
      const to = choice === undefined ? rs[0] : choice;
      if (!rs.includes(to)) return fail("その字にはならない");
      if (!fits(p, cs, 1)) return fail("手札もストックもいっぱい");
      p.cards = p.cards.filter((x) => x !== cs[0]); // 先に引きずった札を抜き、相手の札の位置に入れる（段の行き先は割る・くっつけると同じ：手札に空きがあれば手札）
      const nc = replaceCards(p, [targetId], [to]);
      addLog(p.name, "くっつける", T.parts[to].slice(), [to], 0, `引きずって${FACE_LABEL[face]}の面に`);
      solved(p);
      return { ok: true, cards: nc };
    };
    function oneStep(op, k, map) {
      return (p, ids) => {
        const cs = cardsOf(p, ids);
        if (live() && locked(p)) return fail(LOCK_WHY);
        if (!live() || !cs) return fail("1枚だけ");
        const t = cs[cs.length - 1]; // 2枚以上選んでいるときは、最後に選んだ札に効く（KJ-054。仮決め）
        const c = t.c;
        if (!map.has(c)) return fail("できない字");
        if (!g.ready(p, k)) return fail("待ち時間");
        if (!fits(p, [t], 1)) return fail("手札もストックもいっぱい");
        useCd(p, k);
        const nc = replaceCards(p, [t.id], [map.get(c)]);
        addLog(p.name, op, [c], [nc[0].c]);
        solved(p);
        return { ok: true, cards: nc, sel: selAfter(ids, nc) };
      };
    }
    g.invert = oneStep("反転", "invert", T.INV);
    g.cycle = oneStep("巡り", "cycle", T.NEXT);
    g.homophone = (p, ids, to) => {
      const cs = cardsOf(p, ids);
      if (live() && locked(p)) return fail(LOCK_WHY);
      if (!live() || !cs) return fail("1枚だけ");
      const t = cs[cs.length - 1]; // 2枚以上選んでいるときは、最後に選んだ札に効く（KJ-054。仮決め）
      const c = t.c;
      const homo = homoChars(T, c);
      if (!homo.includes(to)) return fail(homo.length ? "同じ読みではない" : "同じ読みの字がない"); // 同じ読みの字が1つも無いときは「ない」（KJ-069）。行き先が違うときは「ではない」
      if (!g.ready(p, "homophone")) return fail("待ち時間");
      if (!fits(p, [t], 1)) return fail("手札もストックもいっぱい");
      useCd(p, "homophone");
      const nc = replaceCards(p, [t.id], [to]);
      addLog(p.name, "同音", [c], [to]);
      solved(p);
      return { ok: true, cards: nc, sel: selAfter(ids, nc) };
    };

    // ---------- 放つ（D-017） ----------
    // 放てるか（放つ前の確かめ。合言葉の部屋では、このあと言葉の先着を確かめてから release）
    g.canRelease = (p, ids) => {
      if (g.hold && !g.over) return fail("通信中");
      const cs = cardsOf(p, ids);
      if (live() && locked(p)) return fail(LOCK_WHY);
      if (!live() || !cs) return fail("札がない");
      const text = kanaText(T, cs.map((x) => x.c)); // 言葉の書き方（天ノ川 → 天の川。KJ-053）。放った言葉・ログ・先着の鍵はこの書き方
      const r = releasable(T, g.used, text, { skipCounter: releasing }); // 部屋：言葉の先着に勝ったあとは、助数詞の縛りを見直さない（相手の行が先に届いていても、勝った言葉は通す。二人の点・表示を食い違わせない。R-102）
      if (!r.ok) return fail(r.why);
      return { ok: true, text, pts: scoreOf(D, T, text).pts };
    };
    const oppWords = new Set();
    if (M) {
      // 相手が言葉を放った（相手の 'word' 行が届いた）。二人とももう使えない。相手の点はその行の点で見せる（いまの CPU と同じ見せ方）
      g.remoteRelease = (text, pts, score) => {
        if (oppWords.has(text)) return false; // 同じ行が二度届いた
        oppWords.add(text);
        g.used.add(text);
        if (typeof score === "number") g.cpu.score = score; else g.cpu.score += pts || 0;
        const n = [...text].length;
        if (!g.over) addLog(g.cpu.name, "放つ", [...text], [], pts || 0, `${scoreOf(D, T, text).how}。場から${n * R.take_per_char}枚取れる`);
        g.events.push({ type: "release", who: g.cpu.name, text, pts: pts || 0 });
        return true;
      };
      // 言葉の先着で負けた（相手が先に放った）。点は入らない。札は手元に残る
      g.lostWord = (p, text) => {
        g.used.add(text);
        if (!g.over) addLog(p.name, "ためした", [...text], [], 0, "相手が先に放った");
      };
      // 相手の点・手札の枚数（相手の 'event' 行）
      g.remoteState = (st) => {
        let ch = false;
        if (st && typeof st.score === "number" && st.score !== g.cpu.score) { g.cpu.score = st.score; ch = true; }
        if (st && typeof st.count === "number" && st.count !== g.cpu.count) { g.cpu.count = st.count; ch = true; }
        if (st && typeof st.hand === "number" && st.hand !== g.cpu.hand) { g.cpu.hand = st.hand; ch = true; } // 手札（上の段）の枚数。count はストックも含む
        return ch;
      };
    }
    let releasing = false; // 合言葉の部屋：言葉の先着を確かめたあとだけ release を通す
    g.release = (p, ids) => {
      if (M && !releasing) return fail("合言葉の部屋では先着を確かめて放つ");
      const pre = g.canRelease(p, ids);
      if (!pre.ok) return pre;
      const text = pre.text;
      const { pts, how } = scoreOf(D, T, text);
      const n = [...text].length;
      p.cards = p.cards.filter((x) => !ids.includes(x.id));
      g.used.add(text);
      p.score += pts;
      p.takes += n * R.take_per_char;
      addLog(p.name, "放つ", [...text], [], pts, `${how}。場から${n * R.take_per_char}枚取れる`);
      // 特別な語・つながる相手（D-015）。演出だけ
      const prev = p.lastSpecial && T.SPECIAL.get(p.lastSpecial);
      if (prev && prev.next.includes(text)) g.events.push({ type: "fx", who: p.name, text: p.lastSpecial + text });
      else if (T.SPECIAL.has(text)) g.events.push({ type: "fx", who: p.name, text });
      else if (T.FX_WORDS.has(text)) { const f = T.FX_WORDS.get(text); g.events.push({ type: "fx", who: p.name, text, together: !!f.together, tone: f.tone || null }); } // 演出だけ（点は scoreOf のまま）
      p.lastSpecial = T.SPECIAL.has(text) ? text : null;
      const ef = T.EFFECTS.get(text);
      if (ef && ef.target === "self") p.pendingFx.push({ text, op: ef.op }); // 自分の札に効く語：場から取り終わったあとに効く（runPendingFx）
      else if (ef) hitOpponent(p, text, ef); // 相手の札に効く語：放った瞬間に効く（放った側が場から取る前。KJ-080）
      solved(p);
      g.events.push({ type: "release", who: p.name, text, pts });
      checkOver();
      return { ok: true, text, pts };
    };

    // ---------- 放つと効く語（KJ-080・D-099）：相手の上の段の札に効く。放った瞬間に（放った側が場から取る前に）。待ち時間はかけない・使わない ----------
    // 効く札は、相手の上の段（ストックは含めない）のうち、その操作が効く札から無作為。足りなければ効くぶんだけ・1枚も無ければ空振り。
    // ひとりで・合言葉の部屋（相手の札がこの端末に無い）では何も起きない（イベントも出さない）。ログ：効かされた側の行（手は 割る・巡り・反転・くっつける・同音。メモに「CPU の 切る で」）
    function hitOpponent(p, text, ef) {
      const v = p === g.me ? g.cpu : g.me;
      if (g.solo || M || v.remote) return;
      const upper = () => v.cards.filter((x) => !x.tray);
      const note = `${p === g.me ? "あなた" : p.name} の ${text} で`;
      const hits = [], ids = []; // ids＝効いた札の新しい id（hits と同じ順。画面の演出が札を見つけるため。KJ-081）
      const one = (x, op, to) => { const nc = replaceCards(v, [x.id], to); addLog(v.name, op, [x.c], nc.map((y) => y.c), 0, note); hits.push({ from: [x.c], to: nc.map((y) => y.c) }); ids.push(nc.map((y) => y.id)); };
      if (ef.op === "join") {
        // 2枚を1枚に。ef.n 組（"max" はできるだけ多く。1枚は1つの組にしか使わない。組の選びは無作為）
        const cs = upper(), N = cs.length, pairs = [];
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j && joinResults(T, cs[i].c, cs[j].c).length) pairs.push([i, j]);
        const memo = new Map();
        const best = (used) => { // 残りの札で作れる組の数の最大
          if (memo.has(used)) return memo.get(used);
          let b = 0;
          for (const [i, j] of pairs) if (!(used >> i & 1) && !(used >> j & 1)) b = Math.max(b, 1 + best(used | 1 << i | 1 << j));
          memo.set(used, b);
          return b;
        };
        let used = 0, left = ef.n === "max" ? Infinity : ef.n;
        const planned = [];
        while (left > 0) {
          const total = best(used);
          const opts = pairs.filter(([i, j]) => !(used >> i & 1) && !(used >> j & 1) && (ef.n !== "max" || 1 + best(used | 1 << i | 1 << j) === total));
          if (!opts.length) break;
          const [i, j] = pick(opts);
          used |= 1 << i | 1 << j; left--;
          planned.push([cs[i], cs[j]]);
        }
        for (const [a, b] of planned) {
          const to = pick(joinResults(T, a.c, b.c));
          const nc = replaceCards(v, [a.id, b.id], [to]);
          addLog(v.name, "くっつける", [a.c, b.c], [to], 0, note);
          hits.push({ from: [a.c, b.c], to: nc.map((y) => y.c) });
          ids.push(nc.map((y) => y.id));
        }
      } else {
        const ok = {
          split: (x) => canSplit(T, x.c) && fits(v, [x], splitOnce(T, x.c).length), // 割った部品が手札・ストックに収まらない札には効かない
          cycle: (x) => T.NEXT.has(x.c),
          invert: (x) => T.INV.has(x.c),
          homophone: (x) => homoChars(T, x.c).length > 0,
        }[ef.op];
        const pool = upper().filter(ok);
        for (let k = 0; k < ef.n && pool.length; k++) {
          const x = pool.splice(Math.floor(rand() * pool.length), 1)[0];
          if (ef.op === "split") one(x, "割る", splitOnce(T, x.c));
          else if (ef.op === "cycle") one(x, "巡り", [T.NEXT.get(x.c)]);
          else if (ef.op === "invert") one(x, "反転", [T.INV.get(x.c)]);
          else one(x, "同音", [pick(homoChars(T, x.c))]);
        }
      }
      g.events.push({ type: "effect", who: p.name, victim: v.name, text, op: ef.op, hit: hits.length > 0, hits, ids });
    }
    // ---------- 放つと効く語（KJ-079・D-098）：放った本人の札に効く。場から取り終わったあと（takes が 0 になったとき）に1回 ----------
    // split_own_random（自刃）：上の段の札のうち「割れる札」（割れる字で、割った部品が手札・ストックに収まるもの）から1枚を無作為に割る。割れる札が無ければ何も起きない。待ち時間はかけない
    function runPendingFx(p) {
      if (p.takes > 0 || !p.pendingFx.length) return;
      const list = p.pendingFx.splice(0);
      for (const f of list) {
        if (f.op !== "split") continue; // 自分の札に効く語は split（自刃）だけ（無作為に1枚）
        const cands = p.cards.filter((x) => !x.tray && canSplit(T, x.c) && fits(p, [x], splitOnce(T, x.c).length));
        if (!cands.length) { g.events.push({ type: "effect", who: p.name, text: f.text, op: f.op, hit: false }); continue; }
        const x = pick(cands);
        const parts = splitOnce(T, x.c);
        const nc = replaceCards(p, [x.id], parts);
        addLog(p.name, "割る", [x.c], nc.map((y) => y.c), 0, `${f.text}で切れた`);
        g.events.push({ type: "effect", who: p.name, text: f.text, op: f.op, hit: true, from: x.c, to: nc.map((y) => y.c) });
      }
    }
    // ---------- 取る：場の札を手札へ。空いたところは同じ位置に山から出す ----------
    // 場の1枚を p の手札（上の段）へ。取ったところには山から次の字が出る
    function fromField(p, fieldId) {
      const i = g.field.findIndex((x) => x.id === fieldId);
      if (i < 0) return null; // 相手が先に取った
      const x = g.field[i];
      const [nc] = draw(1).map((c) => card(c, true));
      g.field[i] = nc;
      const got = card(x.c, true);
      settle(p, got); // 上の段に空きがあれば上、無ければストックへ（KJ-039）
      return { got, x, nc };
    }
    // 取れるか（取る前の確かめ。合言葉の部屋では、このあと先着を確かめてから applyTake）
    g.canTake = (p, fieldId) => {
      if (g.hold && !g.over) return fail("通信中");
      if (!live()) return fail("終わった");
      if (p.takes <= 0) return fail("取れる枚数がない");
      if (!g.canTakeMore(p)) return fail("手札もストックもいっぱい");
      const x = g.field.find((f) => f.id === fieldId);
      if (!x) return fail("場にない");
      return { ok: true, card: x, n: x.n };
    };
    if (M) {
      // 合言葉の部屋：先着で取れた場の列の n 番目を手札へ（createMatchClient が呼ぶ）
      g.applyTake = (p, n) => {
        if (g.over) return fail("終わった");
        if (g.taken.has(n)) return fail("場にない");
        const x = g.fieldCardAt(n);
        g.taken.set(n, "me");
        g.refreshField();
        const got = card(x.c, true);
        settle(p, got);
        p.takes -= 1;
        const nc = g.field[g.field.length - 1];
        addLog(p.name, "取る", [x.c], [x.c], 0, `場に ${nc.c} が出た。残り${p.takes}枚取れる`);
        runPendingFx(p);
        return { ok: true, card: got, c: x.c };
      };
      // 相手が場の列の n 番目を取った（相手の行が届いた／こちらの先着がぶつかった）。こちらの場から消して、次の番号の札を出す
      g.markTaken = (n) => {
        if (g.taken.has(n)) return false;
        const c = g.fieldAt(n);
        g.taken.set(n, "opp");
        const was = g.field.some((f) => f.n === n);
        g.refreshField();
        if (!g.over) addLog(g.cpu.name, "取る", [c], [c], 0, was ? `場に ${g.field[g.field.length - 1].c} が出た` : "");
        return true;
      };
    }
    // memo：ログのメモの終わりに足す一言（チュートリアルの自動取りが「チュートリアルで自動」を付ける。KJ-055）
    g.take = (p, fieldId, memo) => {
      if (M) return fail("合言葉の部屋では先着を確かめて取る");
      const pre = g.canTake(p, fieldId);
      if (!pre.ok) return pre;
      const r = fromField(p, fieldId);
      if (!r) return fail("場にない");
      p.takes -= 1;
      if (p === g.me && p.takes === 0) timedFrom = now(); // KJ-086：取り終えてから時限ヒントを数え始める
      addLog(p.name, "取る", [r.x.c], [r.x.c], 0, `場に ${r.nc.c} が出た。残り${p.takes}枚取れる${memo ? `（${memo}）` : ""}`);
      runPendingFx(p);
      return { ok: true, card: r.got, c: r.x.c };
    };
    // 場の札で、手札と合わせて語になるものを先に取る。なければ無作為（CPU の取り方）
    function cpuPickField(p) {
      const hand = p.cards.map((x) => kanaOf(T, x.c));
      const covers = (have, word) => {
        const left = have.slice();
        return [...word].every((ch) => { const i = left.indexOf(ch); if (i < 0) return false; left.splice(i, 1); return true; });
      };
      const useful = g.field.filter((f) => T.COMMON_WORDS.some((w) => !g.isUsed(w.w) && w.w.includes(f.c) && covers([...hand, f.c], w.w)));
      return pick(useful.length ? useful : g.field);
    }
    // ---------- 引き直し（D-018） ----------
    function doRedraw(p, pts, note) {
      const old = p.cards.map((x) => x.c);
      g.deck.push(...old.filter((c) => T.CHARS.has(c))); // 山に戻すのはレベルの字だけ（部品・中継ぎ・レベルの外の字は山に入れない。KJ-011）
      shuffle(g.deck);
      p.cards = draw(R.start_hand).map((c) => card(c, true));
      addLog(p.name, "引き直し", old, p.cards.map((x) => x.c), pts, note);
    }
    const REDRAW_MAX_WHY = `引き直しは${R.redraw.costs.length}回まで`;
    g.redraw = (p) => {
      if (!live()) return fail("終わった");
      if (locked(p)) return fail(LOCK_WHY);
      const cost = g.redrawCost(p);
      if (cost === null) return fail(REDRAW_MAX_WHY);
      p.redraws++;
      p.score -= cost; // 点が足りなくても払える（マイナスになってよい）
      doRedraw(p, cost ? -cost : 0, `${p.redraws}回目 ${cost}点払った`);
      return { ok: true, paid: cost, nth: p.redraws };
    };

    // 2枚の位置を入れ替える。手札とストックの間でもよい（入れ替えた札はそれぞれ相手の段へ）。持っている札も数も変わらない
    g.swap = (p, idA, idB) => {
      if (!live()) return fail("終わった");
      if (locked(p)) return fail(LOCK_WHY);
      const a = g.byId(p, idA), b = g.byId(p, idB);
      if (!a || !b || a === b) return fail("札がない");
      const i = p.cards.indexOf(a), j = p.cards.indexOf(b);
      const ta = !!a.tray, tb = !!b.tray;
      p.cards[i] = b; p.cards[j] = a;
      if (ta !== tb) { if (tb) a.tray = true; else delete a.tray; if (ta) b.tray = true; else delete b.tray; }
      addLog(p.name, "入れ替え", [a.c, b.c], [b.c, a.c], 0, ta !== tb ? "手札とストックの間" : "");
      return { ok: true };
    };
    // 1枚を手札⇄ストックの空いたマスへ移す（toTray が true ならストックへ）
    g.move = (p, id, toTray) => {
      if (!live()) return fail("終わった");
      if (locked(p)) return fail(LOCK_WHY);
      const a = g.byId(p, id);
      if (!a) return fail("札がない");
      if (!!a.tray === !!toTray) return fail("同じ段");
      if (toTray ? trayCount(p) >= R.split_extra : handCount(p) >= R.hand_max) return fail(toTray ? "ストックがいっぱい" : "手札がいっぱい");
      p.cards = p.cards.filter((x) => x !== a);
      if (toTray) a.tray = true; else delete a.tray;
      p.cards.push(a);
      addLog(p.name, "移す", [a.c], [a.c], 0, toTray ? "手札→ストック" : "ストック→手札");
      return { ok: true };
    };
    g.tried = (p, chars, why) => {
      if (!live() || locked(p)) return;
      addLog(p.name, "ためした", chars, [], 0, why);
      if (p === g.me) { g.hintStreak++; maybeHint(p); } // 続けて3回はじかれたら、自動でヒント（KJ-037）
    };
    // 押した操作がはじかれた理由（何も変えない）。割る・くっつける・反転・巡り・同音・引き直しのボタンを押したとき、画面がその操作を通さないときの理由を調べる。
    // 理由と順番は g.split・g.join・g.invert・g.cycle・g.homophone・g.redraw と同じ（テストが突き合わせる）。通るなら null
    g.whyNot = (p, op, ids) => {
      if (!live()) return null;
      if (op === "redraw") return locked(p) ? LOCK_WHY : g.redrawsLeft(p) === 0 ? REDRAW_MAX_WHY : null;
      const cs = cardsOf(p, ids || []);
      if (locked(p)) return LOCK_WHY;
      if (op === "join") {
        if (!cs || cs.length !== 2) return "2枚だけ";
        const rs = joinResults(T, cs[0].c, cs[1].c);
        if (!rs.length) return joinReversed(T, cs[0].c, cs[1].c) ? "並べる順が逆" : "くっつかない";
        return fits(p, cs, 1) ? null : "手札もストックもいっぱい";
      }
      if (!cs) return "1枚だけ";
      const t = [cs[cs.length - 1]], c = t[0].c; // 1枚に効く操作は、最後に選んだ札を見る（KJ-054）
      if (op === "split") {
        if (!canSplit(T, c)) return "割れない";
        return fits(p, t, splitOnce(T, c).length) ? null : "手札もストックもいっぱい";
      }
      if (op === "homophone") {
        if (!homoChars(T, c).length) return "同じ読みの字がない"; // KJ-069
        if (!g.ready(p, "homophone")) return "待ち時間";
        return fits(p, t, 1) ? null : "手札もストックもいっぱい";
      }
      const map = op === "invert" ? T.INV : op === "cycle" ? T.NEXT : null;
      if (!map) return null;
      if (!map.has(c)) return "できない字";
      if (!g.ready(p, op)) return "待ち時間";
      return fits(p, t, 1) ? null : "手札もストックもいっぱい";
    };
    // 人が押した操作・取るがはじかれたら、「ためした」で残す（KJ-041・D-055）。使った札の欄に札、メモに「操作名：理由」。
    // 同じ札・同じ理由が続けて（間に別の行が入らずに）押されたら1行にまとめ、メモの終わりに「×回数」。
    // ヒントの数え方は変えない（g.tried だけが数える）。CPU は呼ばない。extra は理由のあとに足す文（くっつく面など）
    let lastOpTry = null;
    g.triedOp = (p, op, chars, why, extra) => {
      if (!live() || !why || why === LOCK_WHY) return;
      const base = `${op}：${why}${extra || ""}`, key = `${op}|${(chars || []).join("")}|${base}`;
      const last = g.log[g.log.length - 1];
      if (lastOpTry && lastOpTry.row === last && lastOpTry.key === key) {
        lastOpTry.n++;
        last.note = `${base} ×${lastOpTry.n}`;
        return;
      }
      addLog(p.name, "ためした", chars || [], [], 0, base);
      lastOpTry = { row: g.log[g.log.length - 1], key, n: 1 };
    };

    // KJ-082（D-100）：ヒントで光ったのに、その試合で人が放たなかった言葉を1つ。字数の多いもの → 同じなら試合の後のほう。無ければ null
    g.missedWord = () => {
      const thrown = new Set(g.log.filter((e) => e.op === "放つ" && e.who === g.me.name).map((e) => e.from.join("")));
      let best = null;
      g.hinted.forEach((w, i) => {
        if (thrown.has(w)) return;
        if (!best || [...w].length >= [...best].length) best = w; // 同じ字数なら後に出たほう
      });
      return best;
    };
    function finish(winner, why) {
      g.over = true;
      g.winner = winner;
      const missed = g.missedWord();
      addLog("—", "終わり", [], [], 0, (g.solo ? `ひとりで ${g.me.score}点（${why}）` : (winner ? `${winner.name}の勝ち` : "引き分け") + `（${why}）`) + (missed ? `。見逃した言葉：${missed}` : ""));
      g.events.push({ type: "over", winner, solo: g.solo });
    }
    // 合言葉の部屋の終わり（createMatchClient が先着や時間切れで決めて呼ぶ）。winnerKey は "me"／"opp"／null（引き分け）
    if (M) g.releaseClaimed = (p, ids) => { releasing = true; try { return g.release(p, ids); } finally { releasing = false; } };
    if (M) g.finishMatch = (winnerKey, why) => { if (!g.over) finish(winnerKey === "me" ? g.me : winnerKey === "opp" ? g.cpu : null, why); };
    function checkOver() {
      if (g.over || M) return; // 合言葉の部屋：先に勝ちの点に届いたかは 'end' 行の先着で決める（createMatchClient）
      const hit = [g.me, g.cpu].filter((p) => p.score >= R.win.score);
      if (g.solo) return; // ひとりでは50点で終わらない
      if (hit.length) finish(hit[0], `先に${R.win.score}点`);
    }
    // 画面が定期的に呼ぶ：時間切れ
    g.tick = () => {
      if (!live() || g.tutorial) return false; // チュートリアルに時間はない
      let changed = false;
      if (now() < g.endsAt && g.idleHint()) changed = true; // 小1：見逃しの光り（KJ-067）
      if (now() < g.endsAt && g.timedHint()) changed = true; // 時限ヒント（KJ-086）。時間切れのあとは数えない
      if (M) return changed; // 合言葉の部屋の時間切れは createMatchClient が二人の点をそろえてから終える
      if (now() >= g.endsAt && g.solo) {
        finish(null, `${g.timeLimit / 60}分`);
        changed = true;
      } else if (now() >= g.endsAt) {
        const a = g.me.score, b = g.cpu.score;
        finish(a === b ? null : a > b ? g.me : g.cpu, `${g.timeLimit / 60}分 ${a}対${b}`);
        changed = true;
      }
      return changed;
    };

    // ---------- CPU（強さ3つ。動く間隔と1手先の使い方が違う。KJ-058） ----------
    g.cpuDelay = () => { const [a, b] = cpuInterval(D, g.opponent); return a + rand() * (b - a); };
    const pick = (a) => a[Math.floor(rand() * a.length)];
    function pickIds(p, text) {
      const pool = p.cards.slice(), ids = [];
      for (const ch of text) { const i = pool.findIndex((x) => kanaOf(T, x.c) === ch); if (i < 0) return null; ids.push(pool[i].id); pool.splice(i, 1); } // ノ・儿・ナ はかな（KJ-053）
      return ids;
    }
    function cpuTakeAll(p) {
      while (p.takes > 0 && g.canTakeMore(p)) {
        if (!g.take(p, cpuPickField(p).id).ok) break;
      }
    }
    // 札を1枚だけ反転・巡り・同音で替えたとき、CPU が探せる語（よく使う語で、まだ使っていない）で放てるようになる手。ready は、いま押せるもの
    // 強さごとに使える手が違う（KJ-058。rules.cpu.ahead。とても弱い＝なし・ふつう＝反転と巡り・つよい＝反転・巡り・同音・割る〔KJ-019〕）
    function cpuAhead(p) {
      const allowed = (D.rules.cpu.ahead || {})[g.opponent] || [];
      const words = T.COMMON_WORDS.filter((w) => !g.isUsed(w.w));
      const covers = (have, word) => {
        const left = have.slice();
        return [...word].every((ch) => { const i = left.indexOf(ch); if (i < 0) return false; left.splice(i, 1); return true; });
      };
      const found = [];
      for (const [k, outsOf] of [["cycle", (c) => (T.NEXT.has(c) ? [[T.NEXT.get(c)]] : [])], ["invert", (c) => (T.INV.has(c) ? [[T.INV.get(c)]] : [])], ["homophone", (c) => homoChars(T, c).map((h) => [h])],
        // 割る（KJ-019・D-037）：割れる字だけ。割った部品が手札・ストックに入るときだけ（人と同じ置き場の決まり）。待ち時間はない
        ["split", (c, x) => (canSplit(T, c) && fits(p, [x], splitOnce(T, c).length) ? [splitOnce(T, c)] : [])]]) {
        if (!allowed.includes(k)) continue;
        for (const x of p.cards) for (const to of outsOf(x.c, x)) {
          const after = p.cards.filter((y) => y !== x).map((y) => y.c).concat(to).map((c) => kanaOf(T, c));
          if (words.some((w) => covers(after, w.w))) found.push({ k, x, to: k === "split" ? to : to[0], isReady: k === "split" ? true : g.ready(p, k) });
        }
      }
      return found.length ? { ready: found.filter((m) => m.isReady) } : null;
    }
    g.cpuTurn = () => {
      if (!live() || g.solo || M) return null; // 合言葉の部屋は CPU を出さない
      if (now() >= g.endsAt) { g.tick(); return null; } // 時間切れのあとは動かない（裏にいた間の手を取り戻さない。KJ-036）
      const p = g.cpu;
      if (p.takes > 0 && g.canTakeMore(p)) { cpuTakeAll(p); return { ok: true, op: "取る" }; }
      const ws = T.COMMON_WORDS.filter((w) => !g.isUsed(w.w) && pickIds(p, w.w)); // CPU が知っていて、手札でいま放てる語
      if (ws.length) {
        const best = Math.max(...ws.map((w) => scoreOf(D, T, w.w).pts));
        const w = pick(ws.filter((x) => scoreOf(D, T, x.w).pts === best));
        const r = g.release(p, pickIds(p, w.w));
        if (r.ok) cpuTakeAll(p);
        return r;
      }
      const joins = [];
      for (const a of p.cards) for (const b of p.cards) {
        if (a !== b) for (const k of joinResults(T, a.c, b.c)) joins.push([a, b, k]);
      }
      const good = joins.filter((j) => isLevelChar(T, j[2]));
      if (good.length) { const j = pick(good); return g.join(p, [j[0].id, j[1].id], j[2]); }
      if (joins.length) { const j = pick(joins); return g.join(p, [j[0].id, j[1].id], j[2]); }
      const cyc = p.cards.filter((x) => T.NEXT.has(x.c));
      if (cyc.length && g.ready(p, "cycle") && rand() < 0.5) return g.cycle(p, [pick(cyc).id]);
      const inv = p.cards.filter((x) => T.INV.has(x.c));
      if (inv.length && g.ready(p, "invert") && rand() < 0.3) return g.invert(p, [pick(inv).id]);
      // CPU が知っている語で放てるものがない＝動けない（KJ-015）。画面の「動けない」（語の表の全部で見る）とは別。
      // 知らない語が手札にあるだけで引き直さずに止まっていた（N4 で語の表が増えて目立った）
      // 引き直す前に：1手先（強さごとに使える手だけ。KJ-058）で、自分が探せる語を放てるようになるなら、引き直さずにその手を使う。待ち時間中なら待つ（KJ-049）
      const ahead = cpuAhead(p);
      if (ahead) {
        if (!ahead.ready.length) return null;
        const m = pick(ahead.ready);
        return m.k === "homophone" ? g.homophone(p, [m.x.id], m.to) : g[m.k](p, [m.x.id]); // 割る＝g.split（1回の動きで1つの操作。割ったあとに放つのは次の番）
      }
      // 引き直しは人と同じ値段・5回まで（KJ-049）。ただし CPU は、次の値段が rules.cpu.redraw_max_cost 以下（1回目 0点・2回目 5点）のときだけ引き直す（KJ-073）。
      // 3回目から（10点以上）と、回数を使いきっていたら、何もしない（次の番にまた見る）。人の決まりは変えない
      if (g.redrawsLeft(p) > 0 && g.redrawCost(p) <= D.rules.cpu.redraw_max_cost) return g.redraw(p);
      return null;
    };

    // ---------- ログの書き出し ----------
    g.logText = () => {
      const pad = (n) => String(n).padStart(2, "0");
      const d = g.startedAt;
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const head = [
        "# 漢対普請瓦版 ログ（KJ-003 役づくりの競争・KJ-008 1字は放てない・KJ-006 レベル）",
        `# はじめた時刻 ${ds}（端末の時計）`,
        `# レベル ${levelLabel(g.level)}`,
        `# 相手 ${opponentLabel(D, g.opponent, g.timeLimit)}`,
        `# 時間 ${g.tutorial ? "なし（チュートリアル）" : timeLabel(g.timeLimit)}`,
        ...rulesLabel(D, g.opponent, g.level, g.timeLimit).map((x) => "# 仮置き " + x),
        "# 手 はじめ・割る・くっつける・反転・巡り・同音・放つ・取る・引き直し・入れ替え（札の位置を替えた。手札とストックの間も）・移す（手札⇄ストックの空いたマスへ）・ためした（放つ・くっつける・割る・反転・巡り・同音・取る・引き直しがはじかれた。並べてやめた並びも）・動けない（放てる言葉が手札に無くなった。使った札＝その時の手札）・動ける・ヒント（放たない時間が長くて自動で出した。小1 の見逃しの光りも。光らせた札と、狙った言葉はメモに）・段（チュートリアルの1段が終わった。メモに段の名前と秒数）・とばす（チュートリアルをとばした）・終わり",
        "# 点＝その手で増えた点（引き直しで払った点はマイナス）",
        "# データ " + FILES.map((f) => `${f}=${D[f].version}`).join(" "),
        `# 字 ${T.CHARS.size}（手に持てる字 ${T.HOLD.size}）・語 ${T.WORDS.size}（巡り ${T.CYCLES.map((c) => c.name).join("・")}）`,
        "秒\tどちら\t手\t使った札\tできた札\t点\tあなたの点\tCPUの点\tあなたの手札\tCPUの手札\tメモ",
      ];
      const rows = g.log.map((e) => [e.t.toFixed(1), e.who, e.op, e.from.join(" "), e.to.join(" "), e.pts, e.meScore, e.cpuScore, e.me, e.cpu, e.note].join("\t"));
      return head.concat(rows).join("\n") + "\n";
    };
    return g;
  }


  // ---------- チュートリアル（KJ-043・D-057）----------
  // 決まった手札・ストック・場（data/tutorial.json）で、操作を1つずつ見せる。時間なし・CPU なし・自動のヒントなし。
  // 段の中身と文は D.tutorial の1か所。この関数は DOM に触らない。画面は、操作の前に blocked() で通してよいか聞き、通ったら advance() で進める。
  // 段は steps[i]、段の中の1手は actions[j]（op は release／take／split／join〔引きずる〕／invert／cycle／homophone／end）。
  // 放ったあと場から取りきるまでは、ほかの手は何もできない（KJ-039）ので、取る手は段2 のほか、放つたびに（段の外で）要る。
  // 段2（取る）は人が場の札をタップして取る。そのあと（段3 以降）の放ったあとは、場の左から順に自動で取る（KJ-055。autoPending／autoTake。画面が札の動きを見せながら1枚ずつ呼ぶ）
  function createTutorial(D, T, env) {
    const TD = D.tutorial;
    const g = createGame(D, T, { ...(env || {}), tutorial: TD, startStock: false });
    const steps = TD.steps, ui = TD.ui;
    const acts = [];
    steps.forEach((s, i) => s.actions.forEach((a, j) => acts.push({ ...a, step: i, k: j, last: j === s.actions.length - 1 })));
    const info = { total: steps.length, done: 0, finished: null, secs: [] }; // done＝済んだ段の数
    g.tutorialInfo = info;
    let cur = 0, stepStart = g.now();
    const BTN = { release: "bRelease", split: "bSplit", invert: "bInvert", cycle: "bCycle", homophone: "bHomo" }; // 光らせるボタン（join は引きずるのでボタンなし）
    const fmt = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (k in o ? o[k] : ""));
    const act = () => acts[cur];
    const lockedNow = () => g.me.takes > 0;
    const same = (a, b) => (a || []).join("") === (b || []).join("");
    const useText = (a) => (a.op === "join" ? `${a.from} を ${a.to} の${FACE_LABEL[a.face]}の面に` : a.op === "homophone" ? `${a.use.join("")} → ${a.pick}` : a.use.join(" → "));
    const tut = {
      g, steps, info, ui, acts,
      get total() { return steps.length; },
      // 画面に出す段：最後の段（おわり）の前の放ったあとは、取りきるまで前の段のまま（段7 の 気分 のあとの「取る」が「8/8 おわり」に見えない。KJ-046）
      act, shownStep: () => (lockedNow() && act().op === "end" && cur > 0 ? acts[cur - 1].step : act().step),
      stepNo: () => tut.shownStep() + 1, title: () => steps[tut.shownStep()].title,
      // いま画面に出す1行。放ったあと場から取りきるまでは、取る案内
      line() {
        if (info.finished) return "";
        if (lockedNow() && act().op !== "take") return fmt(ui.autoTake, { n: g.me.takes });
        return act().line;
      },
      // 自動で取る番か（放ったあとで取る枚数が残っていて、いまの手が段2 の「取る」ではない）。取る枚数のぶん手札・ストックに空きがあるときだけ
      autoPending: () => !info.finished && !g.over && lockedNow() && act().op !== "take" && g.canTakeMore(g.me) && g.field.length > 0,
      // 場の左から1枚を取る（ログのメモに ui.autoNote）。取れたら { ok, card, c }（card は手札に入った札）。取れない回は { ok: false }
      autoTake() {
        if (!tut.autoPending()) return { ok: false, why: "自動で取る番ではない" };
        return g.take(g.me, g.field[0].id, ui.autoNote);
      },
      atEnd: () => !info.finished && act().op === "end" && !lockedNow(),
      // 光らせるもの：札（字）・ボタン（id）・同音の選びの字
      glow() {
        const a = act();
        if (info.finished || lockedNow()) return { chars: [], button: null, pick: null };
        return { chars: a.op === "join" ? [a.from, a.to] : a.use || [], button: BTN[a.op] || null, pick: a.pick || null };
      },
      // 札を選んでよいか（その手に使う字だけ）。引きずってよいか（くっつける手の、落とす札だけ）
      canSelect: (c) => !info.finished && !lockedNow() && (act().use || []).includes(c),
      canDrag: (c) => !info.finished && !lockedNow() && act().op === "join" && act().from === c,
      // 押せる見た目にするボタン（Back は選びを外すだけなので別）
      buttonOn: (id) => !info.finished && !lockedNow() && BTN[act().op] === id,
      // 通してよいか。通すなら null、はじくなら理由（「ためした」に残す）。info：release＝{text}／split・invert・cycle＝{chars}／homophone＝{chars, pick?}／join＝{from, to, face}
      blocked(op, x) {
        x = x || {};
        const a = act();
        if (info.finished) return null;
        if (op === "take") return null; // 取れる枚数があるかは遊びの決まりが見る
        const notNow = fmt(ui.notNow, { n: a.step + 1, title: steps[a.step].title });
        if (a.op !== op) return notNow;
        const wrong = fmt(ui.wrongCards, { use: useText(a) });
        if (op === "release") return x.text === a.word ? null : wrong;
        if (op === "join") return x.from === a.from && x.to === a.to && x.face === a.face ? null : wrong;
        if (!same(x.chars, a.use)) return wrong;
        if (op === "homophone" && x.pick !== undefined && x.pick !== a.pick) return wrong;
        return null;
      },
      // 通した手が決まりでも通ったあとに呼ぶ。段の最後の手なら、その段の秒数をログに残して次へ。取る手は取りきったときだけ進む
      advance(op) {
        const a = act();
        if (info.finished || a.op === "end" || a.op !== op) return false;
        if (op === "take" && g.me.takes > 0) return false;
        if (a.last) {
          const secs = Math.round((g.now() - stepStart) * 10) / 10;
          info.secs.push(secs); info.done++;
          g.addLog("—", "段", [], [], 0, `${a.step + 1} ${steps[a.step].title}：${secs}秒`);
          stepStart = g.now();
        }
        cur++;
        return true;
      },
      // 終える：kind は "done"（おわりの段で「本番へ」）か "skip"（とばす）。終えたら試合として閉じる（点・時間は関係しない）
      finish(kind) {
        if (info.finished || (kind === "done" && !tut.atEnd())) return false;
        const a = act();
        if (kind === "skip") {
          info.finished = "skip";
          g.addLog("—", "とばす", [], [], 0, `${tut.stepNo()} ${tut.title()}でとばした（${info.done}段が済み）`);
        } else {
          info.finished = "done";
          g.addLog("—", "終わり", [], [], 0, `チュートリアルを終えた（${info.done}段が済み。秒：${info.secs.join("・")}）`);
        }
        g.over = true;
        return true;
      },
    };
    return tut;
  }

  // ---------- 合言葉の部屋（KJ-033・D-049）：先着の決め方 ----------
  // 表 public.kj_claims（match_id, kind, key, player, payload, created_at。主キー (match_id, kind, key)。入れる・読むだけ）を使う。
  //   取る＝(match_id, "card", 場の列の番号)／放つ＝(match_id, "word", 言葉)／勝ちの点に届いた＝(match_id, "end", "score")
  //   時間切れ＝(match_id, "end", "time:" + 自分の役)／点・手札の枚数＝(match_id, "event", 送る側が作る一意の文字列)
  //   入ったら先着。主キーでぶつかったら相手が先
  // claims（つなぎ）は { insert(row) → Promise<{ ok: true, row } | { ok: false, conflict: true } | { ok: false, error }>, subscribe(match_id, fn) → 解除の関数 }。
  //   本物は Supabase（index.html。次の回）。テストは memoryClaims（主キーの先着を同じ形でまねる、メモリの中の偽物）
  function createMatchClient(g, claims, opts) {
    opts = opts || {};
    if (!g.match) throw new Error("合言葉の部屋の試合ではない");
    const D = g.D, R = D.rules;
    const mid = g.match.id, role = g.match.role, oppRole = g.match.oppRole;
    const nonce = opts.nonce || Math.floor((opts.rand || Math.random)() * 1e9).toString(36);
    const graceSec = typeof opts.graceSec === "number" ? opts.graceSec : MATCH_END_GRACE_SEC;
    const timeoutSec = typeof opts.timeoutSec === "number" ? opts.timeoutSec : MATCH_INSERT_TIMEOUT_SEC;
    const pingSec = typeof opts.pingSec === "number" ? opts.pingSec : MATCH_PING_SEC;
    const goneSec = typeof opts.goneSec === "number" ? opts.goneSec : MATCH_GONE_SEC;
    const totalMax = R.hand_max + R.split_extra;
    const startAt = g.endsAt - g.timeLimit;
    let seq = 0, sent = null, oppSeq = -1, timeSent = false, endScoreSent = false, pingN = 0, lastPing = startAt, stopped = false;
    const oppTime = { got: false, score: null };
    const mine = new Set(); // 届いた自分の行（返事だけ落ちて押し直したとき、ぶつかった相手が自分の行かを見分ける）
    const kk = (kind, key) => kind + "\u0000" + key;
    const c = { g, lastOppRowAt: null, oppLeft: false };
    // insert に時間切れを付ける（返事が来なくても試合を止めない）。投げた・壊れた返事も「つながらない」
    const timed = (p) => new Promise((res) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; res({ ok: false, error: "時間切れ" }); } }, timeoutSec * 1000);
      Promise.resolve(p).then((r) => { if (!done) { done = true; clearTimeout(t); res(r && typeof r === "object" ? r : { ok: false, error: "返事が変" }); } },
        (e) => { if (!done) { done = true; clearTimeout(t); res({ ok: false, error: String(e) }); } });
    });
    const send = (kind, key, payload) => {
      try { return timed(claims.insert({ match_id: mid, kind, key: String(key), player: role, payload: payload || {} })); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); }
    };
    // ぶつかった行が自分の行か：つなぎが返す player（約束）か、届いた自分の行で見分ける
    const ownConflict = (r, kind, key) => !!(r && r.conflict && (r.player === role || mine.has(kk(kind, String(key)))));
    const fail = (why) => ({ ok: false, why });
    const state = () => ({ score: g.me.score, count: g.me.cards.length, hand: g.handCount(g.me) });
    // 点・手札の枚数が変わっていたら 'event' で送る（画面は手を打つたびに呼ぶ）
    c.sendState = async () => {
      const st = state();
      if (sent && sent.score === st.score && sent.count === st.count && sent.hand === st.hand) return { ok: true, skipped: true };
      const r = await send("event", `${role}-${nonce}-${seq}`, { type: "state", seq: seq++, ...st });
      if (r.ok) sent = st; // 届かなければ、次に呼んだときに送り直す
      return r;
    };
    // 先着を確かめる。返事を待つあいだ手を止める。止めを下ろすのは、呼んだ側が返事を反映する直前（同じ一拍で。間に tick が入らないように）
    async function claim(kind, key, payload) {
      g.hold = true;
      return send(kind, key, payload);
    }
    // 取る：場の列の番号を先に入れた方だけ取れる
    c.take = async (fieldId) => {
      const pre = g.canTake(g.me, fieldId);
      if (!pre.ok) return pre;
      const n = pre.n;
      const r = await claim("card", n, { c: pre.card.c });
      g.hold = false;
      if (r.ok || ownConflict(r, "card", n)) {
        const t = g.applyTake(g.me, n);
        await c.sendState();
        return t;
      }
      if (r.conflict) { g.markTaken(n); return { ok: false, why: "相手が先に取った", lost: true, c: pre.card.c }; }
      return fail("つながらない");
    };
    // 放つ：言葉を先に入れた方だけ点が入る。負けたら札は手元に残る
    c.release = async (ids) => {
      const pre = g.canRelease(g.me, ids);
      if (!pre.ok) return pre;
      const score = g.me.score + pre.pts;
      const r = await claim("word", pre.text, { pts: pre.pts, score });
      g.hold = false;
      if (r.ok || ownConflict(r, "word", pre.text)) {
        const out = g.releaseClaimed(g.me, ids);
        if (!out.ok) return out; // 先着を確かめている間は手を止めているので、ここには来ない見込み
        await c.sendState();
        if (g.me.score >= R.win.score && !g.over) await claimWin();
        return out;
      }
      if (r.conflict) { g.lostWord(g.me, pre.text); return { ok: false, why: "相手が先に放った", lost: true, text: pre.text }; }
      return fail("つながらない");
    };
    // 先に勝ちの点に届いた方：'end' の "score" を先に入れた方（二人の画面で勝ちがそろう）
    async function claimWin() {
      if (endScoreSent) return;
      endScoreSent = true;
      const r = await send("end", "score", { winner: role, score: g.me.score });
      if (r.ok || ownConflict(r, "end", "score")) g.finishMatch("me", `先に${R.win.score}点`);
      else if (r.conflict) g.finishMatch("opp", `先に${R.win.score}点`);
      else endScoreSent = false; // つながらなかった。次の tick で送り直す
    }
    c.redraw = async () => { const r = g.redraw(g.me); if (r.ok) await c.sendState(); return r; };
    // まだいる（相手の画面の「通信が切れた」の判定に使う）。抜ける（もう一度・設定を変える で捨てたとき）
    c.ping = () => send("event", `${role}-${nonce}-p${pingN++}`, { type: "ping" });
    c.leave = () => send("event", `${role}-${nonce}-leave`, { type: "leave" });
    // 相手の通信が切れたか（抜けた行が来た／相手の行が goneSec 届かない）。試合は時間どおり進む
    c.oppGone = () => c.oppLeft || g.now() - (c.lastOppRowAt === null ? startAt : c.lastOppRowAt) > goneSec;

    // 届いた行の中身の確かめ（相手の端末から来るので、形の合わない行は捨てる）
    const nat = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
    const SCORE_MAX = 100000;
    // 点は引き直しでマイナスになってよい（KJ-049）。下限は引き直しを5回使いきった分
    const SCORE_MIN = -R.redraw.costs.reduce((a, b) => a + b, 0);
    const scoreOk = (v) => Number.isInteger(v) && v >= SCORE_MIN && v <= SCORE_MAX;
    function rowOk(row) {
      if (!row || typeof row !== "object" || row.match_id !== mid) return false;
      if (!ROLES.includes(row.player) || typeof row.kind !== "string" || typeof row.key !== "string" || !row.key || row.key.length > 64) return false;
      const p = row.payload;
      if (p !== undefined && p !== null && (typeof p !== "object" || Array.isArray(p))) return false;
      return true;
    }
    function payloadOk(row) {
      const p = row.payload || {};
      if (row.kind === "card") return /^[0-9]{1,6}$/.test(row.key);
      if (row.kind === "word") { const n = [...row.key].length; return n >= 2 && n <= 8 && (p.score === undefined || scoreOk(p.score)); }
      if (row.kind === "end") {
        if (row.key === "score") return ROLES.includes(p.winner) && (p.score === undefined || scoreOk(p.score));
        return p.score === undefined || scoreOk(p.score);
      }
      if (row.kind === "event" && p.type === "state") return nat(p.seq, 1e9) && scoreOk(p.score) && nat(p.count, totalMax) && (p.hand === undefined || nat(p.hand, R.hand_max));
      return true;
    }
    // 届いた行（相手の行も、自分の行も届く）
    c.onRow = (row) => {
      if (stopped || !rowOk(row)) return false;
      if (row.player === oppRole) c.lastOppRowAt = g.now();
      if (row.player === role) mine.add(kk(row.kind, String(row.key)));
      if (!payloadOk(row)) return false;
      const p = row.payload || {};
      if (row.kind === "end") {
        if (row.key === "score" && p.winner) { g.finishMatch(p.winner === role ? "me" : "opp", `先に${R.win.score}点`); return true; }
        if (row.key === "time:" + oppRole && row.player === oppRole) { oppTime.got = true; oppTime.score = p.score; if (typeof p.score === "number") g.cpu.score = p.score; return true; }
        return false;
      }
      if (row.player !== oppRole) return false; // 自分の行は、もう手元で反映している
      if (row.kind === "card") return g.markTaken(Number(row.key));
      if (row.kind === "word") return g.remoteRelease(row.key, scoreOf(D, g.T, row.key).pts, p.score); // 点の重みはこちらの表で数える
      if (row.kind === "event" && p.type === "state") {
        if (p.seq <= oppSeq) return false;
        oppSeq = p.seq;
        return g.remoteState(p);
      }
      if (row.kind === "event" && p.type === "leave") { const was = c.oppLeft; c.oppLeft = true; return !was; }
      return false;
    };
    // 画面が定期的に呼ぶ：時間切れ。時間切れでは自分の点を 'end' で送り、相手の点が届くか graceSec たったら比べる
    // 相手が抜けた・つながらないときも、時間はそのまま進み、時間切れで最後に見えた点を比べる
    c.tick = async () => {
      if (g.over) return false;
      if (g.hold) return false; // 先着の返事待ち。反映してから次の tick で
      const changed = g.tick();
      if (changed || sent === null || sent.score !== g.me.score || sent.count !== g.me.cards.length || sent.hand !== g.handCount(g.me)) await c.sendState();
      if (!g.closed && g.me.score >= R.win.score) { await claimWin(); if (g.over) return true; }
      if (g.now() < g.endsAt) {
        if (pingSec > 0 && g.now() - lastPing >= pingSec) { lastPing = g.now(); c.ping(); } // 待たない（回線が悪くても tick を止めない）
        return changed;
      }
      if (!timeSent) {
        if (g.hold) return changed; // この tick が送っている間に取る・放つが始まった。反映してから次の tick で
        g.closed = true; // ここから手を打てない（送る点を最後の点にする）
        const r = await send("end", "time:" + role, { score: g.me.score });
        if (r.ok || ownConflict(r, "end", "time:" + role)) timeSent = true; // 届かなければ次の tick で送り直す
      }
      if (g.over) return true;
      if (oppTime.got || g.now() >= g.endsAt + graceSec) {
        const a = g.me.score, b = g.cpu.score;
        g.finishMatch(a === b ? null : a > b ? "me" : "opp", `${g.timeLimit / 60}分 ${a}対${b}${oppTime.got ? "" : "（相手の点は最後に見えたもの）"}`);
        return true;
      }
      return changed;
    };
    const unsub = claims.subscribe(mid, c.onRow);
    c.stop = () => { stopped = true; if (typeof unsub === "function") unsub(); };
    return c;
  }

  // ---------- 合言葉の部屋（KJ-033 後半）：部屋を作る・合言葉で入る・始める ----------
  // 合言葉の行：(room-合言葉, "join", match_id) を作った側（host）が入れる。payload にレベル・時間・データの版。
  //   合言葉は使い回す（4けた）ので、入る側はその合言葉の行のうち ROOM_LOBBY_TTL_SEC 以内でいちばん新しいものを使う。
  // 入る：(match_id, "join", "guest")。主キーで、入れるのは一人だけ。始める：作った側が (match_id, "start", "start")。
  //   二人ともその行が届いたときに始める（始まりの時刻は created_at を基準に。roomStartAt）
  // claims には insert・subscribe に加えて select(match_id, kind) → Promise<{ ok, rows }>（created_at は秒）が要る
  async function findRoom(claims, code, nowSec) {
    if (!ROOM_CODE_RE.test(String(code || ""))) return { ok: false, why: "合言葉は数字4けた" };
    let r;
    try { r = await claims.select(roomLobbyId(code), "join"); } catch (e) { r = null; }
    if (!r || !r.ok || !Array.isArray(r.rows)) return { ok: false, why: "つながらない" };
    const fresh = r.rows.filter((x) => x && x.player === "host" && MATCH_ID_RE.test(String(x.key)) && typeof x.created_at === "number" &&
      Math.abs(nowSec - x.created_at) <= ROOM_LOBBY_TTL_SEC).sort((a, b) => b.created_at - a.created_at);
    if (!fresh.length) return { ok: false, why: "その合言葉の部屋がない" };
    const x = fresh[0], p = x.payload || {};
    return { ok: true, code: String(code), matchId: x.key, level: p.level, timeLimit: p.time, version: p.v, createdAt: x.created_at };
  }
  async function hostRoom(claims, o) {
    const tries = o.tries || 5;
    for (let i = 0; i < tries; i++) {
      const code = o.code && i === 0 ? String(o.code) : newRoomCode(o.rand);
      const f = await findRoom(claims, code, o.nowSec);
      if (f.ok) continue; // その合言葉はいま使われている。別の合言葉に
      if (f.why === "つながらない") return f;
      let r;
      try { r = await claims.insert({ match_id: roomLobbyId(code), kind: "join", key: o.matchId, player: "host", payload: { level: o.level, time: o.timeLimit, v: o.version } }); } catch (e) { r = null; }
      if (r && r.ok) return { ok: true, code, matchId: o.matchId };
      if (!r || !r.conflict) return { ok: false, why: "つながらない" };
    }
    return { ok: false, why: "合言葉を作れなかった（もう一度）" };
  }
  async function joinRoom(claims, matchId) {
    let r;
    try { r = await claims.insert({ match_id: matchId, kind: "join", key: "guest", player: "guest", payload: {} }); } catch (e) { r = null; }
    if (r && r.ok) return { ok: true };
    if (r && r.conflict) return { ok: false, why: "その部屋はもう始まっている" };
    return { ok: false, why: "つながらない" };
  }
  async function startRoom(claims, matchId, payload) {
    let r;
    try { r = await claims.insert({ match_id: matchId, kind: "start", key: "start", player: "host", payload: payload || {} }); } catch (e) { r = null; }
    if (r && (r.ok || r.conflict)) return { ok: true }; // ぶつかった＝もう始めてある
    return { ok: false, why: "つながらない" };
  }
  // 始まりの時刻（画面の時計の目盛り）：'start' 行の created_at（サーバーの時刻・秒）から。端末の時計がずれているときは、届いた時刻で始める
  function roomStartAt(createdAtSec, epochNowSec, clockNowSec, maxLagSec) {
    // 上限は時間切れの待ち（MATCH_END_GRACE_SEC）より短くする（端末の時計が進んでいる側だけ先に終わらないように）
    const lag = epochNowSec - createdAtSec, m = typeof maxLagSec === "number" ? maxLagSec : 3;
    if (!Number.isFinite(lag) || lag < 0 || lag > m) return clockNowSec;
    return clockNowSec - lag;
  }
  // 部屋の待ち（作る側・入る側）。届いた行を渡すと、作る側は相手が入ったら始め、二人とも 'start' 行で onStart を呼ぶ
  function roomWaiter(claims, role, matchId, onStart, payload) {
    let starting = false, started = false;
    return async (row) => {
      if (!row || row.match_id !== matchId || started) return;
      if (role === "host" && row.kind === "join" && row.key === "guest" && !starting) { starting = true; const r = await startRoom(claims, matchId, payload); if (!r.ok) starting = false; return; }
      if (row.kind === "start" && row.key === "start" && row.player === "host") { started = true; onStart(row); }
    };
  }

  // 主キー (match_id, kind, key) の先着をまねる、メモリの中の偽物（テスト用。本物の Supabase には出さない）。
  // insert は次の一拍（Promise）で入るので、同じ瞬間に二人が押したときは先に insert を呼んだ方が入る。入った行は全員の subscribe に届く
  // ぶつかったときは、先に入っていた行の player を返す（本物のつなぎと同じ約束）
  function memoryClaims(opts) {
    opts = opts || {};
    const now = opts.now || (() => Date.now() / 1000);
    const rows = new Map(), subs = new Set();
    let down = false;
    const failKinds = [], dropKinds = [], hangKinds = [];
    const keyOf = (r) => [r.match_id, r.kind, r.key].join("\u0000");
    return {
      rows: () => [...rows.values()],
      setDown: (v) => { down = !!v; }, // つながらない（テストで、相手が抜けた形）
      failNext: (kind) => { failKinds.push(kind); }, // 次のその kind の行は入らず、返事は「つながらない」
      dropReplyNext: (kind) => { dropKinds.push(kind); }, // 次のその kind の行は入るが、返事だけ「つながらない」
      hangNext: (kind) => { hangKinds.push(kind); }, // 次のその kind の行は入らず、返事も来ない（insert の時間切れを見る）
      insert: async (row) => {
        await Promise.resolve();
        const hi = hangKinds.indexOf(row.kind);
        if (hi >= 0) { hangKinds.splice(hi, 1); return new Promise(() => {}); }
        if (down) return { ok: false, error: "つながらない" };
        const fi = failKinds.indexOf(row.kind);
        if (fi >= 0) { failKinds.splice(fi, 1); return { ok: false, error: "つながらない" }; }
        const k = keyOf(row);
        if (rows.has(k)) return { ok: false, conflict: true, player: rows.get(k).player };
        const r = { ...row, created_at: now() };
        rows.set(k, r);
        for (const fn of [...subs]) if (fn.mid === row.match_id) fn(r);
        const di = dropKinds.indexOf(row.kind);
        if (di >= 0) { dropKinds.splice(di, 1); return { ok: false, error: "つながらない" }; }
        return { ok: true, row: r };
      },
      select: async (mid, kind) => {
        await Promise.resolve();
        if (down) return { ok: false, error: "つながらない" };
        return { ok: true, rows: [...rows.values()].filter((r) => r.match_id === mid && (!kind || r.kind === kind)) };
      },
      subscribe: (mid, fn) => { const f = (r) => fn(r); f.mid = mid; subs.add(f); return () => subs.delete(f); },
    };
  }

  // ---------- ログの自動送信（KJ-020。D-038）----------
  // 送る中身の形と、送ってよい場所の判定。送る処理そのもの（fetch・端末への保存）は index.html
  const PLAY_LOG_LIMITS = { device_id: 64, result: 200, log: 200000 };
  // 自分（人）が1手でも動いたか（はじめ・終わり・動けない・動ける・最初の1枚は数えない）
  function playedAny(g) {
    return g.log.some((e) => e.who === g.me.name && e.op !== "最初の1枚" && e.op !== "動けない" && e.op !== "動ける");
  }
  // 終わりの1行（例：あなたの勝ち（10分 27対6））。終わっていなければ「途中でやめた」
  function playLogResult(g) {
    if (g.tutorialInfo) { // チュートリアル（KJ-043）：どの段まで進んだか・とばしたか
      const t = g.tutorialInfo, n = t.finished === "done" ? t.total : Math.min(t.total, t.done + 1); // いま（やめた・とばした）段
      return `チュートリアル（${t.finished === "skip" ? "とばした" : t.finished === "done" ? "終えた" : "途中でやめた"}・${t.total}段のうち ${n} 段まで・${t.done}段が済み）`.slice(0, PLAY_LOG_LIMITS.result);
    }
    const sc = g.solo ? "" : ` ${g.me.score}対${g.cpu.score}`;
    const body = `${timeLabel(g.timeLimit)}${sc}`;
    if (!g.over) return `途中でやめた（${body}・${g.me.score}点）`.slice(0, PLAY_LOG_LIMITS.result);
    if (g.solo) return `ひとりで ${g.me.score}点（${timeLabel(g.timeLimit)}）`;
    return `${g.winner ? g.winner.name + "の勝ち" : "引き分け"}（${body.trim()}）`.slice(0, PLAY_LOG_LIMITS.result);
  }
  // 試合が終わったときの表示の中身（KJ-018・D-036／D-039）。DOM に触らない。画面は index.html
  // kind：win／lose／draw／solo。label：大きく出す文字（ひとりでは「おわり」）。me・cpu：大きく出す点（ひとりでは cpu が null）。
  // items：自分が放った言葉を、放った順に（くっつけて作った字は出さない）。tier：2字=1（ポコッ）・3字=2（キラッと少し跳ねる）・4字=3（さらに大きく跳ねて光る）
  // KJ-087：終わりの画面の言葉をタップしたときに開く欄の中身。読み（かな。数＋助数詞は助数詞の読み）・英語の意味（words.json の en。2つまで）・辞書（コトバンク）で引く URL。
  // 辞書の中身は取り込まない（リンクだけ）。語の表に en が無い語（数＋助数詞・地名・名字など）は en が空
  function kotobankUrl(word) { return "https://kotobank.jp/search?q=" + encodeURIComponent(word); }
  function endWordInfo(T, text, w) {
    const cr = !w && T && T.COUNTER_READ ? counterReading(T, text) : null;
    return { reading: w ? w.kana : (cr ? cr.join("・") : ""), ens: w && w.en ? w.en.slice(0, 2) : [], url: kotobankUrl(text) };
  }
  const END_LABELS = { win: "勝ち！", lose: "負け…", draw: "引き分け", solo: "おわり" };
  function endShow(g, T, winner) {
    const kind = g.solo ? "solo" : winner === g.me ? "win" : winner === g.cpu ? "lose" : "draw";
    const items = g.log.filter((e) => e.op === "放つ" && e.who === g.me.name).map((e) => {
      const text = e.from.join(""), w = T && T.WORDS ? T.WORDS.get(text) : null;
      return { text, kana: w ? w.kana : "", pts: e.pts, tier: Math.max(1, Math.min(3, [...text].length - 1)), ...endWordInfo(T, text, w) };
    });
    // KJ-082：見逃した言葉（ヒントで光ったのに放たれなかった1つ）。字・読み・意味は台の行と同じもの。無ければ null
    const mw = g.missedWord ? g.missedWord() : null;
    let missed = null;
    if (mw) {
      const w = T && T.WORDS ? T.WORDS.get(mw) : null;
      const kana = w ? w.kana : (T && T.COUNTER_READ && counterReading(T, mw) ? counterReading(T, mw).join("・") : "");
      const en = w && w.en ? w.en.join(" / ") : "";
      missed = { text: mw, kana, en, ...endWordInfo(T, mw, w), line: `見逃した言葉：${mw}${kana ? `（${kana}）` : ""}${en ? ` ${en}` : ""}` };
    }
    return { kind, label: END_LABELS[kind], me: g.me.score, cpu: g.solo ? null : g.cpu.score, items, missed };
  }

  // ---------- 表紙の号数と日付（KJ-093。新聞紙風の見た目。DOM に触らない）----------
  // 漢数字。1〜9999（範囲の外・数でないときは 一）。十・百・千の前の「一」は付けない（十二・百五・千・二千二十六）
  const KANSUJI_DIGITS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  function kansuji(n) {
    n = Math.floor(Number(n));
    if (!(n >= 1 && n <= 9999)) return "一";
    const units = [[1000, "千"], [100, "百"], [10, "十"]];
    let out = "";
    for (const [u, ch] of units) {
      const d = Math.floor(n / u);
      n -= d * u;
      if (d === 0) continue;
      out += (d === 1 ? "" : KANSUJI_DIGITS[d]) + ch;
    }
    if (n > 0) out += KANSUJI_DIGITS[n];
    return out;
  }
  // 号数の文字。played＝その端末で始めた試合の数（読めない・負・整数でないときは 0）。第○號（○＝played+1）
  function issueLabel(played) {
    let n = Math.floor(Number(played));
    if (!(n >= 0) || n > 9998) n = 0;
    return `第${kansuji(n + 1)}號`;
  }
  // 今日の日付（漢数字）。年は 1字ずつ（二〇二六年）、月・日は十の位を使う（十一月二十五日）
  function kansujiDate(d) {
    const dt = d instanceof Date && !isNaN(d) ? d : new Date();
    const year = String(dt.getFullYear()).split("").map((c) => KANSUJI_DIGITS[+c]).join("");
    return `${year}年${kansuji(dt.getMonth() + 1)}月${kansuji(dt.getDate())}日`;
  }

  // ---------- 戦況の文（KJ-094。新聞紙風の見た目。DOM に触らない）----------
  // 放った言葉を、漢字カタカナ交じりの文にして新しい順に返す。「アナタ、空白（クウハク）ヲ放ツ。二字ニテ三点。場ヨリ新・話ヲ取ル。」
  // 文の型は js/strings.js の SENKYO（tpl。仮）。ひらがなに当たる所（助詞・名前・読み）はカタカナ。放った言葉そのものは漢字のまま（何が使用済みか読めるように）
  // o：{ me＝自分の名前, tpl＝文の型, kana＝(言葉)→ひらがなの読み（無ければ ""）}。返す：[{ who, mine, word, pts, takes[], text, segs:[{k:"who"|"word"|"p", t}] }]（新しい順）
  const toKatakana = (s) => String(s).replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  const kansujiN = (n) => (n === 0 ? "〇" : kansuji(n));
  function fillSegs(str, vals) { // "{who}、{word}…" を、値の入る所だけ印を付けて分ける（who・word 以外は p）
    const out = [];
    let last = 0, m;
    const re = /\{(\w+)\}/g;
    const push = (k, t) => { if (t === "") return; const q = out[out.length - 1]; if (q && q.k === k && k === "p") q.t += t; else out.push({ k, t }); };
    while ((m = re.exec(str))) {
      push("p", str.slice(last, m.index));
      push(m[1] === "who" || m[1] === "word" ? m[1] : "p", String(vals[m[1]] === undefined ? "" : vals[m[1]]));
      last = m.index + m[0].length;
    }
    push("p", str.slice(last));
    return out;
  }
  function senkyoLines(log, o) {
    const tpl = o.tpl, out = [];
    const L = Array.isArray(log) ? log : [];
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (!e || e.op !== "放つ") continue;
      const takes = [];
      for (let j = i + 1; j < L.length; j++) { // 同じ人のこの放ちのあとの 取る（次の放ち・取る以外の手まで）
        const f = L[j];
        if (!f || f.who !== e.who) continue;
        if (f.op === "取る") takes.push((f.from || []).join(""));
        else if (f.op === "放つ") break; // 放ったあとは取りきるまで本人は他の手を打てない。間に入るのは相手の攻撃ワードで効かされた記録だけ（同じ名前で残る）なので、数えるのをやめるのは次の放ちだけ
      }
      const word = (e.from || []).join(""), yomi = o.kana ? o.kana(word) : "";
      const mine = e.who === o.me, n = [...word].length, pts = e.pts || 0;
      const vals = { who: toKatakana(e.who), word, n: kansujiN(n), pts: kansujiN(pts) };
      vals.yomi = yomi ? fillSegs(tpl.yomi, { kana: toKatakana(yomi) }).map((s) => s.t).join("") : "";
      let segs = fillSegs(tpl.release, vals).concat(fillSegs(tpl.score, vals));
      if (takes.length) segs = segs.concat(fillSegs(tpl.take, { cards: takes.join(tpl.sep) }));
      out.push({ who: e.who, mine, word, pts, takes, text: segs.map((s) => s.t).join(""), segs });
    }
    return out.reverse();
  }

  // play_logs に1行送る中身。1手も動いていなければ null（送らない）
  function playLogRow(g, deviceId) {
    if (!g || !(playedAny(g) || (g.tutorialInfo && g.tutorialInfo.finished === "skip"))) return null; // チュートリアルは、1手も動かずにとばしたことも送る
    return {
      device_id: String(deviceId || "").slice(0, PLAY_LOG_LIMITS.device_id) || "unknown",
      app_version: String(g.D.rules.version || ""),
      level: g.level,
      opponent: g.opponent,
      result: playLogResult(g),
      log: g.logText().slice(0, PLAY_LOG_LIMITS.log),
    };
  }
  // 送ってよい場所か：手元（localhost・127.0.0.1・file）とテスト（navigator.webdriver）では送らない。force はテストが送る処理を確かめるときだけ
  function logSendAllowed(env) {
    if (env && env.force) return true;
    if (!env || env.webdriver) return false;
    const h = String(env.hostname || "").toLowerCase();
    if (!h || h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" || h.endsWith(".localhost")) return false;
    return true;
  }

  return {
    kansuji, issueLabel, kansujiDate, toKatakana, senkyoLines,
    FILES, OPPONENTS, PLAY_MODES, CPU_POWERS, readOpponent, opponentKey, LEVELS, timeChoices, normTime, vibratePattern, timeLabel, levelLabel, levelShort, makeTables, isN5, isLevelChar, isChar, radicalNote, radicalFormNote, joinPartners, joinNote, JOIN_NOTE_MODES, splitOnce, canSplit, delivered, joinResults, joinReversed,
    releasable, effectText, counterParts, usedCounters, counterBlocked, counterReading, rejectText, scoreOf, kanaOf, kanaText, wordCharOk, KANA_ONLY_WHY, homoChars, marks, markKinds, cutSpec, FACES, FACE_LABEL, faceJoins, faceResults, rulesLabel, opponentLabel, createGame, createTutorial, TUTORIAL_OPPONENT, playLogRow, endShow, kotobankUrl, END_LABELS, logSendAllowed, playLogResult, PLAY_LOG_LIMITS,
    strSeed, seededRand, matchRand, ROLES, ROOM_OPPONENT, MATCH_END_GRACE_SEC, MATCH_INSERT_TIMEOUT_SEC, MATCH_PING_SEC, MATCH_GONE_SEC, ROOM_LOBBY_TTL_SEC,
    createMatchClient, memoryClaims, newMatchId, newRoomCode, roomLobbyId, findRoom, hostRoom, joinRoom, startRoom, roomStartAt, roomWaiter,
  };
});
