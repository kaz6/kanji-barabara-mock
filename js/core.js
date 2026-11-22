/* 漢字版（仮）モックの遊びの決まり。画面（DOM）には触らない。
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
  // レベル（KJ-006）。N4＝N5＋N4 の字。レベルが変えるのは字・語・割り方・対義・巡り・同音の範囲だけ
  const LEVELS = [
    { key: "N5", label: "N5" },
    { key: "N4", label: "N4（N5＋N4 の字）" },
  ];
  const levelLabel = (key) => (LEVELS.find((l) => l.key === key) || LEVELS[0]).label;
  // 制限時間（KJ-007）。選べる値は rules.win.time_choices_sec、既定は win.time_limit_sec（D-024）。知らない値は既定
  const timeChoices = (D) => (D.rules.win.time_choices_sec && D.rules.win.time_choices_sec.length ? D.rules.win.time_choices_sec : [D.rules.win.time_limit_sec]);
  const normTime = (D, v) => (timeChoices(D).includes(Number(v)) && v !== null && v !== "" ? Number(v) : D.rules.win.time_limit_sec);
  const timeLabel = (sec) => `${sec / 60}分`;
  const cpuInterval = (D, key) => (key === "weak" ? D.rules.cpu.weak_interval_sec : key === "fair" ? D.rules.cpu.fair_interval_sec : D.rules.cpu.interval_sec);

  const FILES = ["kanji", "words", "readings", "parts", "antonyms", "cycles", "radical_forms", "special", "rules", "split_shapes"];

  // ---------- 表を引く ----------
  // level を省くと rules.json の level_default（なければ N4）
  function makeTables(D, level) {
    const T = {};
    const order = LEVELS.map((l) => l.key);
    if (!order.includes(level)) level = order.includes(D.rules.level_default) ? D.rules.level_default : "N4";
    const upto = order.indexOf(level);
    const inLevel = (lv) => order.indexOf(lv || "N5") <= upto; // lv の無い古いデータは N5
    T.level = level;
    T.CHARS = new Set(D.kanji.kanji.filter((k) => inLevel(k.lv)).map((k) => k.c)); // 遊ぶレベルの字（山に入る字）
    T.JOUYOU = new Set(D.parts.jouyou || []); // レベルの外でも「字」として見せる（KJ-003）
    T.WORDS = new Map(D.words.words.filter((w) => inLevel(w.lv)).map((w) => [w.w, w]));
    // 割り方：できる字がレベルの字の行と、そこへ届く中継ぎだけ（N5 では N4 の字の行を外す）
    const all = D.parts.parts, relayAll = new Set(D.parts.relay || []);
    const keep = new Set(Object.keys(all).filter((k) => T.CHARS.has(k)));
    for (let grew = true; grew;) {
      grew = false;
      for (const r of relayAll) {
        if (keep.has(r) || !all[r]) continue;
        if ([...keep].some((k) => all[k].includes(r))) { keep.add(r); grew = true; }
      }
    }
    T.parts = {};
    for (const k of Object.keys(all)) if (keep.has(k)) T.parts[k] = all[k]; // もとの並びのまま（十口 は 古 が先）
    T.RELAY = new Set([...relayAll].filter((r) => keep.has(r) && !T.CHARS.has(r)));
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
    for (const [a, b] of D.antonyms.pairs) { if (T.CHARS.has(a) && T.CHARS.has(b)) { T.INV.set(a, b); T.INV.set(b, a); } }
    T.NEXT = new Map();
    // 巡りの字がすべて「レベルの字か outside（レベルの外で、巡りでだけ手に入る字。十二支。KJ-009）」のものだけ使う。四季は N4 から
    T.CYCLES = D.cycles.cycles.filter((cy) => cy.chars.every((c) => T.CHARS.has(c) || (cy.outside || []).includes(c)));
    T.OUTSIDE = new Set(); // レベルの外の字（山には入らない。巡り・同音で手に入る。「字」として見せる）
    for (const cy of T.CYCLES) for (const c of cy.outside || []) if (!T.CHARS.has(c)) T.OUTSIDE.add(c);
    for (const cy of T.CYCLES) {
      const c = cy.chars;
      c.forEach((x, i) => { if (!T.NEXT.has(x)) T.NEXT.set(x, c[(i + 1) % c.length]); });
    }
    T.HOMO = new Map();
    for (const g0 of D.readings.same_reading_groups) {
      const g = { ...g0, chars: g0.chars.filter((c) => T.CHARS.has(c) || T.OUTSIDE.has(c)) };
      if (g.chars.length < 2) continue;
      for (const c of g.chars) { if (!T.HOMO.has(c)) T.HOMO.set(c, []); T.HOMO.get(c).push(g); }
    }
    // 手に持てる字（KJ-011・D-029）：レベルの字＋割る・くっつけるで出る字（中継ぎ 交・里 など）＋巡り・対義・同音で行ける字のうち、
    // 「字」として見せるもの。放てる言葉はこの字だけで書ける語（words.json はこれで作る。tools/build_data.py の holdable と同じ決め方）
    T.HOLD = new Set(T.CHARS);
    for (const [k, v] of Object.entries(T.parts)) for (const c of [k, ...v]) if (T.CHARS.has(c) || T.JOUYOU.has(c)) T.HOLD.add(c);
    for (const c of T.NEXT.keys()) T.HOLD.add(c);
    for (const c of T.INV.keys()) T.HOLD.add(c);
    for (const c of T.HOMO.keys()) T.HOLD.add(c);
    T.SPECIAL = new Map(D.special.special.map((s) => [s.w, s]));
    // CPU が知っている語＝よく使う語（このレベルの語の表にあるものだけ。KJ-015：表にない語を知っていると、放てずに止まる）
    T.COMMON_WORDS = D.words.words.filter((w) => w.common && w.w.length >= 2 && T.WORDS.has(w.w));
    return T;
  }
  const isLevelChar = (T, c) => T.CHARS.has(c);
  const isN5 = isLevelChar; // 古い名前（いまは「遊ぶレベルの字」）
  // 画面で「字」として見せるか（レベルの字か常用漢字）。部品の見た目にしない
  const isChar = (T, c) => T.CHARS.has(c) || T.JOUYOU.has(c) || T.OUTSIDE.has(c);
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
  // 放てるか：words.json の2〜4字の語。1字は放てない（KJ-008。くっつけて作った字でも例外なし）。一度放った言葉は二人とも使えない（D-005）
  const SINGLE_WHY = "1字では放てない（2字以上の言葉）";
  function releasable(T, used, text) {
    if (!text) return { ok: false, why: "" };
    if ([...text].length === 1) return { ok: false, why: SINGLE_WHY };
    if (used.has(text)) return { ok: false, why: "放った言葉" };
    if (T.WORDS.has(text)) return { ok: true };
    return { ok: false, why: "辞書にない" };
  }
  // 役の点数（R-026）。1字1・2字3・3字6・4字12、四字熟語の印つきは倍、特別な語はさらに倍
  function scoreOf(D, T, text) {
    const S = D.rules.score;
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
  // 角の印。icons を渡すとその字で出す（画面は js/strings.js の ⇄・↻・♪。KJ-024）。渡さなければ 反・巡・音
  function marks(T, c, icons) {
    const ic = icons || { invert: "反", cycle: "巡", homophone: "音" };
    let m = "";
    if (T.INV.has(c)) m += ic.invert;
    if (T.NEXT.has(c)) m += ic.cycle;
    if (T.HOMO.has(c)) m += ic.homophone;
    return m;
  }
  // ログの頭に書く仮置きの値
  function opponentLabel(D, key, limit) {
    limit = normTime(D, limit);
    if (key === ROOM_OPPONENT.key) return `${ROOM_OPPONENT.label}（相手は人。CPU なし。場の札・言葉・勝ちの点は先に入れた方。相手の手は、こちらから見えたものだけ書く）`;
    if (key === "solo") return `ひとりで（CPU なし。場の取り合いなし。50点では終わらず、${limit / 60}分たったら終わって点を出す。CPU の列は 0）`;
    const [a, b] = cpuInterval(D, key);
    if (key === "fair") return `ふつう（CPU は ${a}〜${b}秒に1回動く）`;
    return key === "weak" ? `とても弱い（CPU は ${a}〜${b}秒に1回動く。動き方はいまの CPU のまま）` : `いまの強さ（CPU は ${a}〜${b}秒に1回動く）`;
  }
  function rulesLabel(D, key, level, limit) {
    const R = D.rules, S = R.score;
    limit = normTime(D, limit);
    level = level || R.level_default || "N4";
    key = key || R.opponent_default;
    const [a, b] = cpuInterval(D, key);
    return [
      `場=${R.field_size}枚 最初の手札=${R.start_hand}枚 手札の上限=${R.hand_max}枚＋ストック${R.split_extra}枚（全部で${R.hand_max + R.split_extra}マス。場から取るのは手札の${R.hand_max}枚まで。割る・くっつけるでできた札は、字も部品も、手札が埋まっていればストックへ。手札とストックの間は自分で動かせる）山=${level} の字を${R.same_char_in_deck}枚ずつ（尽きたら足す）`,
      `点数 ${Object.entries(S.by_length).map(([n, p]) => `${n}字${p}`).join("・")} 四字熟語×${S.yoji_mult} 特別な語×${S.special_mult}（1字は放てない）`,
      `はじまり：最初の手札${R.start_hand}枚で、すぐ時間が動く。ストックに使いやすい部品を${R.start_stock_parts}枚入れて始める（部品表で行き先が多い字でない部品の上位${R.start_stock_top}個から無作為）`,
      `台（机）は並べて見る場所。台に出した札は出す前の段にいるままで、上の段・下の段の枚数に数える`,
      `放ったら 放った字数×${R.take_per_char}枚を場から選んで取れる。放った言葉は消える（相手には届かない）`,
      `引き直し ${R.redraw.cost}点で手札を全部入れ替え（${R.start_hand}枚）。${R.redraw.cost}点ない人は${R.redraw.free_wait_sec}秒待って0点で`,
      `勝ち 先に${R.win.score}点、または${limit / 60}分で点の多い方（同点は引き分け）。ひとりでは50点で終わらず${limit / 60}分で終わる`,
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
  const ROOM_OPPONENT = { key: "room", label: "人と（合言葉）" }; // 画面の「相手」の、いまの強さの後ろに出す（KJ-033 後半）
  const ROOM_OPP_NAME = "相手";
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
    const opponent = M ? ROOM_OPPONENT.key : OPPONENTS.some((o) => o.key === env.opponent) ? env.opponent : R.opponent_default;
    const g = { D, T, level: T.level, opponent, solo: opponent === "solo", log: [], events: [], used: new Set(), over: false, winner: null,
      startedAt: (env.date || (() => new Date()))() };
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

    const card = (c, fresh) => ({ id: ++uid, c, t: now(), fresh: !!fresh });
    function shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
    const fullSet = () => { const out = []; for (let i = 0; i < R.same_char_in_deck; i++) out.push(...T.CHARS); return out; };
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
        score: 0, takes: 0, redrawAt: null, lastSpecial: null, stuck: false };
    }
    g.me = player("me", "あなた", R.start_hand);
    if (M) {
      // 相手は人。札はこの端末に無い（枚数だけ。相手が送る 'event' で更新）。山からも引かない
      g.cpu = { key: "cpu", name: ROOM_OPP_NAME, cards: [], remote: true, hand: R.start_hand, count: R.start_hand + (env.startStock !== false ? R.start_stock_parts || 0 : 0),
        cd: { invert: 0, cycle: 0, homophone: 0 }, score: 0, takes: 0, redrawAt: null, lastSpecial: null, stuck: false };
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
    g.opp = (p) => (p === g.me ? g.cpu : g.me);
    g.byId = (p, id) => p.cards.find((x) => x.id === id);
    g.ready = (p, k) => now() >= p.cd[k];
    g.cdLeft = (p, k) => Math.max(0, p.cd[k] - now());
    g.redrawLeft = (p) => (p.redrawAt === null ? 0 : Math.max(0, p.redrawAt - now()));
    // 待ち時間のゲージ（KJ-034）：0＝使った直後（空）〜1＝満ちた（押せる）。待っていなければ 1
    const frac = (left, total) => (total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) : 1);
    g.cdFrac = (p, k) => frac(g.cdLeft(p, k), R.cooldown_sec[k]);
    g.redrawFrac = (p) => (p.redrawAt === null ? 1 : frac(g.redrawLeft(p), R.redraw.free_wait_sec));
    const useCd = (p, k) => { p.cd[k] = now() + R.cooldown_sec[k]; };

    const QUIET = new Set(["はじまり", "ためした", "終わり", "動けない", "動ける", "入れ替え", "移す"]);
    function addLog(who, op, from, to, pts, note) {
      g.log.push({ t: g.elapsed(), who, op, from: from || [], to: to || [], pts: pts || 0,
        meScore: g.me.score, cpuScore: g.cpu.score, me: nCards(g.me), cpu: nCards(g.cpu), note: note || "" });
      if (!QUIET.has(op)) checkStuck();
    }
    g.addLog = addLog;

    // ---------- 動けない（R-023 を KJ-003 に合わせた） ----------
    // 手札をそのまま並べて放てる言葉（辞書の2字以上の語、放っていないもの）が1つも無い状態（KJ-008：1字は数えない）
    g.releasableInHand = (p) => {
      const cs = p.cards.map((x) => x.c);
      const have = {};
      for (const c of cs) have[c] = (have[c] || 0) + 1;
      for (const w of T.WORDS.values()) {
        if ([...w.w].length < 2 || g.used.has(w.w)) continue;
        const need = {};
        let ok = true;
        for (const c of w.w) { need[c] = (need[c] || 0) + 1; if (!have[c] || need[c] > have[c]) { ok = false; break; } }
        if (ok) return w.w;
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
      out.push(p.score >= R.redraw.cost ? `引き直し（${R.redraw.cost}点）` : `引き直し（${R.redraw.free_wait_sec}秒待つ）`);
      return out;
    };
    function checkStuck() {
      if (!g.me || !g.cpu || g.over) return;
      for (const p of players()) {
        const w = g.releasableInHand(p);
        if (!w && !p.stuck) {
          p.stuck = true;
          g.log.push({ t: g.elapsed(), who: p.name, op: "動けない", from: p.cards.map((x) => x.c), to: [], pts: 0,
            meScore: g.me.score, cpuScore: g.cpu.score, me: nCards(g.me), cpu: nCards(g.cpu),
            note: "放てる言葉なし。使える手：" + g.movesInHand(p).join("・") });
        } else if (w && p.stuck) {
          p.stuck = false;
          g.log.push({ t: g.elapsed(), who: p.name, op: "動ける", from: p.cards.map((x) => x.c), to: [], pts: 0,
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

    g.split = (p, ids) => {
      const cs = cardsOf(p, ids);
      if (!live() || !cs || cs.length !== 1) return fail("1枚だけ");
      const c = cs[0].c;
      if (!canSplit(T, c)) return fail("割れない");
      const parts = splitOnce(T, c);
      if (!fits(p, cs, parts.length)) return fail("手札もストックもいっぱい");
      const nc = replaceCards(p, ids, parts);
      addLog(p.name, "割る", [c], nc.map((x) => x.c));
      return { ok: true, cards: nc };
    };
    g.join = (p, ids, choice) => {
      const cs = cardsOf(p, ids);
      if (!live() || !cs || cs.length !== 2) return fail("2枚だけ");
      const rs = joinResults(T, cs[0].c, cs[1].c);
      if (!rs.length) return fail(joinReversed(T, cs[0].c, cs[1].c) ? "並べる順が逆" : "くっつかない");
      const to = choice === undefined ? rs[0] : choice;
      if (!rs.includes(to)) return fail("その字にはならない");
      if (!fits(p, cs, 1)) return fail("手札もストックもいっぱい");
      const nc = replaceCards(p, ids, [to]);
      addLog(p.name, "くっつける", cs.map((x) => x.c), [to]);
      return { ok: true, cards: nc };
    };
    // 引きずってくっつける（KJ-017・D-035）：札 dragId を札 targetId の面 face に落とす。できた札は相手の札の並びの位置に入る（手札に空きがあれば手札。R-032 と同じ）。
    // 字にならない面ではくっつけない（画面はそのとき入れ替え・移すにする）。段が埋まっていて行き先が無ければくっつけない
    g.joinFace = (p, dragId, targetId, face, choice) => {
      const cs = cardsOf(p, [dragId, targetId]);
      if (!live() || !cs) return fail("2枚だけ");
      const rs = faceResults(T, face, cs[0].c, cs[1].c);
      if (!rs.length) return fail("その面ではくっつかない");
      const to = choice === undefined ? rs[0] : choice;
      if (!rs.includes(to)) return fail("その字にはならない");
      if (!fits(p, cs, 1)) return fail("手札もストックもいっぱい");
      p.cards = p.cards.filter((x) => x !== cs[0]); // 先に引きずった札を抜き、相手の札の位置に入れる（段の行き先は割る・くっつけると同じ：手札に空きがあれば手札）
      const nc = replaceCards(p, [targetId], [to]);
      addLog(p.name, "くっつける", T.parts[to].slice(), [to], 0, `引きずって${FACE_LABEL[face]}の面に`);
      return { ok: true, cards: nc };
    };
    function oneStep(op, k, map) {
      return (p, ids) => {
        const cs = cardsOf(p, ids);
        if (!live() || !cs || cs.length !== 1) return fail("1枚だけ");
        const c = cs[0].c;
        if (!map.has(c)) return fail("できない字");
        if (!g.ready(p, k)) return fail("待ち時間");
        if (!fits(p, cs, 1)) return fail("手札もストックもいっぱい");
        useCd(p, k);
        const nc = replaceCards(p, ids, [map.get(c)]);
        addLog(p.name, op, [c], [nc[0].c]);
        return { ok: true, cards: nc };
      };
    }
    g.invert = oneStep("反転", "invert", T.INV);
    g.cycle = oneStep("巡り", "cycle", T.NEXT);
    g.homophone = (p, ids, to) => {
      const cs = cardsOf(p, ids);
      if (!live() || !cs || cs.length !== 1) return fail("1枚だけ");
      const c = cs[0].c;
      if (!homoChars(T, c).includes(to)) return fail("同じ読みではない");
      if (!g.ready(p, "homophone")) return fail("待ち時間");
      if (!fits(p, cs, 1)) return fail("手札もストックもいっぱい");
      useCd(p, "homophone");
      const nc = replaceCards(p, ids, [to]);
      addLog(p.name, "同音", [c], [to]);
      return { ok: true, cards: nc };
    };

    // ---------- 放つ（D-017） ----------
    // 放てるか（放つ前の確かめ。合言葉の部屋では、このあと言葉の先着を確かめてから release）
    g.canRelease = (p, ids) => {
      if (g.hold && !g.over) return fail("通信中");
      const cs = cardsOf(p, ids);
      if (!live() || !cs) return fail("札がない");
      const text = cs.map((x) => x.c).join("");
      const r = releasable(T, g.used, text);
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
      p.lastSpecial = T.SPECIAL.has(text) ? text : null;
      g.events.push({ type: "release", who: p.name, text, pts });
      checkOver();
      return { ok: true, text, pts };
    };

    // ---------- 取る：場の札を手札へ。空いたところは同じ位置に山から出す ----------
    // 場の1枚を p の手札（上の段）へ。取ったところには山から次の字が出る
    function fromField(p, fieldId) {
      const i = g.field.findIndex((x) => x.id === fieldId);
      if (i < 0) return null; // 相手が先に取った
      const x = g.field[i];
      const [nc] = draw(1).map((c) => card(c, true));
      g.field[i] = nc;
      const got = card(x.c, true);
      p.cards.push(got); // 手札の枠に入る（場から取るのは手札の枠だけ。ストックには入らない）
      return { got, x, nc };
    }
    // 取れるか（取る前の確かめ。合言葉の部屋では、このあと先着を確かめてから applyTake）
    g.canTake = (p, fieldId) => {
      if (g.hold && !g.over) return fail("通信中");
      if (!live()) return fail("終わった");
      if (p.takes <= 0) return fail("取れる枚数がない");
      if (handCount(p) >= R.hand_max) return fail("手札がいっぱい");
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
        p.cards.push(got);
        p.takes -= 1;
        const nc = g.field[g.field.length - 1];
        addLog(p.name, "取る", [x.c], [x.c], 0, `場に ${nc.c} が出た。残り${p.takes}枚取れる`);
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
    g.take = (p, fieldId) => {
      if (M) return fail("合言葉の部屋では先着を確かめて取る");
      const pre = g.canTake(p, fieldId);
      if (!pre.ok) return pre;
      const r = fromField(p, fieldId);
      if (!r) return fail("場にない");
      p.takes -= 1;
      addLog(p.name, "取る", [r.x.c], [r.x.c], 0, `場に ${r.nc.c} が出た。残り${p.takes}枚取れる`);
      return { ok: true, card: r.got, c: r.x.c };
    };
    // 場の札で、手札と合わせて語になるものを先に取る。なければ無作為（CPU の取り方）
    function cpuPickField(p) {
      const hand = p.cards.map((x) => x.c);
      const covers = (have, word) => {
        const left = have.slice();
        return [...word].every((ch) => { const i = left.indexOf(ch); if (i < 0) return false; left.splice(i, 1); return true; });
      };
      const useful = g.field.filter((f) => T.COMMON_WORDS.some((w) => !g.used.has(w.w) && w.w.includes(f.c) && covers([...hand, f.c], w.w)));
      return pick(useful.length ? useful : g.field);
    }
    // ---------- 引き直し（D-018） ----------
    function doRedraw(p, pts, note) {
      const old = p.cards.map((x) => x.c);
      g.deck.push(...old.filter((c) => T.CHARS.has(c))); // 山に戻すのはレベルの字だけ（部品・中継ぎ・レベルの外の字は山に入れない。KJ-011）
      shuffle(g.deck);
      p.cards = draw(R.start_hand).map((c) => card(c, true));
      p.redrawAt = null;
      addLog(p.name, "引き直し", old, p.cards.map((x) => x.c), pts, note);
    }
    g.redraw = (p) => {
      if (!live()) return fail("終わった");
      if (p.redrawAt !== null) return fail("待っている");
      if (p.score >= R.redraw.cost) {
        p.score -= R.redraw.cost;
        doRedraw(p, -R.redraw.cost, `${R.redraw.cost}点払った`);
        return { ok: true, paid: R.redraw.cost };
      }
      p.redrawAt = now() + R.redraw.free_wait_sec;
      addLog(p.name, "引き直し", [], [], 0, `${R.redraw.cost}点ないので${R.redraw.free_wait_sec}秒待つ（待つあいだも動ける）`);
      return { ok: true, waiting: R.redraw.free_wait_sec };
    };

    // 2枚の位置を入れ替える。手札とストックの間でもよい（入れ替えた札はそれぞれ相手の段へ）。持っている札も数も変わらない
    g.swap = (p, idA, idB) => {
      if (!live()) return fail("終わった");
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
    g.tried = (p, chars, why) => { if (live()) addLog(p.name, "ためした", chars, [], 0, why); };

    function finish(winner, why) {
      g.over = true;
      g.winner = winner;
      addLog("—", "終わり", [], [], 0, g.solo ? `ひとりで ${g.me.score}点（${why}）` : (winner ? `${winner.name}の勝ち` : "引き分け") + `（${why}）`);
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
    // 画面が定期的に呼ぶ：0点の引き直しの待ちと、時間切れ
    g.tick = () => {
      if (!live()) return false;
      let changed = false;
      for (const p of players()) {
        if (p.redrawAt !== null && now() >= p.redrawAt) { doRedraw(p, 0, `${R.redraw.free_wait_sec}秒待った（0点）`); changed = true; }
      }
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

    // ---------- CPU（1段階。8〜12秒に1回。速さで強くしない） ----------
    g.cpuDelay = () => { const [a, b] = cpuInterval(D, g.opponent); return a + rand() * (b - a); };
    const pick = (a) => a[Math.floor(rand() * a.length)];
    function pickIds(p, text) {
      const pool = p.cards.slice(), ids = [];
      for (const ch of text) { const i = pool.findIndex((x) => x.c === ch); if (i < 0) return null; ids.push(pool[i].id); pool.splice(i, 1); }
      return ids;
    }
    function cpuTakeAll(p) {
      while (p.takes > 0 && handCount(p) < R.hand_max) {
        if (!g.take(p, cpuPickField(p).id).ok) break;
      }
    }
    g.cpuTurn = () => {
      if (!live() || g.solo || M) return null; // 合言葉の部屋は CPU を出さない
      const p = g.cpu;
      if (p.takes > 0 && handCount(p) < R.hand_max) { cpuTakeAll(p); return { ok: true, op: "取る" }; }
      const ws = T.COMMON_WORDS.filter((w) => !g.used.has(w.w) && pickIds(p, w.w)); // CPU が知っていて、手札でいま放てる語
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
      if (!ws.length && p.redrawAt === null) return g.redraw(p);
      return null;
    };

    // ---------- ログの書き出し ----------
    g.logText = () => {
      const pad = (n) => String(n).padStart(2, "0");
      const d = g.startedAt;
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const head = [
        "# 漢字版（仮）モック ログ（KJ-003 役づくりの競争・KJ-008 1字は放てない・KJ-006 レベル）",
        `# はじめた時刻 ${ds}（端末の時計）`,
        `# レベル ${levelLabel(g.level)}`,
        `# 相手 ${opponentLabel(D, g.opponent, g.timeLimit)}`,
        `# 時間 ${timeLabel(g.timeLimit)}`,
        ...rulesLabel(D, g.opponent, g.level, g.timeLimit).map((x) => "# 仮置き " + x),
        "# 手 はじめ・割る・くっつける・反転・巡り・同音・放つ・取る・引き直し・入れ替え（札の位置を替えた。手札とストックの間も）・移す（手札⇄ストックの空いたマスへ）・ためした（並べたのに放てず・くっつけられずにやめた並び）・動けない（放てる言葉が手札に無くなった。使った札＝その時の手札）・動ける・終わり",
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
      if (row.kind === "word") { const n = [...row.key].length; return n >= 2 && n <= 8 && (p.score === undefined || nat(p.score, SCORE_MAX)); }
      if (row.kind === "end") {
        if (row.key === "score") return ROLES.includes(p.winner) && (p.score === undefined || nat(p.score, SCORE_MAX));
        return p.score === undefined || nat(p.score, SCORE_MAX);
      }
      if (row.kind === "event" && p.type === "state") return nat(p.seq, 1e9) && nat(p.score, SCORE_MAX) && nat(p.count, totalMax) && (p.hand === undefined || nat(p.hand, R.hand_max));
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
    // 画面が定期的に呼ぶ：0点の引き直しの待ちと、時間切れ。時間切れでは自分の点を 'end' で送り、相手の点が届くか graceSec たったら比べる
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
  // 自分（人）が1手でも動いたか（はじめ・終わり・動けない・最初の1枚は数えない）
  function playedAny(g) {
    return g.log.some((e) => e.who === g.me.name && e.op !== "最初の1枚");
  }
  // 終わりの1行（例：あなたの勝ち（10分 27対6））。終わっていなければ「途中でやめた」
  function playLogResult(g) {
    const sc = g.solo ? "" : ` ${g.me.score}対${g.cpu.score}`;
    const body = `${timeLabel(g.timeLimit)}${sc}`;
    if (!g.over) return `途中でやめた（${body}・${g.me.score}点）`.slice(0, PLAY_LOG_LIMITS.result);
    if (g.solo) return `ひとりで ${g.me.score}点（${timeLabel(g.timeLimit)}）`;
    return `${g.winner ? g.winner.name + "の勝ち" : "引き分け"}（${body.trim()}）`.slice(0, PLAY_LOG_LIMITS.result);
  }
  // play_logs に1行送る中身。1手も動いていなければ null（送らない）
  function playLogRow(g, deviceId) {
    if (!g || !playedAny(g)) return null;
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
    FILES, OPPONENTS, LEVELS, timeChoices, normTime, timeLabel, levelLabel, makeTables, isN5, isLevelChar, isChar, splitOnce, canSplit, delivered, joinResults, joinReversed,
    releasable, scoreOf, homoChars, marks, cutSpec, FACES, FACE_LABEL, faceJoins, faceResults, rulesLabel, opponentLabel, createGame, playLogRow, logSendAllowed, playLogResult, PLAY_LOG_LIMITS,
    strSeed, seededRand, matchRand, ROLES, ROOM_OPPONENT, MATCH_END_GRACE_SEC, MATCH_INSERT_TIMEOUT_SEC, MATCH_PING_SEC, MATCH_GONE_SEC, ROOM_LOBBY_TTL_SEC,
    createMatchClient, memoryClaims, newMatchId, newRoomCode, roomLobbyId, findRoom, hostRoom, joinRoom, startRoom, roomStartAt, roomWaiter,
  };
});
