#!/usr/bin/env python3
"""KJ-027：データの札の字を1字ずつ調べ、端末の字体で出ない見込みの字を小さな字体（fonts/kj-glyphs.otf）にして同梱する。

使い方：python3 tools/build_glyphs.py   （要 fontTools と Noto Serif CJK JP）
  出る見込み＝JIS X 0208 の中の字（日本の端末の標準字体に必ずある）。
  それ以外（JIS X 0213 だけ・部首補助・簡体字の形・拡張B など）は同梱する。
  同梱する字形は Noto Serif CJK JP（SIL OFL 1.1）から取る。画面の字体（明朝）にそろえるため。ライセンス本文は fonts/OFL.txt。
  フォントの名前は KJ Glyphs（もとの名前は使わない。OFL の予約名を避ける）。
  フォントに無い字（𢀖）は、フォントの字形（幺と夂）を重ねて作る。
出力：fonts/kj-glyphs.otf・fonts/kj-glyphs.css・data/glyphs.json・docs/GLYPHS.md
"""
import json, sys, os, datetime
from fontTools.ttLib import TTCollection
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc"
# フォントに無い字を、フォントの字形を重ねて作る。字＝[(元の字, x の倍率, y の倍率, x のずれ, y のずれ), ...]
COMPOSED = {
    "𢀖": [("幺", 0.72, 0.5, 140, 410), ("夂", 0.86, 0.52, 70, 20)],  # 後 の右。幺 の下に 夂
}
# 字形の差し替え（KJ-116）。データの文字コードはそのまま、同梱する字形だけ別の字の字形にする。字＝元のコード（出力のコード）：字形を取るコードの字
# 辶 U+8FB6 を単独で出すと日本向けの字体では点2つの形になる。道・週 など常用漢字の点1つの形（⻌ U+2ECC）にそろえる
SUBSTITUTE = {"辶": "\u2ecc"}


def load(p):
    return json.load(open(os.path.join(ROOT, "data", p), encoding="utf-8"))


def jis0208(c):
    try:
        c.encode("shift_jis")
        return True
    except UnicodeEncodeError:
        return False


def collect():
    where = {}

    def add(c, w):
        where.setdefault(c, [])
        if w not in where[c]:
            where[c].append(w)

    parts = load("parts.json")
    relay = set(parts.get("relay", []))
    for k, v in {**parts["parts"], **parts.get("reach", {})}.items():  # reach＝行き先だけの字（KJ-077）
        add(k, "relay" if k in relay else "割る前の字")
        for x in v:
            add(x, "割ってできる部品")
    for k in load("kanji.json")["kanji"]:
        add(k["c"], "字")
    rf = load("radical_forms.json")["left"]
    for k, v in rf.items():
        add(k, "偏の元の字")
        add(v, "偏の形")
    for c in load("cycles.json")["cycles"]:
        for x in c["chars"]:
            add(x, "巡り（%s）" % c["name"])
    return where


def main():
    where = collect()
    chars = sorted(where, key=ord)
    embed = [c for c in chars if not jis0208(c)]
    tc = TTCollection(SRC)
    jp = [f for f in tc.fonts if f["name"].getDebugName(1) == "Noto Serif CJK JP"][0]
    cmap = jp.getBestCmap()
    gs = jp.getGlyphSet()
    missing = [c for c in embed if ord(SUBSTITUTE.get(c, c)) not in cmap and c not in COMPOSED]
    if missing:
        sys.exit("フォントにも無く、重ね方も決めていない字：" + "".join(missing))

    order = [".notdef"]
    charstrings, metrics, cm = {}, {}, {}

    def notdef():
        pen = T2CharStringPen(1000, None)
        return pen.getCharString()

    charstrings[".notdef"] = notdef()
    metrics[".notdef"] = (1000, 0)
    for c in embed:
        name = "uni%X" % ord(c)
        pen = T2CharStringPen(1000, None)
        if c in COMPOSED:
            for (src, sx, sy, dx, dy) in COMPOSED[c]:
                gs[cmap[ord(src)]].draw(TransformPen(pen, (sx, 0, 0, sy, dx, dy)))
        else:
            gs[cmap[ord(SUBSTITUTE.get(c, c))]].draw(pen)
        charstrings[name] = pen.getCharString()
        metrics[name] = (1000, 0)
        cm[ord(c)] = name
        order.append(name)

    fb = FontBuilder(1000, isTTF=False)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cm)
    fb.setupCFF("KJGlyphs-Regular", {"FullName": "KJ Glyphs Regular"}, charstrings, {})
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=880, descent=-120)
    fb.setupNameTable({
        "familyName": "KJ Glyphs", "styleName": "Regular",
        "copyright": "Glyph outlines derived from Noto Serif CJK JP. \u00a9 2017-2023 Adobe (http://www.adobe.com/). Licensed under the SIL Open Font License 1.1 (see OFL.txt)",
        "licenseDescription": "This Font Software is licensed under the SIL Open Font License, Version 1.1.",
        "licenseInfoURL": "https://openfontlicense.org",
    })
    fb.setupOS2(sTypoAscender=880, sTypoDescender=-120, usWinAscent=880, usWinDescent=120)
    fb.setupPost()
    out = os.path.join(ROOT, "fonts", "kj-glyphs.otf")
    fb.save(out)

    ver = datetime.date.today().isoformat()
    rows = []
    for c in chars:
        rows.append({"c": c, "u": "U+%04X" % ord(c), "where": where[c], "device": jis0208(c)})
    json.dump({
        "version": ver + ".1",
        "note": "札の字のうち、端末の字体で出る見込みのもの（JIS X 0208）と、字体を同梱して出すもの（KJ-027・D-042）。embed の字は fonts/kj-glyphs.otf に入っている。作り直しは python3 tools/build_glyphs.py",
        "font": "fonts/kj-glyphs.otf",
        "embed": embed,
        "composed": {k: [v[0] for v in vs] for k, vs in COMPOSED.items()},
        "substitute": SUBSTITUTE,
        "device_count": len(chars) - len(embed),
        "all": "".join(chars),
    }, open(os.path.join(ROOT, "data", "glyphs.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # CSS（unicode-range。同梱した字のときだけこの字体を使う）
    rng = ",".join("U+%X" % ord(c) for c in embed)
    open(os.path.join(ROOT, "fonts", "kj-glyphs.css"), "w", encoding="utf-8").write(
        "/* KJ-027：tools/build_glyphs.py が作る。同梱した字（data/glyphs.json の embed）のときだけ使う */\n"
        "@font-face{font-family:\"KJ Glyphs\";src:url(\"kj-glyphs.otf\") format(\"opentype\");unicode-range:" + rng + ";font-display:block}\n")
    # 一覧
    L = []
    L.append("# GLYPHS（札の字がスマホで出るか。KJ-027・D-042）\n")
    L.append("作者が赤を入れる一覧。`python3 tools/build_glyphs.py` で作り直す（このファイルも data/glyphs.json も fonts/kj-glyphs.otf もここから出る）。\n")
    L.append("## 調べ方（仮決め）\n")
    L.append("- 対象：data の札の字ぜんぶ（字・割る前の字・割ってできる部品・中継ぎ・巡りの字〔曜日・四季・十二支など〕・偏の形）。%d 字" % len(chars))
    L.append("- 「出る」＝JIS X 0208 の中の字。日本の端末（iOS の ヒラギノ・Android の Noto CJK JP など）の標準字体に必ずある。%d 字" % (len(chars) - len(embed)))
    L.append("- 「同梱」＝JIS X 0208 の外の字。JIS X 0213 だけの字（亻・氵・艹 など）・部首補助（⺌ ⺍）・簡体字の形（电・产 など）・拡張B（𠂉 など）。端末によって出ない・中国の字形になるので、字形を同梱して必ず出す。%d 字" % len(embed))
    L.append("- 同梱のしかた：Noto Serif CJK JP（明朝。画面の字体を明朝にそろえるため。SIL OFL 1.1。本文は fonts/OFL.txt）から必要な字の字形だけ取り、`fonts/kj-glyphs.otf`（名前は KJ Glyphs）にした。画面は、この字のときだけこの字体を先に使う（`@font-face` の unicode-range）。字は文字のまま（選んでコピー・ログは今までどおり）")
    L.append("- フォントに無い字（𢀖）は、フォントの字形 幺 と 夂 を重ねて作った（後 の右側）")
    L.append("- 字形の差し替え（KJ-116）：辶 U+8FB6 は、データの文字コードのまま、同梱の字形を ⻌ U+2ECC の字形（点1つ。道・週・通 などの常用漢字の形）にした。U+8FB6 を単独で出すと日本向けの字体では点2つになるため。札の字体の Shippori Mincho も U+8FB6 を持っていて先に効くので、fonts/kj-paper.css（tools/build_paper_fonts.py の NO_PAPER）の範囲から U+8FB6 を外し、kj-glyphs の形が出るようにした\n")
    L.append("## 作者が見つけた字（いちばん上）\n")
    L.append("| 字 | 前 | 後 | 直し方 |\n|---|---|---|---|")
    L.append("| 後 | 彳＋𢀖（U+22016。拡張B。端末の字体に無く、フォントにも無い） | 彳＋𢀖（割り方は同じ） | (b) 𢀖 を 幺 と 夂 の字形を重ねて作り、同梱した字体で出す。注：U+22016 は Unicode では後 の右（幺の下に夂）に当たる字ではない別の字の番号の見込み（出典で未確認）。data は前から この番号を借りている（ログ・コピーでは別の字の番号のまま）。番号を替えるか（私用領域など）は作者の確認待ち。(a) の割り方の変更は、後 を 彳＋幺＋夂 の3つにするしかなく、一段の割りに収まらないため見送り |")
    L.append("| 験 | 馬＋佥（U+4F65。中国の簡体字の形で、日本の字体に無い） | 馬＋僉（U+50C9。JIS X 0208 の中。端末で出る） | (a) 割り方を変えた。僉 は 験 の右側（㑒）に近い形。くっつけるは 馬＋僉＝験 になる |\n")
    L.append("## 同梱した字（%d 字）\n" % len(embed))
    L.append("| 字 | コード | どこで使うか | 使う割り方（割る前の字＝部品） | 直し方 |\n|---|---|---|---|---|")
    pj = load("parts.json")
    parts = {**pj["parts"], **pj.get("reach", {})}
    for c in embed:
        use = [k + "＝" + "＋".join(v) for k, v in parts.items() if c == k or c in v]
        how = "(b) 字形を重ねて作って同梱" if c in COMPOSED else ("(b) 字形を同梱（字形は %s U+%04X に差し替え。点1つ。KJ-116）" % (SUBSTITUTE[c], ord(SUBSTITUTE[c])) if c in SUBSTITUTE else "(b) 字形を同梱")
        L.append("| %s | U+%04X | %s | %s | %s |" % (c, ord(c), "・".join(where[c]), "、".join(use) or "—", how))
    L.append("\n## 出る字（%d 字）\n" % (len(chars) - len(embed)))
    L.append("JIS X 0208 の中の字。端末の字体のまま。一覧は data/glyphs.json の all から引ける。")
    open(os.path.join(ROOT, "docs", "GLYPHS.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    print("字 %d・同梱 %d・フォント %d バイト" % (len(chars), len(embed), os.path.getsize(out)))


if __name__ == "__main__":
    main()
