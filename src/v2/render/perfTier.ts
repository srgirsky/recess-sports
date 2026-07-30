// ---------------------------------------------------------------------------
// Device tiering + dynamic resolution. Render-side only.
//
// Target devices: iPad 7th gen (A10), a ~$150 Android tablet, a 2019
// Chromebook. 60fps target, 30fps hard floor.
//
// The tier is a STARTING GUESS from device capabilities; the dynamic-resolution
// controller is what actually holds the frame rate, because capability probes
// lie constantly (an A10 iPad reports the same WebGL limits as a machine three
// times its speed, and `deviceMemory` is unavailable on iOS entirely).
// ---------------------------------------------------------------------------

export type PerfTier = 'low' | 'mid' | 'high';

export interface TierSettings {
  tier: PerfTier;
  /** Shadow map resolution. 0 disables shadow mapping (blob shadows only). */
  shadowMapSize: number;
  /** Crowd billboard instance count. */
  crowdCount: number;
  /** Added to every character's LOD index — 1 means "never use LOD0". */
  lodBias: number;
  /** Selective bloom + vignette. Only ever true on `high`. */
  postFx: boolean;
  /** Upper bound on devicePixelRatio. */
  maxPixelRatio: number;
  /** Outline width in CSS px. */
  outlinePx: number;
  /** Anisotropy for the field textures. */
  anisotropy: number;
}

const TIERS: Record<PerfTier, Omit<TierSettings, 'tier'>> = {
  low: {
    shadowMapSize: 0,
    crowdCount: 0,
    lodBias: 1,
    postFx: false,
    maxPixelRatio: 1,
    outlinePx: 2.0,
    anisotropy: 1,
  },
  mid: {
    shadowMapSize: 1024,
    crowdCount: 150,
    lodBias: 0,
    postFx: false,
    maxPixelRatio: 1.5,
    outlinePx: 2.0,
    anisotropy: 4,
  },
  high: {
    shadowMapSize: 2048,
    crowdCount: 400,
    lodBias: 0,
    postFx: true,
    maxPixelRatio: 2,
    outlinePx: 2.5,
    anisotropy: 8,
  },
};

function isTabletish(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  return /iPad|iPhone|Android|Tablet/i.test(ua) || iPadOS;
}

/** `?perf=low|mid|high` forces a tier — the first thing to reach for when a
 *  device behaves differently from what the probe guessed. */
function forcedTier(): PerfTier | null {
  if (typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('perf');
  return v === 'low' || v === 'mid' || v === 'high' ? v : null;
}

export function detectTier(gl?: WebGL2RenderingContext | WebGLRenderingContext): TierSettings {
  const forced = forcedTier();
  if (forced) return { tier: forced, ...TIERS[forced] };

  let score = 0;

  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
  score += cores >= 8 ? 2 : cores >= 6 ? 1 : 0;

  // `deviceMemory` is Chromium-only — absent on Safari/iOS, so its absence
  // must not be read as "low memory".
  const mem = (navigator as { deviceMemory?: number }).deviceMemory;
  if (mem !== undefined) score += mem >= 8 ? 2 : mem >= 4 ? 1 : 0;
  else score += 1;

  score += isTabletish() ? 0 : 2;

  if (gl) {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    // Software rasterisers must never be handed the high tier — this is also
    // what keeps CI (SwiftShader) off the post-processing path.
    if (/SwiftShader|llvmpipe|Software|Microsoft Basic/i.test(renderer)) score = -99;
    if (/Apple (M[0-9]|GPU)/i.test(renderer)) score += 1;
  }

  const tier: PerfTier = score >= 5 ? 'high' : score >= 2 ? 'mid' : 'low';
  return { tier, ...TIERS[tier] };
}

/**
 * Dynamic resolution: drop the render scale when frames run long, recover
 * slowly. Asymmetric on purpose — dropping fast keeps the game responsive
 * during a spike, while recovering slowly stops it oscillating between two
 * scales, which is far more visible than simply running at the lower one.
 */
export class DynamicResolution {
  /** Current render scale, 1 = native. */
  scale = 1;

  private readonly steps = [1, 0.85, 0.75];
  private idx = 0;
  private overBudget = 0;
  private underBudget = 0;

  constructor(
    /** Frame time (ms) above which we consider the frame late. 20ms ~ 50fps. */
    private readonly budgetMs = 20,
    /** Consecutive late frames before dropping a step. */
    private readonly dropAfter = 30,
    /** Consecutive comfortable frames before recovering a step. */
    private readonly recoverAfter = 240
  ) {}

  /** @returns true when the scale changed and the renderer must resize. */
  sample(frameMs: number): boolean {
    if (frameMs > this.budgetMs) {
      this.overBudget++;
      this.underBudget = 0;
    } else if (frameMs < this.budgetMs * 0.7) {
      this.underBudget++;
      this.overBudget = 0;
    }

    if (this.overBudget >= this.dropAfter && this.idx < this.steps.length - 1) {
      this.idx++;
      this.overBudget = 0;
      this.scale = this.steps[this.idx];
      return true;
    }
    if (this.underBudget >= this.recoverAfter && this.idx > 0) {
      this.idx--;
      this.underBudget = 0;
      this.scale = this.steps[this.idx];
      return true;
    }
    return false;
  }
}
