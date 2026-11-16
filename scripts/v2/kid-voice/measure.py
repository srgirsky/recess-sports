# ---------------------------------------------------------------------------
# Acoustic ruler for the kid-voice bake-off. Every candidate is scored by the
# same instrument. Prints JSON, one row per file.
#
#   f0 / f0_p10 / f0_p90   median and spread of F0 over voiced frames (Praat)
#   tract                  vocal-tract scale vs the ADULT-FEMALE reference:
#                          1.00 = an adult woman's formants, 1.15 = formants
#                          15% higher (a ~13% shorter tract). Peterson &
#                          Barney (1952) children sit ~1.14-1.18 over women.
#   hnr                    mean harmonics-to-noise, dB: a crude roughness
#                          proxy, never a naturalness score
#
# Why not absolute formant frequencies: Burg tracking needs a ceiling matched
# to the speaker, and both obvious recipes lied on this material. One fixed
# ceiling read an adult's F2 off its F3, so a transformed take looked LOWER
# than its own source; choosing each take's "steadiest" ceiling (Escudero et
# al. 2009) picked 4500 Hz for every child-range take, which merges formants.
# The tract scale sidesteps tracking: it averages WORLD's F0-adaptive spectral
# envelope over voiced frames (so harmonic spacing does not leak in) and finds
# the frequency stretch that best lays it over the reference envelope. It was
# checked against takes with a KNOWN applied stretch before being trusted
# (see docs/research/kid-voices.md).
# ---------------------------------------------------------------------------
import argparse, json, os, sys
import numpy as np
import soundfile as sf
import pyworld as pw
import parselmouth

FS = 24000
BAND = (300.0, 5500.0)  # where formant structure lives; above it is noise and codec
ALPHAS = np.arange(0.80, 1.50001, 0.005)
GRID = np.linspace(np.log(BAND[0]), np.log(BAND[1]), 400)  # log-frequency axis


def load(path):
    x, fs = sf.read(path, always_2d=True)
    x = x.mean(axis=1)
    if fs != FS:
        from scipy.signal import resample_poly
        g = np.gcd(int(fs), FS)
        x = resample_poly(x, FS // g, int(fs) // g)
    return x.astype(np.float64)


def envelope(path):
    """Mean log spectral envelope on a log-frequency grid, level-normalised."""
    x = load(path)
    f0, t = pw.harvest(x, FS, f0_floor=60, f0_ceil=700, frame_period=5)
    sp = pw.cheaptrick(x, f0, t, FS)[f0 > 0]
    freqs = np.linspace(0, FS / 2, sp.shape[1])
    mean = np.log(np.mean(sp, axis=0) + 1e-12)
    return freqs, mean


def on_grid(freqs, logenv, alpha=1.0):
    """The envelope sampled at grid frequency f, after stretching it by alpha."""
    e = np.interp(np.exp(GRID) / alpha, freqs, logenv)
    return e - e.mean()


def tract_scale(env, ref):
    """alpha such that env(f) ~= ref(f / alpha)."""
    target = on_grid(*env)
    errs = [np.mean((target - on_grid(*ref, a)) ** 2) for a in ALPHAS]
    return float(ALPHAS[int(np.argmin(errs))])


def f0_stats(path):
    snd = parselmouth.Sound(path)
    f0 = snd.to_pitch_ac(time_step=0.01, pitch_floor=75, pitch_ceiling=700).selected_array['frequency']
    v = f0[f0 > 0]
    hnr = parselmouth.praat.call(snd.to_harmonicity_cc(0.01, 75, 0.1, 1.0), 'Get mean', 0, 0)
    return {'f0': round(float(np.median(v)), 1), 'f0_p10': round(float(np.percentile(v, 10)), 1),
            'f0_p90': round(float(np.percentile(v, 90)), 1), 'hnr': round(float(hnr), 1),
            'dur': round(snd.duration, 2)}


def reference(paths):
    envs = [envelope(p) for p in paths]
    freqs = envs[0][0]
    return freqs, np.mean([e for _, e in envs], axis=0)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+')
    ap.add_argument('--ref', nargs='+', required=True, help='adult-female reference takes')
    a = ap.parse_args()
    ref = reference(a.ref)
    rows = [{'file': f, **f0_stats(f), 'tract': round(tract_scale(envelope(f), ref), 3)} for f in a.files]
    json.dump(rows, sys.stdout, indent=1)
