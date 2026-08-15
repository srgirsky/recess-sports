// ---------------------------------------------------------------------------
// ★ THE FOUR THINGS A TURNAROUND CANNOT TELL YOU ABOUT ITSELF.
//
// The analyser reads pixels. These are the facts no pixel carries, declared once
// per character so the analyser can CHECK them rather than guess:
//
//   1. WHICH VIEW IS WHICH. "The narrowest view is the profile" is a heuristic,
//      and Grizz's fifth view is an arm-raised yawn that breaks it. Declared
//      roles are verified: the count must match `views()`, and a view declared
//      `action` must be the one whose height deviates from the standing set.
//
//   2. WHICH PARTS COME IN PAIRS. This is the one that matters most, and it is
//      not inferable. At Tank's shoe height the cream is SEVEN runs — each shoe
//      is cream|navy|cream across its own width — and the run through the centre
//      column spans the inner edge of BOTH feet. That span is exactly the
//      1.211ft "foot" that shipped. No run count separates it from a torso; a
//      recipe knows a kid has two feet, and pixels do not.
//
//   3. WHAT EACH COLOUR IS FOR. `palette()` finds a figure's materials without
//      being told — deliberately, because a hardcoded `isShirt` is one kid's
//      wardrobe written into a shared tool, which is the mistake
//      `measure-fidelity`'s header records making with `isRed`/`isCream`. But
//      the CLUSTERS are anonymous, and a spec needs names. So each material is
//      declared with an approximate swatch and resolved by `toneDistance`,
//      refusing outright if nothing is within `TONE_MEMBERSHIP` rather than
//      taking the nearest — "nearest wins" is how a tool stops being able to
//      say it does not know.
//
//   4. WHERE TO LOOK. A band window and a sweep range are editorial choices.
//
// ⚠️ THIS FILE IS WHERE WRONG ANSWERS WOULD COME TO BE BLESSED, so every
// declaration is checked against the sheet and a mismatch is an error, never a
// silent override. Adding a character here is a reviewable act.
//
// Swatch values are approximate ANCHORS for cluster resolution, not
// measurements. The measurement is whatever the sheet's own cluster turns out to
// be, and that is what the spec records.
// ---------------------------------------------------------------------------

/** @typedef {{ hex: string, paired?: boolean }} Material */

export const RECIPES = {
  tank: {
    slug: 'tank',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      shirt: { hex: '#65437c' },
      skin: { hex: '#cb824d' },
      shoe: { hex: '#f6e9d9', paired: true },
      pants: { hex: '#24242b', paired: true },
    },
    // Below z 1.71 his hands cross the tee's edge, so the run's outer edge is a
    // hand and not the garment; above z 2.23 the sleeve covers it. The sculpt
    // header records both, which is why the sweep is bounded rather than full.
    sweeps: { torso: { view: 'front', material: 'shirt', role: 'centre', from: 1.80, to: 2.30, step: 0.06 } },
    bands: { shoe: { view: 'front', material: 'shoe' } },
  },

  nostrike: {
    slug: 'junebug',
    // ⚠️ THREE views, not five, and on a GREY backdrop — the only sheet in the
    // roster shaped like this. She also carries a drawn ARROW beside the
    // ponytail; it is a separate component and must never be measured as figure.
    views: ['front', 'profile', 'back'],
    materials: {
      jersey: { hex: '#a8332f' },
      skin: { hex: '#d9a173' },
      pants: { hex: '#e8736b' },
      hair: { hex: '#4a3428' },
    },
    sweeps: { torso: { view: 'front', material: 'jersey', role: 'centre', from: 1.90, to: 2.40, step: 0.06 } },
    bands: {},
  },

  // ★ GRIZZ IS THE SHEET THE COLOUR RULER CANNOT READ, and this recipe's job is
  // to make the spec SAY so rather than guess. Sampled inside the figure mask:
  // his tee is #844a23 and his cheek #905834 — 15 tone units apart, inside the
  // clusterer's own merge distance, so they are ONE cluster on the sheet. His
  // shorts are #1d1e21 and his afro's modal cluster #131313 — one cluster too.
  // All four anchors are declared at their honest sampled values so the
  // resolver refuses them in pairs (`indistinct-materials`) instead of the
  // first cut of this recipe, whose eyeballed #8a5a34/#8a5836 both resolved to
  // a 3%-share OUTLINE cluster (#050302) and specced the outlines as his tee.
  // Every tee/skin and hair/shorts boundary on him is a geometry trace.
  grizz: {
    slug: 'grizz',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: { shirt: { hex: '#844a23' }, skin: { hex: '#905834' }, hair: { hex: '#161314' }, pants: { hex: '#1d1e21' } },
    sweeps: { torso: { view: 'front', material: 'shirt', role: 'centre', from: 1.80, to: 2.30, step: 0.06 } },
    bands: {},
  },

  // ★ SPROUT'S ANCHORS ARE SAMPLED, NOT REMEMBERED. The first cut declared his
  // hair #c8873f — a caramel, from memory of "brown hair" — while the sheet
  // draws deep chocolate (modal cluster #1c0c02), and the resolver matched the
  // caramel to his SKIN cluster instead. His sheet is otherwise the cleanest
  // on the roster: denim, skin, hair and the yellow tee are four well-separated
  // clusters, so the torso sweep can finally trace by garment colour.
  // ⚠️ His drawn mouth is a light-brown smile FAINTER than his nostril specks,
  // so the spec's mouth landmark lands on the nose (darkest-wins has nothing
  // darker to find at the lip line). The lip trace for the sculpt is bounded
  // by hand: smile arc rows 351-359, centre row ~358, 85.6% of head height.
  sprout: {
    slug: 'sprout',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      skin: { hex: '#dc7b2c' },
      hair: { hex: '#1c0c02' },
      denim: { hex: '#3a4d5b' },
      tee: { hex: '#f3a41c' },
    },
    sweeps: { torso: { view: 'front', material: 'denim', role: 'centre', from: 1.30, to: 2.05, step: 0.06 } },
    bands: {},
  },

  bubbles: {
    slug: 'bubbles',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: { dress: { hex: '#e0748c' }, skin: { hex: '#e9b48c' }, hair: { hex: '#cfa25e' } },
    sweeps: { torso: { view: 'front', material: 'dress', role: 'centre', from: 1.60, to: 2.20, step: 0.06 } },
    bands: {},
  },

  chip: {
    slug: 'chip',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: { skin: { hex: '#dda87e' } },
    sweeps: {},
    bands: {},
  },

  // ★ BENDY BAO'S TEE IS STRIPED, AND ONLY ONE STRIPE HAS A CLUSTER. The teal
  // bands cluster cleanly (#8cac9a) but the cream ground sits inside the
  // BACKDROP's own cluster, so a cream anchor would resolve to the paper — the
  // stripe chart in the sculpt header is a geometry trace of the teal runs, and
  // there is deliberately no torso sweep (a teal sweep would report the tee's
  // width only at stripe heights and read as a refusal storm at the cream
  // ones). Skin #eb9553 with shadow #ab5c24 is one warm family — only the lit
  // value is declared. His glasses' wire is drawn at outline darkness and is
  // never declared as a material.
  bend_it: {
    slug: 'bendy-bao',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      skin: { hex: '#eb9553' },
      hair: { hex: '#33251a' },
      shorts: { hex: '#2a2e3b' },
      tee: { hex: '#8cac9a' },
    },
    sweeps: {},
    bands: {},
  },
};

export const RECIPE_IDS = Object.keys(RECIPES);
