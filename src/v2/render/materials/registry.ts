// ---------------------------------------------------------------------------
// Material registry. Render-side only.
//
// The named-slot contract the commissioned models are built against:
//
//   M_Body       skin + face (face UVs in their own atlas island)
//   M_Uniform    jersey + pants, AUTHORED WHITE/GREYSCALE — team colour is a
//                runtime multiply. This is the entire team-identity system.
//   M_Hair
//   M_Accessory  cap / glasses / headband / glove. May be absent.
//
// v1 solved team colours by baking a whole second set of textures per team
// (`art/textureFactory.ts`'s `setTeamVariant` + 315 textures per team, rebaked
// on every colour change). In 3D the same job is one `material.color` write,
// which is why the slot names are a hard rule in the asset contract rather
// than a convention.
//
// Materials are SHARED by slot+colour, not per character. Thirty kids in three
// jersey colours is 3 uniform materials, not 30 — that is most of the draw-call
// budget's headroom.
// ---------------------------------------------------------------------------

import { Color, type Material, type Texture } from 'three';
import { HAIR_COLORS, SKIN_TONES, UNIFORM_COLORS } from '../../../art/palette';
import { KEY_WARM, makeToonMaterial } from './toon';

export type SlotName = 'M_Body' | 'M_Uniform' | 'M_Hair' | 'M_Accessory';

export const SLOT_NAMES: readonly SlotName[] = ['M_Body', 'M_Uniform', 'M_Hair', 'M_Accessory'];

export interface CharacterLook {
  /** Index into `art/palette.ts` SKIN_TONES. */
  skin: number;
  /** Index into HAIR_COLORS. */
  hairColor: number;
  /**
   * Index into UNIFORM_COLORS — the TEAM's colour, not the character's. A kid
   * wears whichever team drafted them, which is why this is passed in at
   * build time rather than read off the character.
   */
  uniform: number;
}

function paletteColor(list: readonly string[], i: number): number {
  const hex = list[((i % list.length) + list.length) % list.length];
  return new Color(hex).getHex();
}

export function skinHex(i: number): number {
  return paletteColor(SKIN_TONES, i);
}
export function hairHex(i: number): number {
  return paletteColor(HAIR_COLORS, i);
}
export function jerseyHex(i: number): number {
  return paletteColor(
    UNIFORM_COLORS.map((u) => u.jersey),
    i
  );
}
export function trimHex(i: number): number {
  return paletteColor(
    UNIFORM_COLORS.map((u) => u.trim),
    i
  );
}

/**
 * Caches toon materials by slot + colour + map, so a whole roster shares a
 * handful of GPU programs and uniform blocks.
 */
export class MaterialRegistry {
  private cache = new Map<string, Material>();

  /**
   * Skin has a softer rim than cloth — a strong rim on a face reads as a halo,
   * which is the single most common way a toon shader goes wrong.
   */
  body(skinIndex: number, faceMap?: Texture | null): Material {
    return this.get('M_Body', skinHex(skinIndex), faceMap ?? null, {
      rimStrength: 0.16,
      rimPower: 3.4,
    });
  }

  /** The team-colour multiply. `map` is the greyscale authored jersey. */
  uniform(uniformIndex: number, map?: Texture | null): Material {
    return this.get('M_Uniform', jerseyHex(uniformIndex), map ?? null, {
      rimStrength: 0.26,
      rimPower: 3.0,
    });
  }

  trim(uniformIndex: number): Material {
    return this.get('M_Uniform', trimHex(uniformIndex), null, { rimStrength: 0.2 });
  }

  hair(hairIndex: number): Material {
    // Hair takes the strongest rim: it is the silhouette edge that most needs
    // to separate from a dark navy outline against a mid-green field.
    return this.get('M_Hair', hairHex(hairIndex), null, { rimStrength: 0.34, rimPower: 2.6 });
  }

  accessory(colorHex: number): Material {
    return this.get('M_Accessory', colorHex, null, { rimStrength: 0.22 });
  }

  /** Anything not on a character: bases, bats, props. */
  prop(colorHex: number, rimStrength = 0.18): Material {
    return this.get('prop', colorHex, null, { rimStrength });
  }

  private get(
    slot: string,
    color: number,
    map: Texture | null,
    opts: { rimStrength?: number; rimPower?: number }
  ): Material {
    const key = `${slot}|${color}|${map ? map.uuid : '-'}|${opts.rimStrength}|${opts.rimPower}`;
    let m = this.cache.get(key);
    if (!m) {
      m = makeToonMaterial({
        color,
        map,
        rimColor: KEY_WARM,
        rimStrength: opts.rimStrength,
        rimPower: opts.rimPower,
      });
      m.name = slot;
      this.cache.set(key, m);
    }
    return m;
  }

  get size(): number {
    return this.cache.size;
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}
