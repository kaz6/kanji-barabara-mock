#!/usr/bin/env python3
"""data/kanji.json・words.json・readings.json を辞書から作り直す。

使い方:
    pip install jamdict-data        # JMdict・KANJIDIC2 入りの sqlite（約 50MB を展開）
    python3 tools/build_data.py     # data/ の3ファイルを上書き

    # jamdict-data が入らない環境では、展開済みの jamdict.db を直接渡せる
    python3 tools/build_data.py --db /path/to/jamdict.db

    # N5 の字の表を差し替える（1行1字、または空白区切り。# 以降はコメント）
    python3 tools/build_data.py --kanji-list tools/n5_tanos.txt

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

VERSION = "2026-11-20.1"
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db")
    ap.add_argument("--kanji-list", help="N5 の字の表（tanos などに差し替えるとき）")
    args = ap.parse_args()
    db = sqlite3.connect(find_db(args.db))
    meta = dict(db.execute("select key, value from meta"))

    # ---- 字 ----
    if args.kanji_list:
        chars = load_kanji_list(args.kanji_list)
        list_source = os.path.basename(args.kanji_list)
    else:
        chars = [r[0] for r in db.execute(
            "select literal from character where jlpt = 4 order by cast(freq as integer)")]
        list_source = "KANJIDIC2 jlpt=4（旧4級。N5 の代用）"
    charset = set(chars)

    kanji = []
    readings = {}
    for ch in chars:
        row = db.execute("select ID, stroke_count, freq from character where literal = ?", (ch,)).fetchone()
        if not row:
            print(f"警告: KANJIDIC2 に {ch} がありません", file=sys.stderr)
            kanji.append({"c": ch})
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
        kanji.append({"c": ch, "strokes": strokes, "freq": int(freq) if freq else None,
                      "en": meanings[:2]})
        readings[ch] = {"on": on, "kun": kun}

    write("kanji.json", {
        "version": VERSION,
        "level": "N5",
        "source": list_source,
        "note": "本来は tanos.co.uk の N5 表（D-009）。tools/build_data.py --kanji-list で差し替える",
        "count": len(kanji),
        "kanji": kanji,
    })

    # ---- 同じ読みの組 ----
    def kun_key(v):
        v = v.strip("-")
        return v.split(".", 1)[0]

    groups = defaultdict(list)
    for ch in chars:
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
        "source": "KANJIDIC2（ja_on / ja_kun）。訓読みは送りがな（. の後）を落として比べる",
        "readings": readings,
        "same_reading_groups": same,
    })

    # ---- 語 ----
    rows = db.execute("select k.ID, k.idseq, k.text from Kanji k")
    cand = defaultdict(list)  # text -> [(kid, idseq)]
    for kid, idseq, text in rows:
        if 1 <= len(text) <= 4 and all(c in charset for c in text):
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
        w = {"w": text, "kana": kana, "en": glosses(idseq)}
        if common:
            w["common"] = True
        if "yojijukugo" in misc or any("yojijukugo" in entry_misc(i) for _, i in kids):
            w["yoji"] = True
        words.append(w)
    words.sort(key=lambda w: (len(w["w"]), not w.get("common", False), w["w"]))

    stats = {
        "total": len(words),
        "by_length": {str(n): sum(1 for w in words if len(w["w"]) == n) for n in range(1, 5)},
        "common": sum(1 for w in words if w.get("common")),
        "yoji": sum(1 for w in words if w.get("yoji")),
    }
    write("words.json", {
        "version": VERSION,
        "source": f"JMdict（jamdict-data, jmdict {meta.get('jmdict.version')}）。字の範囲は kanji.json",
        "fields": {"w": "語", "kana": "かな読み（最初の1つ）", "en": "英語の意味（最初の2つ）",
                   "common": "よく使う（news1/ichi1/spec1/spec2/gai1）", "yoji": "四字熟語"},
        "stats": stats,
        "words": words,
    })
    print(json.dumps({"kanji": len(kanji), "same_reading_groups": len(same), **stats}, ensure_ascii=False))


if __name__ == "__main__":
    main()
