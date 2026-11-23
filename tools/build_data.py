#!/usr/bin/env python3
"""data/kanji.json・words.json・readings.json を辞書から作り直す。

使い方:
    pip install jamdict-data        # JMdict・KANJIDIC2 入りの sqlite（約 50MB を展開）
    python3 tools/build_data.py     # data/ の3ファイルを上書き

    # jamdict-data が入らない環境では、展開済みの jamdict.db を直接渡せる
    python3 tools/build_data.py --db /path/to/jamdict.db

    # レベル（KJ-006）。N4＝N5＋N4 の字（初期値）／N5＝N5 の字だけ
    python3 tools/build_data.py --level N5

    # N5 の字の表を差し替える（1行1字、または空白区切り。# 以降はコメント）
    python3 tools/build_data.py --kanji-list tools/n5_tanos.txt

字・語には lv（その字・語が出てくるいちばん低いレベル）を付ける。画面はレベルで絞って使う（js/core.js の makeTables）。

語（KJ-011・D-029）：2〜4字の語は「手に持てる字」だけで書けるものを入れる。手に持てる字＝レベルの字＋部品表で
割る・くっつけるで出る字（中継ぎ 交・里 など）＋巡り・対義・同音で行ける字のうち、「字」として見せるもの
（レベルの字か data/parts.json の jouyou）。語の lv は、その語の字がすべて手に持てるいちばん低いレベル。
1字の語はこれまでどおりレベルの字だけ（1字は放てないので、台の読み・意味のためだけに残す）。
手に持てる字の決め方は js/core.js の makeTables（T.HOLD）と同じにしてある。片方を変えたらもう片方も変える。

レベルの外の字（KJ-009・D-027。十二支の 丑寅卯辰巳未申酉戌亥）は data/cycles.json の outside に手で書く。このスクリプトが kanji.json の outside と
readings.json に読みを足す（山には入れない。巡りでだけ手に入り、同音で別の字に変えられる。手に持てる字に入るので、その字を含む語も words に入る）。

手作りの表（parts / antonyms / cycles / radical_forms / special）はこのスクリプトでは作らない。
"""
import argparse
import json
import os
import sqlite3
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")

VERSION = "2026-11-23.3"
# レベルと KANJIDIC2 の jlpt（旧級）の対応。tanos の表への差し替えはまだ（D-009）
LEVELS = {"N5": "4", "N4": "3"}
LEVEL_ORDER = ["N5", "N4"]
# 小1（KJ-044・D-058）：KANJIDIC2 の grade=1（小学1年で習う80字）。N5・N4 の「上」にも「下」にもならない別の組。
# N5・N4 の字には lv のほかに g1:true を付け、どちらにも無い字（石・竹・王・玉・草・虫・糸・貝）は lv="G1" の行にする
# （lv="G1" の字は小1 のときだけ山に入る）。語は g1:true を付ける（lv が null で g1 だけの語は小1 だけで放てる）
G1_KEY = "G1"
COMMON_TAGS = {"news1", "ichi1", "spec1", "spec2", "gai1"}  # JMdict の「よく使う」の印
SKIP_KANJI_INFO = {  # 書き方として外すもの
    "word containing out-dated kanji",
    "word containing irregular kanji usage",
}


def find_db(path):
    if path:
        return path
    try:
        import jamdict_data  # type: ignore
    except ImportError:
        sys.exit("jamdict-data が見つかりません。pip install jamdict-data するか --db で jamdict.db を渡してください")
    p = os.path.join(os.path.dirname(jamdict_data.__file__), "jamdict.db")
    if not os.path.exists(p):
        sys.exit(f"{p} がありません")
    return p


def load_kanji_list(path):
    chars = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.split("#", 1)[0]
            for ch in line.split():
                for c in ch:
                    if c not in chars:
                        chars.append(c)
    return chars


def write(name, obj):
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write("\n")


def load_json(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def holdable(level_chars, parts_json, cycles_json, antonyms_json):
    """手に持てる字（KJ-011）。js/core.js の makeTables の T.HOLD と同じ決め方"""
    CH = set(level_chars)
    allp = parts_json["parts"]
    relay = set(parts_json.get("relay", []))
    jouyou = set(parts_json.get("jouyou", []))
    keep = {k for k in allp if k in CH}
    grew = True
    while grew:
        grew = False
        for r in relay:
            if r in keep or r not in allp:
                continue
            if any(r in allp[k] for k in keep):
                keep.add(r)
                grew = True
    hold = set(CH)
    for k in keep:
        for c in [k, *allp[k]]:
            if c in CH or c in jouyou:
                hold.add(c)
    # 巡りは、字がすべて「レベルの字か outside（レベルの外で巡りでだけ手に入る字。十二支。KJ-009）」のものだけ使う（makeTables と同じ）。
    # 対義はレベルの字だけ。同音は、レベルの字と、使う巡りの outside の字
    for cy in cycles_json["cycles"]:
        out = set(cy.get("outside", []))
        if all(c in CH or c in out for c in cy["chars"]):
            hold |= set(cy["chars"])
    for a, b in antonyms_json["pairs"]:
        if a in CH and b in CH:
            hold |= {a, b}
    return hold


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db")
    ap.add_argument("--kanji-list", help="N5 の字の表（tanos などに差し替えるとき）")
    ap.add_argument("--level", default="N4", choices=LEVEL_ORDER, help="どのレベルまで作るか（N4＝N5＋N4）")
    args = ap.parse_args()
    db = sqlite3.connect(find_db(args.db))
    meta = dict(db.execute("select key, value from meta"))

    # ---- 字 ----
    levels = LEVEL_ORDER[:LEVEL_ORDER.index(args.level) + 1]
    lv_of = {}
    chars = []
    sources = []
    for lv in levels:
        if lv == "N5" and args.kanji_list:
            got = load_kanji_list(args.kanji_list)
            sources.append(f"N5={os.path.basename(args.kanji_list)}")
        else:
            got = [r[0] for r in db.execute(
                "select literal from character where jlpt = ? order by cast(freq as integer)", (LEVELS[lv],))]
            sources.append(f"{lv}=KANJIDIC2 jlpt={LEVELS[lv]}（旧{LEVELS[lv]}級で代用）")
        for c in got:
            if c not in lv_of:
                lv_of[c] = lv
                chars.append(c)
    # 小1：N5・N4 に無い字は lv="G1" で足す（--level N5 のときは N4 の字もここに入る）
    g1_chars = [r[0] for r in db.execute("select literal from character where grade = 1 order by cast(freq as integer)")]
    g1set = set(g1_chars)
    for c in g1_chars:
        if c not in lv_of:
            lv_of[c] = G1_KEY
            chars.append(c)
    sources.append(f"小1=KANJIDIC2 grade=1（{len(g1_chars)}字）")
    list_source = "・".join(sources)
    charset = set(chars)
    # レベルの外の字（KJ-009）：data/cycles.json の outside。山には入れない。巡りでだけ手に入り、同音で別の字に変えられる
    cycles_in = load_json("cycles.json")
    outside = []
    for cy in cycles_in["cycles"]:
        for c in cy.get("outside", []):
            if c not in outside and c not in charset:
                outside.append(c)

    kanji = []
    outside_rows = []
    readings = {}
    for ch in chars + outside:
        is_out = ch in outside
        row = db.execute("select ID, stroke_count, freq from character where literal = ?", (ch,)).fetchone()
        if not row:
            print(f"警告: KANJIDIC2 に {ch} がありません", file=sys.stderr)
            if not is_out:
                kanji.append({"c": ch, "lv": lv_of[ch], **({"g1": True} if ch in g1set else {})})
            continue
        cid, strokes, freq = row
        on, kun = [], []
        for rtype, val in db.execute(
                "select r.r_type, r.value from reading r join rm_group g on r.gid = g.ID "
                "where g.cid = ? and r.r_type in ('ja_on','ja_kun')", (cid,)):
            (on if rtype == "ja_on" else kun).append(val)
        meanings = [m for (m,) in db.execute(
            "select m.value from meaning m join rm_group g on m.gid = g.ID "
            "where g.cid = ? and (m.m_lang = '' or m.m_lang = 'en')", (cid,))]
        if is_out:
            outside_rows.append({"c": ch, "strokes": strokes, "freq": int(freq) if freq else None, "en": meanings[:2]})
        else:
            kanji.append({"c": ch, "lv": lv_of[ch], **({"g1": True} if ch in g1set else {}),
                          "strokes": strokes, "freq": int(freq) if freq else None, "en": meanings[:2]})
        readings[ch] = {"on": on, "kun": kun}

    write("kanji.json", {
        "version": VERSION,
        "level": args.level,
        "levels": levels,
        "source": list_source,
        "note": "lv＝その字のレベル（N5／N4。どちらにも無い小1の字は G1）。N4 で遊ぶときは N5＋N4 の字を使う。g1:true＝小1（小学1年の80字。KJ-044）の字で、小1 で遊ぶときはこの80字を使う。本来は tanos.co.uk の表（D-009）。tools/build_data.py --kanji-list で N5 を差し替える",
        "count": len(kanji),
        "count_by_level": {lv: sum(1 for k in kanji if k["lv"] == lv) for lv in [*levels, G1_KEY]},
        "count_g1": sum(1 for k in kanji if k.get("g1")),
        "kanji": kanji,
        "outside_note": "レベルの外の字（KJ-009・D-027。十二支）。山には入れない。巡りでだけ手に入る。画面では「字」として見せる。data/cycles.json の outside から作る",
        "outside": outside_rows,
    })

    # ---- 同じ読みの組 ----
    def kun_key(v):
        v = v.strip("-")
        return v.split(".", 1)[0]

    groups = defaultdict(list)
    for ch in chars + outside:
        r = readings.get(ch)
        if not r:
            continue
        keys = {"on:" + v.strip("-") for v in r["on"]} | {"kun:" + kun_key(v) for v in r["kun"]}
        for k in keys:
            if ch not in groups[k]:
                groups[k].append(ch)
    same = [{"reading": k.split(":", 1)[1], "type": k.split(":", 1)[0], "chars": v}
            for k, v in sorted(groups.items()) if len(v) >= 2]
    write("readings.json", {
        "version": VERSION,
        "source": "KANJIDIC2（ja_on / ja_kun）。訓読みは送りがな（. の後）を落として比べる。組は全レベルの字とレベルの外の字（十二支。KJ-009）で作り、遊ぶときにレベルの字と使う巡りの外の字だけに絞る（2字未満の組は使わない）",
        "readings": readings,
        "same_reading_groups": same,
    })

    # ---- 手に持てる字（KJ-011）----
    parts_json, cycles_json, antonyms_json = load_json("parts.json"), load_json("cycles.json"), load_json("antonyms.json")
    hold_of = {}
    for i, lv in enumerate(levels):
        lvchars = [c for c in chars if lv_of[c] in LEVEL_ORDER and LEVEL_ORDER.index(lv_of[c]) <= i]
        hold_of[lv] = holdable(lvchars, parts_json, cycles_json, antonyms_json)
    hold_all = hold_of[levels[-1]]
    hold_g1 = holdable(g1_chars, parts_json, cycles_json, antonyms_json)

    def word_level(text):
        """N5／N4 のうち、その語がいちばん低く放てるレベル。どちらでも放てない（小1 だけの）語は None"""
        if len(text) == 1:
            return lv_of.get(text) if lv_of.get(text) in levels else None
        for lv in levels:
            if all(c in hold_of[lv] for c in text):
                return lv
        return None

    def word_g1(text):
        return text in g1set if len(text) == 1 else all(c in hold_g1 for c in text)

    # ---- 語 ----
    rows = db.execute("select k.ID, k.idseq, k.text from Kanji k")
    cand = defaultdict(list)  # text -> [(kid, idseq)]
    for kid, idseq, text in rows:
        if len(text) == 1 and text in charset or 2 <= len(text) <= 4 and (all(c in hold_all for c in text) or all(c in hold_g1 for c in text)):
            cand[text].append((kid, idseq))

    def kanji_info(kid):
        return {t for (t,) in db.execute("select text from KJI where kid = ?", (kid,))}

    def kanji_pri(kid):
        return {t for (t,) in db.execute("select text from KJP where kid = ?", (kid,))}

    def first_kana(idseq, text):
        for kana_id, kana, nokanji in db.execute(
                "select ID, text, nokanji from Kana where idseq = ? order by ID", (idseq,)):
            if nokanji:
                continue
            restr = [t for (t,) in db.execute("select text from KNR where kid = ?", (kana_id,))]
            if restr and text not in restr:
                continue
            return kana
        return None

    def entry_misc(idseq):
        return {t for (t,) in db.execute(
            "select m.text from misc m join Sense s on m.sid = s.ID where s.idseq = ?", (idseq,))}

    def glosses(idseq):
        out = []
        for (sid,) in db.execute("select ID from Sense where idseq = ? order by ID", (idseq,)):
            g = [t for (t,) in db.execute("select text from SenseGloss where sid = ?", (sid,))]
            if g:
                out.append("; ".join(g[:2]))
            if len(out) >= 2:
                break
        return out

    words = []
    for text, kids in cand.items():
        best = None
        for kid, idseq in kids:
            if kanji_info(kid) & SKIP_KANJI_INFO:
                continue
            common = bool(kanji_pri(kid) & COMMON_TAGS)
            score = (common, -idseq)
            if best is None or score > best[0]:
                best = (score, kid, idseq, common)
        if best is None:
            continue
        _, kid, idseq, common = best
        kana = first_kana(idseq, text)
        if not kana:
            continue
        misc = entry_misc(idseq)
        w = {"w": text, "lv": word_level(text), "kana": kana, "en": glosses(idseq)}
        if word_g1(text):
            w["g1"] = True
        if common:
            w["common"] = True
        if "yojijukugo" in misc or any("yojijukugo" in entry_misc(i) for _, i in kids):
            w["yoji"] = True
        words.append(w)
    words.sort(key=lambda w: (len(w["w"]), not w.get("common", False), w["w"]))

    def stat_of(ws):
        return {"total": len(ws),
                "by_length": {str(n): sum(1 for w in ws if len(w["w"]) == n) for n in range(1, 5)},
                "common": sum(1 for w in ws if w.get("common")),
                "yoji": sum(1 for w in ws if w.get("yoji"))}
    stats = {
        "hold_by_level": {**{lv: len(hold_of[lv]) for lv in levels}, G1_KEY: len(hold_g1)},
        "by_level": {**{lv: stat_of([w for w in words if w["lv"] and LEVEL_ORDER.index(w["lv"]) <= LEVEL_ORDER.index(lv)]) for lv in levels},
                     G1_KEY: stat_of([w for w in words if w.get("g1")])},
        "total": len(words),
        "by_length": {str(n): sum(1 for w in words if len(w["w"]) == n) for n in range(1, 5)},
        "common": sum(1 for w in words if w.get("common")),
        "yoji": sum(1 for w in words if w.get("yoji")),
    }
    write("words.json", {
        "version": VERSION,
        "source": f"JMdict（jamdict-data, jmdict {meta.get('jmdict.version')}）。2〜4字の語は「手に持てる字」（レベルの字＋割る・くっつけるで出る字）だけで書けるもの（KJ-011・D-029）。1字の語はレベルの字だけ",
        "fields": {"w": "語", "lv": "レベル（その語の字がすべて手に持てる、いちばん低い N5／N4。小1 だけで放てる語は null）", "g1": "小1 で放てる（字がすべて小1 の手に持てる字。KJ-044）", "kana": "かな読み（最初の1つ）", "en": "英語の意味（最初の2つ）",
                   "common": "よく使う（news1/ichi1/spec1/spec2/gai1）", "yoji": "四字熟語"},
        "stats": stats,
        "words": words,
    })
    print(json.dumps({"kanji": len(kanji), "g1_chars": len(g1_chars), "same_reading_groups": len(same), **stats}, ensure_ascii=False))


if __name__ == "__main__":
    main()
