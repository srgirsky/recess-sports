# ---------------------------------------------------------------------------
# Kid-voice bake-off: the same four lines for three contrasting kids, through
# every shortlisted approach, next to today's shipped voice, on one local
# listening page with pitch / vocal-tract measurements. Research tooling only:
# it writes to the git-ignored audition inbox and never touches `public/`.
#
#   .cache/kv-dsp/bin/python scripts/v2/kid-voice/bakeoff.py
#   open assets/v2/voice-auditions/kid-voice-bakeoff/index.html
#
# Environments (all local; see docs/research/kid-voices.md for licences):
#   .cache/kv-dsp        numpy, soundfile, pyworld, praat-parselmouth
#   .cache/kv-parler     parler-tts   (weights in .cache/models/parler-tts/...)
#   .cache/kv-chatterbox chatterbox-tts (weights in .cache/models/ResembleAI/...)
# Kokoro renders through the repo's own pinned kokoro-js (kokoro-batch.mjs).
#
# Every voice here is a stock or described SYNTHETIC voice. Chatterbox clones
# its reference clip, so its reference is always this script's own transformed
# Kokoro take -- never a recording of a person.
# ---------------------------------------------------------------------------
import html, json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'v2', 'voice-auditions', 'kid-voice-bakeoff')
RAW = os.path.join(OUT, 'raw')
PY = {k: os.path.join(ROOT, '.cache', f'kv-{k}', 'bin', 'python') for k in ('dsp', 'parler', 'chatterbox')}
sys.path.insert(0, HERE)
import transform  # noqa: E402

SHARED_LINES = ['Hey batter batter, swing!', 'I got it! I got it!', 'Aww, no fair. Next time!']

# Today's casting, read off AI_VOICE_CAST in ai-voice-cast.mjs (the draft line
# is the shipped MP3 itself; the shared lines are what that card would render).
KIDS = [
    {
        'id': 'nostrike', 'name': 'Junebug', 'gender': 'girl',
        'draft': 'Smart pick. I literally never miss!',
        'today': {'voice': 'af_bella', 'speed': 0.96},
        'brief': 'Grounded and precise; dry confidence.',
        'kokoro': {'voice': 'af_bella', 'speed': 1.0},
        'f0': 275, 'formant': 1.17, 'range': 1.0,
        'parler': 'Lea speaks in a high-pitched, clear and confident voice at a moderate pace. '
                  'The recording is very clear and close-up, with no background noise.',
        'exaggeration': 0.45,
        'ref_text': 'I never miss. Just saying. Watch the ball, that is the whole secret. '
                    'Smart pick, I literally never miss!',
    },
    {
        'id': 'calls_shot', 'name': 'Big Talk Theo', 'gender': 'boy',
        'draft': 'Best pick of your LIFE, right here!',
        'today': {'voice': 'am_puck', 'speed': 1.06},
        'brief': 'Bright and elastic; delighted self-belief.',
        'kokoro': {'voice': 'af_jessica', 'speed': 1.05},
        'f0': 285, 'formant': 1.13, 'range': 1.2,
        'parler': 'Jenna speaks in a high-pitched, bright and very animated voice at a fast pace. '
                  'The recording is very clear and close-up, with no background noise.',
        'exaggeration': 0.8,
        'ref_text': 'This one is going over the fence. Guaranteed! I called it. '
                    'Whatever happens, I called it. Best pick of your life, right here!',
        'male': {'voice': 'am_puck', 'speed': 1.06},
    },
    {
        'id': 'wheelchair_ace', 'name': 'Zoom Ramirez', 'gender': 'boy',
        'draft': 'Yes! Nobody hits my pitch. Nobody.',
        'today': {'voice': 'am_michael', 'speed': 0.98},
        'brief': 'Relaxed and inventive; a contained half-smile.',
        'kokoro': {'voice': 'af_nova', 'speed': 0.98},
        'f0': 250, 'formant': 1.13, 'range': 0.9,
        'parler': 'Emily speaks in a relaxed, calm and slightly playful voice at a moderate pace. '
                  'The recording is very clear and close-up, with no background noise.',
        'exaggeration': 0.4,
        'ref_text': 'Nobody hits the crazy ball. Even I do not know where it goes. '
                    'Yes! Nobody hits my pitch. Nobody.',
        'male': {'voice': 'am_michael', 'speed': 0.98},
    },
]

# A boy from an adult-MALE source needs roughly the men-to-children ratios of
# Peterson & Barney (F0 x2, formants x~1.35): a much bigger move than from a
# female source. Rendered as an extra so the ear can judge the trade.
MALE_FORMANT = 1.33

APPROACHES = [
    ('today', 'Today (shipped)'),
    ('world', 'A · Kokoro + WORLD'),
    ('praat', 'B · Kokoro + Praat'),
    ('parler', 'C · Parler-TTS + Praat lift'),
    ('chatterbox', 'D · Chatterbox (kid reference)'),
]
EXTRAS = [
    ('rubberband', 'Kokoro + Rubber Band'),
    ('parler_raw', 'Parler-TTS, no lift'),
    ('world_male', 'Kokoro male voice + WORLD'),
]


def lines(kid):
    return [kid['draft']] + SHARED_LINES


def p(*parts):
    return os.path.join(RAW, *parts)


def run(cmd, **kw):
    print('$', ' '.join(os.path.basename(c) if i == 0 else c for i, c in enumerate(cmd))[:160], flush=True)
    subprocess.run(cmd, check=True, cwd=ROOT, **kw)


def jobs_file(name, jobs):
    path = p(f'{name}.json')
    with open(path, 'w') as f:
        json.dump(jobs, f, indent=1)
    return path


def kokoro(jobs):
    jobs = [j for j in jobs if not os.path.exists(j['out'])]
    if jobs:
        run(['node', '--disable-warning=ExperimentalWarning', '--import', './scripts/v2/ts-resolve.mjs',
             'scripts/v2/kid-voice/kokoro-batch.mjs', jobs_file('kokoro', jobs)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def neural(kind, jobs):
    jobs = [j for j in jobs if not os.path.exists(j['out'])]
    if jobs:
        env = {**os.environ, 'HF_HUB_OFFLINE': '1', 'TOKENIZERS_PARALLELISM': 'false'}
        run([PY[kind], f'scripts/v2/kid-voice/{kind}_batch.py', jobs_file(kind, jobs)], env=env)


def kid_ratio(srcs, f0):
    """ONE pitch ratio per kid and source: the mean of its lines' medians is
    moved onto the target, so a shout stays higher than a sulk. Re-centring
    each line on the target separately flattened all four to the same pitch."""
    import numpy as np
    return f0 / float(np.exp(np.mean([np.log(transform.median_f0(s)) for s in srcs])))


def lift(method, src, dst, ratio, formant, rng):
    if os.path.exists(dst):
        return
    import numpy as np
    import soundfile as sf
    if method == 'world':
        x, fs = sf.read(src)
        y = transform.world(x, fs, ratio, formant, rng)
    elif method == 'praat':
        y, fs = transform.praat(src, transform.median_f0(src) * ratio, formant, rng)
    else:
        y, fs = transform.rubberband(src, ratio, formant)
    sf.write(dst, (y / (np.max(np.abs(y)) or 1) * 0.89).astype('float32'), fs)


def loudnorm(src, dst):
    """Same loudness for every take: the ear prefers the louder of two."""
    run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11',
         '-ar', '44100', '-ac', '1', dst])


def build():
    os.makedirs(RAW, exist_ok=True)
    kj, pj, cj = [], [], []
    for kid in KIDS:
        for i, text in enumerate(lines(kid)):
            if i:  # line 0 "today" is the shipped MP3
                kj.append({'text': text, **kid['today'], 'out': p(kid['id'], f'today_{i}.wav')})
            kj.append({'text': text, **kid['kokoro'], 'out': p(kid['id'], f'kokoro_{i}.wav')})
            if 'male' in kid:
                kj.append({'text': text, **kid['male'], 'out': p(kid['id'], f'male_{i}.wav')})
            pj.append({'text': text, 'description': kid['parler'], 'seed': 7, 'out': p(kid['id'], f'parler_raw_{i}.wav')})
        kj.append({'text': kid['ref_text'], **kid['kokoro'], 'out': p(kid['id'], 'ref_src.wav')})
    kokoro(kj)

    for kid in KIDS:
        srcs = [p(kid['id'], f'kokoro_{i}.wav') for i in range(4)]
        args = (kid_ratio(srcs, kid['f0']), kid['formant'], kid['range'])
        # Chatterbox's reference: the kid's WORLD-lifted Kokoro voice reading a
        # longer passage. Synthetic all the way down.
        lift('world', p(kid['id'], 'ref_src.wav'), p(kid['id'], 'ref_kid.wav'),
             kid['f0'] / transform.median_f0(p(kid['id'], 'ref_src.wav')), kid['formant'], kid['range'])
        for i, text in enumerate(lines(kid)):
            src = p(kid['id'], f'kokoro_{i}.wav')
            for m in ('world', 'praat', 'rubberband'):
                lift(m, src, p(kid['id'], f'{m}_{i}.wav'), *args)
            if 'male' in kid:
                male = [p(kid['id'], f'male_{j}.wav') for j in range(4)]
                lift('world', male[i], p(kid['id'], f'world_male_{i}.wav'),
                     kid_ratio(male, kid['f0']), MALE_FORMANT, kid['range'])
            cj.append({'text': text, 'ref': p(kid['id'], 'ref_kid.wav'), 'exaggeration': kid['exaggeration'],
                       'cfg': 0.5, 'seed': 7, 'out': p(kid['id'], f'chatterbox_{i}.wav')})
    neural('parler', pj)
    neural('chatterbox', cj)
    for kid in KIDS:
        raw = [p(kid['id'], f'parler_raw_{i}.wav') for i in range(4)]
        for i in range(4):
            lift('praat', raw[i], p(kid['id'], f'parler_{i}.wav'), kid_ratio(raw, kid['f0']), kid['formant'], kid['range'])
        shutil.copy(os.path.join(ROOT, 'public', 'v2', 'audio', 'voices', 'kids', f"{kid['id']}.mp3"),
                    p(kid['id'], 'today_0.mp3'))


def source_of(kid, key, i):
    """The same-speaker source a take was transformed from, if any."""
    if key in ('world', 'praat', 'rubberband'):
        return p(kid['id'], f'kokoro_{i}.wav')
    if key == 'world_male':
        return p(kid['id'], f'male_{i}.wav')
    if key == 'parler':
        return p(kid['id'], f'parler_raw_{i}.wav')
    return None


def take_path(kid, key, i):
    if key == 'today' and i == 0:
        return p(kid['id'], 'today_0.mp3')
    return p(kid['id'], f'{key}_{i}.wav')


def measure_all():
    import measure
    rows = {}
    for kid in KIDS:
        for key, _ in APPROACHES + EXTRAS:
            if key == 'world_male' and 'male' not in kid:
                continue
            for i in range(4):
                path = take_path(kid, key, i)
                row = measure.f0_stats(path)
                src = source_of(kid, key, i)
                # Tract scale is only trustworthy against the take's OWN source
                # (validated on known stretches); across speakers it is not.
                row['tract'] = round(measure.tract_scale(measure.envelope(path), measure.reference([src])), 3) if src else None
                rows[f"{kid['id']}/{key}/{i}"] = row
                print(kid['id'], key, i, row, flush=True)
    with open(os.path.join(OUT, 'measurements.json'), 'w') as f:
        json.dump(rows, f, indent=1)
    return rows


def publish():
    """Loudness-matched MP3 copies the page plays."""
    pub = os.path.join(OUT, 'audio')
    for kid in KIDS:
        os.makedirs(os.path.join(pub, kid['id']), exist_ok=True)
        for key, _ in APPROACHES + EXTRAS:
            if key == 'world_male' and 'male' not in kid:
                continue
            for i in range(4):
                dst = os.path.join(pub, kid['id'], f'{key}_{i}.mp3')
                if not os.path.exists(dst):
                    loudnorm(take_path(kid, key, i), dst)


def cell(kid, key, i, rows):
    r = rows[f"{kid['id']}/{key}/{i}"]
    tract = f" · tract ×{r['tract']:.2f}" if r['tract'] else ''
    return (f'<td><audio controls preload="none" src="audio/{kid["id"]}/{key}_{i}.mp3"></audio>'
            f'<div class="m">F0 {r["f0"]:.0f} Hz <span>({r["f0_p10"]:.0f}–{r["f0_p90"]:.0f})</span>{tract}</div></td>')


def page(rows):
    h = []
    for kid in KIDS:
        k = kid['kokoro']
        h.append(f'<section><h2>{html.escape(kid["name"])} <small>{kid["gender"]} · {html.escape(kid["brief"])}</small></h2>')
        h.append(f'<p class="cast">Kokoro source <b>{k["voice"]}</b> @ {k["speed"]}× → F0 target <b>{kid["f0"]} Hz</b>, '
                 f'formants ×<b>{kid["formant"]}</b>, range ×{kid["range"]} · Chatterbox exaggeration {kid["exaggeration"]} · '
                 f'Parler: “{html.escape(kid["parler"].split(".")[0])}.”</p>')
        h.append('<div class="scroll"><table><thead><tr><th>Line</th>' +
                 ''.join(f'<th class="{key}">{html.escape(lbl)}</th>' for key, lbl in APPROACHES) + '</tr></thead><tbody>')
        for i, text in enumerate(lines(kid)):
            h.append(f'<tr><th class="line">“{html.escape(text)}”</th>' + ''.join(cell(kid, key, i, rows) for key, _ in APPROACHES) + '</tr>')
        h.append('</tbody></table></div><details><summary>Extras (also measured)</summary><div class="scroll"><table><thead><tr><th>Line</th>')
        extras = [(key, lbl) for key, lbl in EXTRAS if key != 'world_male' or 'male' in kid]
        h.append(''.join(f'<th>{html.escape(lbl)}</th>' for _, lbl in extras) + '</tr></thead><tbody>')
        for i, text in enumerate(lines(kid)):
            h.append(f'<tr><th class="line">“{html.escape(text)}”</th>' + ''.join(cell(kid, key, i, rows) for key, _ in extras) + '</tr>')
        h.append('</tbody></table></div></details></section>')
    with open(os.path.join(HERE, 'bakeoff.html')) as f:
        template = f.read()
    with open(os.path.join(OUT, 'index.html'), 'w') as f:
        f.write(template.replace('<!--SECTIONS-->', '\n'.join(h)))
    print('page:', os.path.join(OUT, 'index.html'))


if __name__ == '__main__':
    build()
    rows = measure_all()
    publish()
    page(rows)
