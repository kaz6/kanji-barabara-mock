#!/usr/bin/env python3
"""KJ-063：特別な語の演出（#fx .c）の字だけ、筆文字 Yuji Syuku にする。その字だけに絞った小さな字体（fonts/kj-fx.woff）を作る。

使い方：
  1. npm pack @fontsource/yuji-syuku && tar xzf fontsource-yuji-syuku-*.tgz   （どこか別のフォルダで）
  2. python3 tools/build_fx_font.py <展開したフォルダ>/package/files/yuji-syuku-japanese-400-normal.woff
     （引数を省くと、環境変数 YUJI_SYUKU か /tmp/yj/package/files/… を探す）
  字＝data/special.json の語に出る字（特別な語を足したら作り直す）。
出力：fonts/kj-fx.woff・fonts/kj-fx.css
Yuji Syuku：Kinuta Font Factory（書家 片岡祐慈の筆跡）。SIL OFL 1.1。ライセンス本文は fonts/OFL-YujiSyuku.txt。
"""
import json, os, sys
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.environ.get("YUJI_SYUKU", "/tmp/yj/package/files/yuji-syuku-japanese-400-normal.woff")


def fx_chars():
    sp = json.load(open(os.path.join(ROOT, "data", "special.json"), encoding="utf-8"))
    s = []
    for w in sp["special"]:
        for c in w["w"]:
            if c not in s:
                s.append(c)
    return s


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    if not os.path.exists(src):
        sys.exit("元の字体が無い：%s（使い方は先頭の説明）" % src)
    chars = fx_chars()
    cmap = TTFont(src).getBestCmap()
    miss = [c for c in chars if ord(c) not in cmap]
    if miss:
        sys.exit("Yuji Syuku に無い字：%s" % "".join(miss))
    opt = subset.Options()
    opt.flavor = "woff"
    opt.layout_features = []
    opt.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    opt.notdef_outline = True
    f = subset.load_font(src, opt)
    s = subset.Subsetter(opt)
    s.populate(text="".join(chars))
    s.subset(f)
    out = os.path.join(ROOT, "fonts", "kj-fx.woff")
    subset.save_font(f, out, opt)
    rng = ",".join("U+%X" % ord(c) for c in sorted(chars))
    css = ('/* KJ-063：tools/build_fx_font.py が作る。特別な語の演出（#fx .c）の字だけ。Yuji Syuku（OFL 1.1。fonts/OFL-YujiSyuku.txt） */\n'
           '@font-face{font-family:"KJ Fx";src:url("kj-fx.woff") format("woff");unicode-range:%s;font-display:block}\n' % rng)
    open(os.path.join(ROOT, "fonts", "kj-fx.css"), "w", encoding="utf-8").write(css)
    print("字：", "".join(chars), "／", os.path.getsize(out), "バイト →", out)


if __name__ == "__main__":
    main()
