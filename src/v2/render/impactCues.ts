// Contact spectacle policy, pure and sim-blind. The sim reports the hit; this
// decides only how much chrome it earns.

import type { HitType } from '../sim/game';

export function impactStrength(exitVelocityFts: number, hit: HitType, foul: boolean): number {
  const speed = Math.max(0, Math.min(1, (exitVelocityFts - 45) / 55));
  if (foul) return Math.max(0.22, speed * 0.42);
  const moment = hit === 'HR' ? 0.28 : hit === '3B' ? 0.18 : hit === '2B' ? 0.1 : 0;
  return Math.max(0.28, Math.min(1, speed + moment));
}
