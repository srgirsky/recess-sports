# ---------------------------------------------------------------------------
# Chatterbox (Resemble AI, MIT): an expressive TTS that takes its voice from a
# short reference clip. Rule: the reference is ALWAYS synthetic -- a
# transformed Kokoro stock voice from this bake-off -- never a recording of a
# real person, and never a child. Every output carries Resemble's inaudible
# Perth watermark. Job list: [{text, ref, out, exaggeration, cfg, seed}].
#   .cache/kv-chatterbox/bin/python scripts/v2/kid-voice/chatterbox_batch.py jobs.json
# ---------------------------------------------------------------------------
import json, os, sys
import torch, torchaudio

device = os.environ.get('KV_DEVICE') or ('mps' if torch.backends.mps.is_available() else 'cpu')
_load = torch.load
torch.load = lambda *a, **k: _load(*a, **{**k, 'map_location': torch.device(device)})
from chatterbox.tts import ChatterboxTTS

model = ChatterboxTTS.from_local(os.environ.get('CHATTERBOX_DIR', '.cache/models/ResembleAI/chatterbox'), device)
for job in json.load(open(sys.argv[1])):
    torch.manual_seed(job.get('seed', 0))
    wav = model.generate(job['text'], audio_prompt_path=job['ref'],
                         exaggeration=job.get('exaggeration', 0.6), cfg_weight=job.get('cfg', 0.5))
    os.makedirs(os.path.dirname(job['out']), exist_ok=True)
    torchaudio.save(job['out'], wav.cpu(), model.sr)
    print('✓', job['out'], flush=True)
