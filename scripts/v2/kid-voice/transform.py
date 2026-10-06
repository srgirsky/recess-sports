# ---------------------------------------------------------------------------
# Adult-to-child voice transforms for the kid-voice bake-off.
#
# Why pitch alone fails: a child differs from an adult in TWO independent
# acoustic dimensions. F0 (how fast the vocal folds buzz) is higher, and the
# formants (the resonances of a shorter vocal tract) are higher too. Raising
# only F0 keeps an adult-sized throat behind a high buzz -- the "adult doing a
# kid impression" sound. Raising both by the SAME factor (plain speed-up /
# resample) gives the chipmunk. A child is roughly: F0 up a lot, formants up a
# moderate, separate amount. Every method below takes the two factors apart:
#
#   --f0-target  median F0 to land on, Hz (the take's own median is measured)
#   --formant    vocal-tract scale factor, e.g. 1.15 = 15% shorter tract
#   --range      widen (>1) or narrow (<1) the F0 excursion around its median
#
# Methods:
#   world      WORLD vocoder (pyworld): F0 rewritten, spectral envelope and
#              aperiodicity warped along frequency. Most control, can buzz.
#   praat      Praat "Change gender" (PSOLA + resampling) via parselmouth.
#   rubberband resample by the formant factor (moves everything), then Rubber
#              Band R3 restores duration and corrects pitch with formants
#              PRESERVED -- so the net formant move is exactly the resample.
#
#   python transform.py in.wav out.wav --method world --f0-target 290 --formant 1.15
# ---------------------------------------------------------------------------
import argparse, os, subprocess, tempfile
import numpy as np
import soundfile as sf
import parselmouth
from parselmouth.praat import call


def median_f0(path):
    snd = parselmouth.Sound(path)
    f0 = snd.to_pitch_ac(time_step=0.01, pitch_floor=75, pitch_ceiling=600).selected_array['frequency']
    return float(np.median(f0[f0 > 0]))


def warp_freq(env, alpha):
    """Stretch an envelope (frames x bins) up the frequency axis by alpha."""
    bins = env.shape[1]
    src = np.arange(bins) / alpha
    out = np.empty_like(env)
    for i in range(env.shape[0]):
        out[i] = np.interp(src, np.arange(bins), env[i], right=env[i, -1])
    return out


def world(x, fs, ratio, alpha, rng):
    import pyworld as pw
    x = x.astype(np.float64)
    f0, t = pw.harvest(x, fs, f0_floor=60, f0_ceil=700, frame_period=5)
    sp = pw.cheaptrick(x, f0, t, fs)
    ap = pw.d4c(x, f0, t, fs)
    voiced = f0 > 0
    logf = np.log(f0[voiced])
    centre = np.median(logf)
    f0[voiced] = np.exp(centre + (logf - centre) * rng) * ratio
    sp = warp_freq(sp, alpha)
    ap = np.clip(warp_freq(ap, alpha), 0, 1)
    return pw.synthesize(f0, sp, ap, fs, frame_period=5)


def praat(path, target, alpha, rng):
    snd = parselmouth.Sound(path)
    out = call(snd, 'Change gender', 75, 600, alpha, target, rng, 1.0)
    return out.values[0], int(out.sampling_frequency)


def rubberband(path, ratio, alpha):
    x, fs = sf.read(path)
    with tempfile.TemporaryDirectory() as d:
        moved = os.path.join(d, 'moved.wav')
        fixed = os.path.join(d, 'fixed.wav')
        # Resample: play the take alpha-times faster -> F0 and formants x alpha.
        sf.write(moved, x, int(round(fs * alpha)))
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', moved, '-ar', str(fs), fixed], check=True)
        out = os.path.join(d, 'out.wav')
        # Restore duration (x alpha longer) and finish the pitch move with the
        # (already moved) formants held still.
        subprocess.run(['rubberband', '-q', '-3', '-F', '-t', str(alpha), '-f', str(ratio / alpha), fixed, out], check=True)
        y, fs2 = sf.read(out)
    return y, fs2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--method', choices=['world', 'praat', 'rubberband'], required=True)
    ap.add_argument('--f0-target', type=float, required=True)
    ap.add_argument('--formant', type=float, required=True)
    ap.add_argument('--range', type=float, default=1.0)
    a = ap.parse_args()
    ratio = a.f0_target / median_f0(a.src)
    if a.method == 'world':
        x, fs = sf.read(a.src)
        y = world(x, fs, ratio, a.formant, a.range)
    elif a.method == 'praat':
        y, fs = praat(a.src, a.f0_target, a.formant, a.range)
    else:
        y, fs = rubberband(a.src, ratio, a.formant)
    peak = np.max(np.abs(y)) or 1
    sf.write(a.dst, (y / peak * 0.89).astype(np.float32), fs)


if __name__ == '__main__':
    main()
