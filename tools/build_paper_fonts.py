#!/usr/bin/env python3
"""KJ-093：新聞紙風の見た目の字体を、要る字だけに絞って fonts/ に作る。

  画面の字（ボタン・点・見出し・説明）：Zen Old Mincho（400・700）→ fonts/kj-zen-{400,700}.woff2
  札の字（明朝）：Shippori Mincho（400）→ fonts/kj-shippori-400.woff2
  札の字（大正風）：Kaisei Tokumin（400）→ fonts/kj-kaisei-400.woff2
  どれも SIL OFL 1.1（本文は fonts/OFL-Paper.txt）。出力 CSS は fonts/kj-paper.css（@font-face）。

使い方：
  1. どこか別のフォルダで npm pack @fontsource/zen-old-mincho @fontsource/shippori-mincho @fontsource/kaisei-tokumin
     とそれぞれ tar xzf して、展開先（…/package/files に字体の分割ファイルがある）を並べる
  2. python3 tools/build_paper_fonts.py <展開したフォルダの親>     （引数を省くと環境変数 PAPER_SRC か /tmp/fp）
     字体の分割ファイルは <親>/*<名前>*/package/files/<名前>-<番号>-<太さ>-normal.woff を読む
  字：札の字＝data/*.json に出る漢字・かな・記号／画面の字＝index.html・js/・data/tutorial.json に出る字と、札の字（点・語の表示用）。足したら作り直す
  要る分の字体を作る道具だけを足す。ブラウザでは使わない（pip install fonttools brotli）
"""
import glob, json, os, re, sys
from fontTools import subset, merge
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PAPER_SRC", "/tmp/fp")

FONTS = [  # (元の名前, 太さ, 出力名, font-family 名)
    ("zen-old-mincho", 400, "kj-zen-400.woff2", "KJ Zen"),
    ("zen-old-mincho", 700, "kj-zen-700.woff2", "KJ Zen"),
    ("shippori-mincho", 400, "kj-shippori-400.woff2", "KJ Shippori"),
    ("kaisei-tokumin", 400, "kj-kaisei-400.woff2", "KJ Kaisei"),
]


# 札の字体の範囲から外す字（KJ-116）。辶 U+8FB6 は Shippori にあるが点2つの形なので、kj-glyphs（点1つ）に落とす。範囲から外すだけで、字体ファイルの中身は今のまま
NO_PAPER = {"\u8fb6"}


def wide(s):
    return {c for c in s if ord(c) >= 0x3000 or c in "　、。「」（）"}


def read(path):
    return open(os.path.join(ROOT, path), encoding="utf-8").read()


def card_chars():
    txt = ""
    for f in ["kanji", "words", "parts", "proper_names", "special", "radical_meanings", "radical_forms", "readings",
              "split_shapes", "cycles", "antonyms"]:
        p = os.path.join(ROOT, "data", f + ".json")
        if os.path.exists(p):
            txt += open(p, encoding="utf-8").read()
    return wide(txt)


def ui_chars():
    txt = ""
    for p in ["index.html", "js/strings.js", "js/core.js", "data/tutorial.json", "data/rules.json"]:
        txt += read(p)
    return wide(txt) | card_chars() | set(chr(c) for c in range(0x20, 0x7F)) | set(chr(c) for c in range(0x30A1, 0x30F7)) | {"ー", "—"}  # カタカナ全部（戦況の読み。KJ-094）／— は表紙の副題（KJ-109。U+3000 より下なので wide に入らない）


def lead_chars():
    """表紙の説明文（js/strings.js の TEXT.lead。KJ-101）の字と 0〜9。札の字の切り替えに関わらず、いつも大正風（Kaisei）で出す"""
    m = re.search(r"^\s*lead:.*$", read("js/strings.js"), re.M)
    return {c for c in (m.group(0) if m else "") if ord(c) >= 0x3000} | set("0123456789")


def stamp_chars():
    """はじかれたときの判子（#nope .no-ic。KJ-104）の字「否」。札の字の切り替えに関わらず、いつも大正風（Kaisei）で出す"""
    return {"否"}


def build(name, weight, out, family, chars):
    d = glob.glob(os.path.join(SRC, "*" + name + "*", "package", "files"))
    if not d:
        sys.exit("元の字体が無い：%s（使い方は先頭の説明）" % name)
    files = sorted(glob.glob(os.path.join(d[0], "%s-*-%d-normal.woff" % (name, weight))))
    files = [f for f in files if os.path.basename(f)[len(name) + 1:].split("-")[0].isdigit()]
    parts, got = [], set()
    for f in files:
        cm = TTFont(f).getBestCmap()
        need = {c for c in chars if ord(c) in cm and c not in got}
        if not need:
            continue
        opt = subset.Options()
        opt.layout_features = []
        opt.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
        opt.notdef_outline = True
        opt.glyph_names = False
        font = subset.load_font(f, opt)
        s = subset.Subsetter(opt)
        s.populate(text="".join(sorted(need)))
        s.subset(font)
        tmp = os.path.join("/tmp", "kjpaper_%s_%d_%d.ttf" % (name, weight, len(parts)))
        font.flavor = None
        font.save(tmp)
        parts.append(tmp)
        got |= need
    m = merge.Merger(options=merge.Options(drop_tables=["DSIG"]))
    font = m.merge(parts)
    font.flavor = "woff2"
    path = os.path.join(ROOT, "fonts", out)
    font.save(path)
    miss = sorted(c for c in chars if c not in got)
    return got, miss, os.path.getsize(path)


def main():
    cards = card_chars()
    ui = ui_chars()
    css = ["/* KJ-093：tools/build_paper_fonts.py が作る。新聞紙風の見た目の字体（要る字だけ）。Zen Old Mincho・Shippori Mincho・Kaisei Tokumin（SIL OFL 1.1。fonts/OFL-Paper.txt） */"]
    for name, weight, out, family in FONTS:
        chars = ui if family == "KJ Zen" else cards
        if family == "KJ Kaisei":
            chars = cards | lead_chars() | stamp_chars()  # 説明文（#lead。KJ-101）の字と、判子の「否」（KJ-104）を足す
        got, miss, size = build(name, weight, out, family, chars)
        rng = ",".join("U+%X" % ord(c) for c in sorted(got - NO_PAPER))
        css.append('@font-face{font-family:"%s";font-weight:%d;src:url("%s") format("woff2");unicode-range:%s;font-display:swap}' % (family, weight, out, rng))
        print("%s %d：%d字 %d バイト／この字体に無い字 %d：%s" % (name, weight, len(got), size, len(miss), "".join(miss)[:80]))
    open(os.path.join(ROOT, "fonts", "kj-paper.css"), "w", encoding="utf-8").write("\n".join(css) + "\n")


if __name__ == "__main__":
    main()
