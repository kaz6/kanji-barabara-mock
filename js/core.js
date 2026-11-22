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
  const cpuInterval = (D, key) => (key === "weak" ? D.rules.cpu.weak_interval_sec : D.rules.cpu.interval_sec);

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
  function marks(T, c) {
    let m = "";
    if (T.INV.has(c)) m += "反";
    if (T.NEXT.has(c)) m += "巡";
    if (T.HOMO.has(c)) m += "音";
    return m;
  }
  // ログの頭に書く仮置きの値
  function opponentLabel(D, key, limit) {
    limit = normTime(D, limit);
    if (key === "solo") return `ひとりで（CPU なし。場の取り合いなし。50点では終わらず、${limit / 60}分たったら終わって点を出す。CPU の列は 0）`;
    const [a, b] = cpuInterval(D, key);
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
      key === "solo" ? "CPU なし" : `CPU ${a}〜${b}秒に1回動く`,
    ];
  }

  // ---------- 遊び ----------
  // env: { now: () => 秒, rand: () => 0..1, date: () => Date }
  function createGame(D, T, env) {
    env = env || {};
    const now = env.now || (() => Date.now() / 1000);
    const rand = env.rand || Math.random;
    const R = D.rules;
    let uid = 0;
    const opponent = OPPONENTS.some((o) => o.key === env.opponent) ? env.opponent : R.opponent_default;
    const g = { D, T, level: T.level, opponent, solo: opponent === "solo", log: [], events: [], used: new Set(), over: false, winner: null,
      startedAt: (env.date || (() => new Date()))() };
    g.timeLimit = normTime(D, env.timeLimit); // 制限時間（秒。KJ-007）
    const t0 = now();
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
    g.cpu = player("cpu", "CPU", g.solo ? 0 : R.start_hand); // ひとりで：CPU は出さない（山からも引かない）
    const players = () => (g.solo ? [g.me] : [g.me, g.cpu]);
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
    g.field = draw(R.field_size).map((c) => card(c));
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
    const useCd = (p, k) => { p.cd[k] = now() + R.cooldown_sec[k]; };

    const QUIET = new Set(["はじまり", "ためした", "終わり", "動けない", "動ける", "入れ替え", "移す"]);
    function addLog(who, op, from, to, pts, note) {
      g.log.push({ t: g.elapsed(), who, op, from: from || [], to: to || [], pts: pts || 0,
        meScore: g.me.score, cpuScore: g.cpu.score, me: g.me.cards.length, cpu: g.cpu.cards.length, note: note || "" });
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
            meScore: g.me.score, cpuScore: g.cpu.score, me: g.me.cards.length, cpu: g.cpu.cards.length,
            note: "放てる言葉なし。使える手：" + g.movesInHand(p).join("・") });
        } else if (w && p.stuck) {
          p.stuck = false;
          g.log.push({ t: g.elapsed(), who: p.name, op: "動ける", from: p.cards.map((x) => x.c), to: [], pts: 0,
            meScore: g.me.score, cpuScore: g.cpu.score, me: g.me.cards.length, cpu: g.cpu.cards.length, note: "放てる言葉：" + w });
        }
      }
    }
    const hs = (p) => p.cards.filter((x) => !x.tray).map((x) => x.c).join("") + (trayCount(p) ? `（ストック ${p.cards.filter((x) => x.tray).map((x) => x.c).join("")}）` : "");
    addLog("—", "はじめ", [], [], 0,
      `手札 ${hs(g.me)} / ${hs(g.cpu)}・場 ${g.field.map((x) => x.c).join("")}`);

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
    const live = () => !g.over;

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
    g.release = (p, ids) => {
      const cs = cardsOf(p, ids);
      if (!live() || !cs) return fail("札がない");
      const text = cs.map((x) => x.c).join("");
      const r = releasable(T, g.used, text);
      if (!r.ok) return fail(r.why);
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
    g.take = (p, fieldId) => {
      if (!live()) return fail("終わった");
      if (p.takes <= 0) return fail("取れる枚数がない");
      if (handCount(p) >= R.hand_max) return fail("手札がいっぱい");
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
    function checkOver() {
      if (g.over) return;
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
      if (!live() || g.solo) return null;
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
    releasable, scoreOf, homoChars, marks, cutSpec, rulesLabel, opponentLabel, createGame, playLogRow, logSendAllowed, playLogResult, PLAY_LOG_LIMITS,
  };
});
