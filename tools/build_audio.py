#!/usr/bin/env python3
"""試合の曲と針の音を作る（KJ-133）。元は audio/src/（加工しない）。出力は audio/ に別名で置く。
  audio/bgm.mp3     … The Japanese Sandman（モノラル 32kHz 48kbps・-18 LUFS・終わりの無音を切る）
  audio/needle.mp3  … 針を落とす音（モノラル・ピーク -4 dBFS）
  audio/noise.wav   … 頭の針のノイズから作った「ノイズの輪」（規則正しく聞こえないよう、粒を並べ替えて重ねた 6 秒。つなぎ目なし）
使い方：python3 tools/build_audio.py（要 ffmpeg・numpy）。出番の時刻（曲が鳴り出す所）などは data/rules.json の bgm。"""
import subprocess, sys, re, json, wave
import numpy as np

SRC = "audio/src/"; OUT = "audio/"
TARGET_LUFS = -18.0
SONG_END_SEC = 172.0      # この先は無音（元は約 2:52 で曲が終わり、3:05 まで無音）
NOISE_FROM, NOISE_TO = 1.0, 2.15   # 針のノイズだけが安定して鳴っている所（曲は約 2.3 秒から）
LOOP_SEC, GRAIN_SEC, FADE_SEC, SEED = 6.0, 1.0, 0.25, 133
SR_NOISE = 12000

def run(*a): return subprocess.run(a, capture_output=True, check=True)

def lufs(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", r)[-1])

def gain_db(path): return TARGET_LUFS - lufs(path)

def decode(path, sr, t0=0, t1=None):
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr)]
    if t1 is not None: cmd += ["-ss", str(t0), "-to", str(t1)]
    return np.frombuffer(run(*cmd, "-f", "f32le", "-").stdout, dtype=np.float32).copy()

def encode(src, dst, gain, extra=()):
    run("ffmpeg", "-y", "-v", "error", "-i", src, *extra, "-af", f"volume={gain}dB,alimiter=limit=0.9", "-ac", "1", "-ar", "32000", "-c:a", "libmp3lame", "-b:a", "48k", dst)

g = gain_db(SRC + "japanese_sandman_whiteman_1920.mp3")
encode(SRC + "japanese_sandman_whiteman_1920.mp3", OUT + "bgm.mp3", g, ("-t", str(SONG_END_SEC)))
# 針の音は短い（ほぼクリック）なので、ラウドネスでなく山（ピーク）を -4 dBFS にそろえる
NEEDLE_PEAK_DB = -4.0
gn = NEEDLE_PEAK_DB - 20 * np.log10(np.abs(decode(SRC + "vinylstart.mp3", 32000)).max())
encode(SRC + "vinylstart.mp3", OUT + "needle.mp3", gn)

# ノイズの輪
x = decode(SRC + "japanese_sandman_whiteman_1920.mp3", SR_NOISE, NOISE_FROM, NOISE_TO) * (10 ** (g / 20))
rng = np.random.default_rng(SEED)
gl, fl, n = int(GRAIN_SEC * SR_NOISE), int(FADE_SEC * SR_NOISE), int(LOOP_SEC * SR_NOISE)
out = np.zeros(n + fl, dtype=np.float64)
pos = 0
while pos < n:
    s = int(rng.integers(0, len(x) - gl)); gr = x[s:s + gl].astype(np.float64)
    if rng.random() < 0.5: gr = gr[::-1]
    gr = gr * np.concatenate([np.sin(np.linspace(0, np.pi / 2, fl)), np.ones(gl - 2 * fl), np.cos(np.linspace(0, np.pi / 2, fl))])
    end = min(pos + gl, len(out)); out[pos:end] += gr[:end - pos]
    pos += gl - fl
# 輪のつなぎ：最後のはみ出しを頭に重ねる
loop = out[:n].copy(); loop[:fl] += out[n:n + fl]
loop = (loop / max(1e-9, np.abs(loop).max()) * 0.5).astype(np.float64)
with wave.open(OUT + "noise.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR_NOISE); w.writeframes((loop * 32767).astype("<i2").tobytes())
print("gain song %.2f dB, needle %.2f dB" % (g, gn))
