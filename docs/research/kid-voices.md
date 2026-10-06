# Kid voices — free, local options and the bake-off (October 2026)

**Goal.** Every voice in Recess Sports should sound like a believable kid aged
about 6–10, using free tools only. The two booth announcers should sound like
believable adults.

**Hard rules this research was held to:**

- Free, and running locally on the maintainer's Apple Silicon Mac. No paid or
  cloud service.
- The code licence AND the model-weight licence must both allow shipping the
  audio in a free public game.
- Never clone a real person, and especially never a real child.
- Keep the AI-voice disclosure and provenance records truthful.

This file covers phase A (research) and phase B (bake-off). Phase C, the
pipeline for all 30 kids plus the switch in Classic, waits on Seth picking an
approach by ear.

## Where we are today (measured, not asserted)

Two banks ship:

- **v2:** 30 one-line draft takes plus 7 booth calls in
  `public/v2/audio/voices/`. Six kids are Kokoro stock voices
  (`AI_VOICE_CAST` in `scripts/v2/ai-voice-cast.mjs`). The other 24 kids and
  both announcers are macOS `say` voices (`export-voices.mjs`).
- **v1 Classic:** browser SpeechSynthesis. It is a different voice on every
  device, so nothing can be measured once for everyone.

Median F0 of the shipped draft lines, measured with
`scripts/v2/kid-voice/measure.py`:

| Kid | Shipped voice | Median F0 |
|---|---|---|
| Junebug | Kokoro `af_bella` | 194 Hz |
| Big Talk Theo | Kokoro `am_puck` | 112 Hz |
| Zoom Ramirez | Kokoro `am_michael` | 116 Hz |

Peterson & Barney's children average about 264 Hz. Theo and Zoom are
adult-male pitch, and Junebug is adult-female. No Kokoro stock voice is a
child: all 54 are adults, tagged only 🚺/🚹 in
[VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md).

## Why pitch-shifting alone sounds like an adult doing an impression

A child's voice differs from an adult's in two independent ways:

1. **F0, the buzz of the vocal folds, is higher.**
2. **The formants are higher.** Formants are the resonances of the vocal tract,
   and a child's tract is shorter.

Peterson & Barney (1952, JASA 24:175,
[doi:10.1121/1.1906875](https://doi.org/10.1121/1.1906875)) averaged from the
published data:

| | Mean F0 | F1 | F2 | F3 |
|---|---|---|---|---|
| Men | 131 Hz | 500 | 1425 | 2382 |
| Women | 223 Hz | 578 | 1695 | 2782 |
| Children | 264 Hz | 675 | 1931 | 3285 |

Relative to women, children's F0 is ×1.19 and their formants ×1.14–1.18.
Relative to men, F0 is ×2.0 and formants ×1.35–1.38.

Lee, Potamianos & Narayanan (1999, JASA 105:1455,
[doi:10.1121/1.426686](https://doi.org/10.1121/1.426686)) find boy and girl
formant patterns only start to diverge around age 11. So one ungendered scale
is defensible for ages 6–10. Boy versus girl is then carried mostly by
casting, pitch placement and delivery.

**The three ways to raise a voice:**

- **Speed-up or resample.** F0 and formants move by the SAME factor. That is
  the chipmunk.
- **Pitch shift that preserves formants.** F0 rises, but an adult-sized throat
  stays behind it. That is the impression.
- **What a child needs.** F0 up a lot, and formants up a separate, smaller
  amount. Every approach below is judged on whether it can do that.

## Phase A — the options, with licences

All licences were checked against primary sources on 2026-10-03. "OK" means
both code and weights allow using the generated audio in a free public game.

| Tool | Code licence | Weights licence | Child voice? | Mac (Apple Silicon) | Verdict |
|---|---|---|---|---|---|
| **Kokoro-82M** (already in the repo) | Apache-2.0 ([hexgrad/kokoro](https://github.com/hexgrad/kokoro)); kokoro-js Apache-2.0 | apache-2.0 ([HF card](https://huggingface.co/hexgrad/Kokoro-82M), [ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)) | No, adults only | Runs today via kokoro-js on CPU | **OK** as the source performance |
| **WORLD / pyworld** | pyworld MIT ([repo](https://github.com/JeremyCCHsu/Python-Wrapper-for-World-Vocoder)); WORLD modified BSD-3 ([LICENSE](https://github.com/mmorise/World/blob/master/LICENSE.txt)) | none | Transform only | Built from source for Python 3.11; CPU; tiny | **OK** |
| **Praat / parselmouth** | GPL-3.0 ([Parselmouth](https://github.com/YannickJadoul/Parselmouth), [Praat](https://github.com/praat/praat#21-license)) | none | Transform only | arm64 wheels | **OK as an offline tool.** The GPL covers distributing the program, not its output ([GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html#GPLOutput)). Never bundle it. |
| **Rubber Band** | GPL-2.0-or-later or commercial ([README](https://github.com/breakfastquay/rubberband#licence)) | none | Transform only | Homebrew CLI 4.0.0 | **OK as an offline tool.** The CLI can only *preserve* formants; setting a formant *scale* needs the library ([header](https://github.com/breakfastquay/rubberband/blob/default/rubberband/RubberBandStretcher.h)). The bake-off works around this with a resample (see below). |
| **Parler-TTS** (voice described in text) | Apache-2.0 ([repo](https://github.com/huggingface/parler-tts)) | apache-2.0 ([mini-v1](https://huggingface.co/parler-tts/parler-tts-mini-v1)); trained on CC-BY-4.0 audiobook data ([MLS](https://huggingface.co/datasets/parler-tts/mls_eng), [LibriTTS-R](https://huggingface.co/datasets/parler-tts/libritts_r_filtered)) | **No.** The training speakers are adult audiobook readers and the descriptions have no age field ([dataspeech](https://github.com/huggingface/dataspeech)) | MPS and CPU; ~3.5 GB weights | **OK**, but it can only describe an adult |
| **Chatterbox** (Resemble AI) | MIT ([repo](https://github.com/resemble-ai/chatterbox)) | mit ([HF](https://huggingface.co/ResembleAI/chatterbox)) | Clones its reference clip, so the child comes from whatever reference it is given | MPS; ~3.2 GB weights | **OK when the reference is synthetic.** Every output carries Resemble's inaudible Perth watermark ([README](https://github.com/resemble-ai/chatterbox#built-in-perth-watermarking-for-responsible-ai)), which supports, not replaces, our disclosure. |
| **StyleTTS2** | MIT ([README](https://github.com/yl4579/StyleTTS2#license)) | No licence field on the [LibriTTS card](https://huggingface.co/yl4579/StyleTTS2-LibriTTS). The README adds a condition to tell listeners the speech is synthesized | No | CPU / MPS | **Not shortlisted.** Ambiguous weights licence plus an extra condition, and no child voice to offset that |
| **Piper** | rhasspy/piper MIT (archived); successor [piper1-gpl](https://github.com/OHF-Voice/piper1-gpl) GPL-3.0 | Varies per voice ([piper-voices](https://huggingface.co/rhasspy/piper-voices)). Some are CC BY-NC-SA, which is non-commercial | None found | arm64 wheels | **Not shortlisted.** Adult voices, uneven licences, flatter prosody than Kokoro |
| **RVC** (voice conversion) | MIT ([repo](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI)) | Base files mit ([HF](https://huggingface.co/lj1995/VoiceConversionWebUI)); HuBERT apache-2.0 | Needs a trained *target* kid model | Not documented for Mac | **Not shortlisted.** The only rule-safe training data would be our own transformed Kokoro voices, so it converts *to* exactly what approach A already produces. Seed-VC is GPL-3.0; OpenVoice v2 is MIT. Both have the same circularity. |

**Excluded on licence:**

- F5-TTS: weights [cc-by-nc-4.0](https://huggingface.co/SWivid/F5-TTS).
- XTTS-v2: [Coqui CPML](https://coqui.ai/cpml), non-commercial.
- MaskGCT: [cc-by-nc-4.0](https://huggingface.co/amphion/MaskGCT).
- VibeVoice: [research use only](https://huggingface.co/microsoft/VibeVoice-1.5B).
- IndexTTS-2: [custom bilibili terms](https://github.com/index-tts/index-tts/blob/main/LICENSE).
- Higgs Audio v2: [custom terms with a user cap](https://huggingface.co/bosonai/higgs-audio-v2-generation-3B-base/blob/main/LICENSE).

**Licence-OK but not shortlisted:** none of these offers a child voice, and
none beats Kokoro as a source.

- Bark (MIT)
- MeloTTS (MIT)
- Kitten TTS (Apache-2.0)
- Dia (Apache-2.0)
- Zonos (Apache-2.0)
- Sesame CSM-1B (Apache-2.0, gated)
- Kyutai TTS (CC-BY-4.0)

Orpheus's licence is ambiguous: the card says apache-2.0 but it is tagged
llama.

**What the market shows:** no free, licence-clean model ships a child voice.
Every viable path is either "transform an adult synthetic voice" or "have an
expressive model re-perform a transformed one".

## Phase B — the bake-off

**Setup:**

- **Kids:** Junebug (girl, dry and precise), Big Talk Theo (boy, bright
  braggart) and Zoom Ramirez (boy, relaxed and cool).
- **Lines:** each kid's own draft line, plus three shared lines so the kids
  can be compared directly: "Hey batter batter, swing!", "I got it! I got
  it!" and "Aww, no fair. Next time!".
- **Casting per kid** is in `KIDS` in `scripts/v2/kid-voice/bakeoff.py`.
- **Kokoro sources:** female stock voices for all three. A female source needs
  only the women-to-children move, about F0 ×1.2–1.4 and formants ×1.13–1.17.
  A male source needs about F0 ×2.4 and formants ×1.33, a far bigger warp. That
  male-source route is included as an extra so the ear can judge the trade.

**Approaches compared:**

| Column | What it is |
|---|---|
| **Today** | The shipped MP3 for the draft line. For the shared lines, the kid's current `AI_VOICE_CAST` voice and speed. |
| **A · Kokoro + WORLD** | WORLD analysis. F0 is rewritten to the target median, with its excursion widened or narrowed. The spectral envelope and aperiodicity are stretched up the frequency axis by the formant factor. Most control; the risk is vocoder buzz. |
| **B · Kokoro + Praat** | Praat's "Change gender" (PSOLA plus resampling) with the same F0 target and formant factor. |
| **C · Parler-TTS + Praat lift** | A voice described in words, then the same lift as B. Parler alone can only describe an adult (raw takes are under Extras). |
| **D · Chatterbox** | Chatterbox re-performs each line, cloning a reference clip that is the kid's own approach-A voice reading a longer passage. Synthetic all the way down. Exaggeration is set per kid. |

**Extras:**

- Kokoro + Rubber Band: resample by the formant factor, then R3 restores the
  duration and corrects the pitch with formants preserved.
- Raw Parler.
- For the boys only, a male Kokoro source pushed through WORLD.

**Fairness:** every take on the page is loudness-matched to −18 LUFS.

**Measurement** (`scripts/v2/kid-voice/measure.py`):

- **F0:** Praat's autocorrelation pitch tracker; median plus the 10th–90th
  percentile range.
- **Tract:** the frequency stretch that best overlays a take's mean WORLD
  spectral envelope on its own source's envelope.

**The ruler was checked before it was trusted.** Stretches applied with a known
value were read back as follows:

| Applied | Read |
|---|---|
| 1.05 | 1.045 |
| 1.10 | 1.100 |
| 1.20 | 1.210 |

**Two rulers were rejected first:**

- **Absolute formant tracking at one fixed ceiling.** It read a transformed
  take's F2 *below* its adult source's.
- **Per-take "steadiest ceiling" selection (Escudero et al. 2009).** It picked
  the floor ceiling for every child-range take.

The tract ruler is also **not** valid *across* speakers: comparing stock voices
to each other, it pinned to its search bounds. So tract is reported only where
a take has a same-speaker source, i.e. A, B, C's lift, Rubber Band and the
male-source extra. Today's and Chatterbox's columns show F0 only.

### Results

Medians are taken over the four lines.

- **F0 range:** the lowest 10th and highest 90th percentile across the four
  lines.
- **Tract:** the min–max across the four lines.
- **HNR:** the mean.

Raw rows are in `measurements.json` beside the page.

| Kid | Approach | Median F0 | F0 per line | F0 range | Tract | HNR dB |
|---|---|---|---|---|---|---|
| Junebug (target 275 Hz, ×1.17) | Today | 197 | 194 / 202 / 194 / 200 | 84–249 | – | 12.7 |
| | A WORLD | 274 | 267 / 278 / 269 / 280 | 227–343 | 1.17–1.18 | 15.1 |
| | B Praat | 272 | 266 / 277 / 265 / 283 | 120–352 | 1.17–1.19 | 13.7 |
| | C Parler + lift | 273 | 270 / 253 / 274 / 294 | 194–374 | 1.17–1.19 | 16.6 |
| | D Chatterbox | 275 | 295 / 250 / 316 / 254 | 128–390 | – | 16.9 |
| Theo (target 285 Hz, ×1.13) | Today | 124 | 112 / 129 / 119 / 127 | 88–147 | – | 8.9 |
| | A WORLD | 285 | 264 / 282 / 287 / 304 | 167–431 | 1.14 | 13.2 |
| | B Praat | 286 | 264 / 283 / 288 / 304 | 152–418 | 1.13–1.14 | 12.0 |
| | C Parler + lift | 286 | 253 / 318 / 356 / 240 | 200–631 | 1.14–1.16 | 13.8 |
| | D Chatterbox | 263 | 275 / 245 / 328 / 250 | 157–426 | – | 11.3 |
| Zoom (target 250 Hz, ×1.13) | Today | 117 | 116 / 117 / 109 / 116 | 89–157 | – | 8.4 |
| | A WORLD | 246 | 245 / 246 / 240 / 253 | 177–325 | 1.13–1.15 | 18.1 |
| | B Praat | 250 | 246 / 252 / 241 / 255 | 200–330 | 1.13–1.15 | 15.9 |
| | C Parler + lift | 241 | 229 / 235 / 293 / 246 | 170–358 | 1.12–1.15 | 14.3 |
| | D Chatterbox | 234 | 241 / 239 / 228 / 217 | 198–292 | – | 16.2 |

**Extras:**

- **Rubber Band** lands within 0.01–0.03 of each formant target. It
  undershoots slightly on Junebug and Theo, because R3's formant preservation
  is not exact.
- **Raw Parler** medians are 212–234 Hz even when described as
  "high-pitched": an adult woman's voice.
- **Male-source boys** reach the ×1.33 tract move. Zoom's HNR drops to 12.2 dB.

**What the numbers can say** (not a ranking — that is by ear):

1. **Every transform did what it claimed.** A, B and C land F0 within about
   10 Hz of target and the tract within about 0.03. So any failure Seth hears
   is a failure of the *idea*, not of the implementation.
2. **One mistake was caught before listening.** The first render re-centred
   each line on the target, which flattened a shout and a sulk to the same
   pitch: every line was 271–276 Hz for Junebug. The bake-off now applies one
   pitch ratio per kid, so lines keep their own rise and fall.
3. **Possible PSOLA glitch in B (Praat).** B's range drops to 120 Hz on
   Junebug and 152 Hz on Theo, where A stays above 167 Hz from the same
   sources. That is the signature of pitch-period errors. Listen for creak or
   roughness in B on those lines.
4. **C (Parler) gives the most varied delivery and also overshoots.** Theo's
   lines run 240–356 Hz with a 631 Hz top, so listen for squeaks. Parler's
   voice can also drift line to line even with a named speaker and a fixed
   seed. Its clips are 23–31% shorter (faster) than Kokoro's.
5. **D (Chatterbox) is the only approach that re-performs rather than
   transforms.** Its per-line F0 varies the most of any approach: "I got it!"
   is the highest line for Junebug and Theo, though not for Zoom, whose lines
   drift downward. But both boys slid below target (Theo 263, Zoom 234):
   cloning pulls part-way back toward an adult. Theo's HNR is the lowest of any
   new take, so listen for roughness. It is also the heaviest tool (3.2 GB of
   weights) and stamps an inaudible watermark.
6. **Today's boys are adult men.** Their F0 is 117–124 Hz, half of a child's.
   Any column fixes more than it risks there.

**Cost and practicality** (matters for phase C's 30 kids × many lines):

- A and B are seconds per line on the CPU, with deterministic, reproducible
  output.
- C and D need multi-GB local models and a seed, and their takes are not
  bit-reproducible across library versions. That matters for the provenance
  records, which fingerprint shipped bytes.


### Reproduce

```bash
python3.11 -m venv .cache/kv-dsp && .cache/kv-dsp/bin/pip install numpy scipy soundfile pyworld praat-parselmouth
```

```bash
python3.11 -m venv .cache/kv-parler && .cache/kv-parler/bin/pip install git+https://github.com/huggingface/parler-tts.git soundfile
```

```bash
python3.11 -m venv .cache/kv-chatterbox && .cache/kv-chatterbox/bin/pip install chatterbox-tts
```

Weights go in `.cache/models/<repo>/`. Fetch them with resumable `curl -C -`
from `https://huggingface.co/<repo>/resolve/main/<file>`:

- Parler: `parler-tts/parler-tts-mini-v1`, every file.
- Chatterbox: `ResembleAI/chatterbox`, the files `ve` / `t3_cfg` / `s3gen`
  `.safetensors`, `tokenizer.json` and `conds.pt`.

The Python Hub downloader hung at 0 bytes on this network, so use curl.

```bash
.cache/kv-dsp/bin/python scripts/v2/kid-voice/bakeoff.py
```

```bash
open assets/v2/voice-auditions/kid-voice-bakeoff/index.html
```

Every output stays in the git-ignored audition inbox. Nothing in this phase
ships, changes `public/`, or touches the disclosure or provenance records.
