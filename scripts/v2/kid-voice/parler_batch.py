# ---------------------------------------------------------------------------
# Parler-TTS: a voice DESCRIBED in words rather than cloned or picked from a
# stock list. Research tooling for the kid-voice bake-off; reads a JSON job
# list [{text, description, out, seed}] and writes WAVs.
#   .cache/kv-parler/bin/python scripts/v2/kid-voice/parler_batch.py jobs.json
# ---------------------------------------------------------------------------
import json, os, sys
import torch, soundfile as sf
from parler_tts import ParlerTTSForConditionalGeneration
from transformers import AutoTokenizer

MODEL = os.environ.get('PARLER_MODEL', '.cache/models/parler-tts/parler-tts-mini-v1')
device = os.environ.get('KV_DEVICE') or ('mps' if torch.backends.mps.is_available() else 'cpu')
model = ParlerTTSForConditionalGeneration.from_pretrained(MODEL).to(device)
tok = AutoTokenizer.from_pretrained(MODEL)
for job in json.load(open(sys.argv[1])):
    torch.manual_seed(job.get('seed', 0))
    desc = tok(job['description'], return_tensors='pt').to(device)
    prompt = tok(job['text'], return_tensors='pt').to(device)
    audio = model.generate(input_ids=desc.input_ids, attention_mask=desc.attention_mask,
                           prompt_input_ids=prompt.input_ids, prompt_attention_mask=prompt.attention_mask)
    os.makedirs(os.path.dirname(job['out']), exist_ok=True)
    sf.write(job['out'], audio.cpu().numpy().squeeze(), model.config.sampling_rate)
    print('✓', job['out'], flush=True)
