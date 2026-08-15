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

  // ★ FLASH IS ANOTHER STRIPED TEE WITH A BACKDROP-CREAM GROUND — only the
  // red stripes have their own clusters (a lit #cb2c13 plus shading variants),
  // so the stripe chart is a centreline geometry trace like Bendy's. His hair
  // (#1c0d03) and charcoal shorts (#3b2d22) are both near-black; they are
  // declared at their honest sampled values and if the ruler cannot separate
  // them the refusal is the answer, never an eyeballed override.
  flash: {
    slug: 'flash-gordon-jr',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      skin: { hex: '#d47432' },
      hair: { hex: '#1c0d03' },
      shorts: { hex: '#3b2d22' },
      tee: { hex: '#cb2c13' },
    },
    sweeps: {},
    bands: {},
  },

  // ★ ZIPPY'S TEE IS THE FIRST STRIPE WHOSE BOTH TONES CLUSTER — dark pink
  // #f25c74 and light pink #fa939c are separate clusters, so for once the
  // stripe chart could be checked by colour rather than only geometry. Her
  // paired pigtails are the widest thing on the sheet at their own rows, so
  // any width metric near z 3.0-3.8 is hair, not head. The cream headband and
  // sock stripes share the backdrop-cream cluster and are geometry traces.
  // Her lit SKIN and the light pink resolve to the same cluster (the resolver
  // refuses the pair as indistinct-materials — the honest answer, kept), so
  // every skin/teeLight boundary is a geometry trace like Grizz's tee.
  zippy: {
    slug: 'zippy',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      skin: { hex: '#eda05e' },
      hair: { hex: '#1b140c' },
      shorts: { hex: '#2a2e39' },
      teeDark: { hex: '#f25c74' },
      teeLight: { hex: '#fa939c' },
    },
    sweeps: {},
    bands: {},
  },

  // ★ DAZZLE'S MANE OWNS EVERY WIDTH METRIC — the wavy auburn mass runs from
  // crown to mid-torso and merges with the head at every row, so a "neck"
  // found inside it is curtain-to-curtain, and the ear line lands on hair.
  // Cream (headband, trim, socks, soles) sits in the backdrop cluster; her
  // lit and shadowed skin are separate clusters and only the lit one is
  // declared.
  diva: {
    slug: 'dazzle',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      skin: { hex: '#fb9c53' },
      hair: { hex: '#642302' },
      dress: { hex: '#5d3a63' },
    },
    sweeps: {},
    bands: {},
  },

  // ★ NOODLE'S CREAM IS THE BACKDROP'S CREAM — the tee's ground and the shoe
  // panels sit inside the paper's own cluster, so only the blue stripe, the
  // denim and his pale skin are declared; every cream boundary is a geometry
  // trace. The blue-grey stripe cluster ALSO covers the rolled jean cuffs —
  // one cluster, two garments, and the recipe cannot split them.
  noodle: {
    slug: 'noodle',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      skin: { hex: '#fbc48b' },
      jeans: { hex: '#334b64' },
      stripe: { hex: '#9aadbb' },
    },
    sweeps: {},
    bands: {},
  },

  // ★ TURBO'S SPIKES OWN THE TOP OF HIS HEAD SPAN — the crown row is a spike
  // tip half a foot above the skull, and the widest rows are hair, so the ear
  // line is untraceable (his big ears are placed by eye). His fringe hangs to
  // just above the brows, and the first text-read of his features mistook the
  // fringe shadow for brows — the bounded traces below were confirmed against
  // a zoomed crop of the sheet, not the dark-run scan alone.
  turbo: {
    slug: 'turbo',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      skin: { hex: '#eb9b5c' },
      hair: { hex: '#14110d' },
      tee: { hex: '#6ca4cb' },
      shorts: { hex: '#33353a' },
    },
    sweeps: {},
    bands: {},
  },

  // ★ MOOSE IS DEEP SKIN ON A HUGE BUILD — his #ab5b24 skin sits a Grizz
  // step below the classifier's comfort and is authored bright; his mustard
  // hoodie is a third of the sheet by itself. The navy cap, navy joggers and
  // the outline family are neighbours in the dark cluster and resolve as one
  // declared navy.
  moose: {
    slug: 'moose',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      skin: { hex: '#ab5b24' },
      hoodie: { hex: '#ed921c' },
      navy: { hex: '#1d222b' },
    },
    sweeps: {},
    bands: {},
  },

  // ★ PENNY IS THE FIRST OVERALLS — the denim bib is a FRONT panel over a
  // pink tee, so garment boundaries at chest height change with the view and
  // only geometry can trace them. Her curl bob owns the width metrics (the
  // widest rows are hair), and her curls span three brown clusters that are
  // declared once at the modal value.
  penny: {
    slug: 'penny',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      skin: { hex: '#fbb47b' },
      curls: { hex: '#7b4c23' },
      denim: { hex: '#334c64' },
      tee: { hex: '#fc939c' },
    },
    sweeps: {},
    bands: {},
  },

  // ★ THE PROFESSOR'S JACKET IS 42% OF THE SHEET and it is OPEN — the cream
  // tee shows only as a centre strip between the fronts, and that cream is
  // the backdrop's own cluster, so every tee/jacket boundary is a geometry
  // trace. His hair and the jacket's shadow lane sit one cluster apart and
  // are declared at their honest sampled values.
  the_prof: {
    slug: 'the-professor',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      jacket: { hex: '#6c4323' },
      hair: { hex: '#1b0d03' },
      jeans: { hex: '#344a64' },
    },
    sweeps: {},
    bands: {},
  },

  // ★ ACE'S CAP AND JACKET SHARE ONE BLUE — 47% of the sheet is a single
  // #739dbb cluster spanning both garments, so cap/jacket boundaries are
  // geometry traces. The cream tee strip sits in the backdrop's cluster, and
  // his shaggy hair pokes below the cap in its own near-black cluster.
  ace_kid: {
    slug: 'ace',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      blue: { hex: '#739dbb' },
      skin: { hex: '#e3924d' },
      hair: { hex: '#130c03' },
    },
    sweeps: {},
    bands: {},
  },

  // ★ ROCKET ROSA'S TEE IS THE BACKDROP'S CREAM — the white raglan with its
  // thin orange piping lives in the paper's own cluster, so every tee
  // boundary is a geometry trace. Her high ponytail flows BEHIND the head,
  // so for once the widest front row is her real ears.
  rocket: {
    slug: 'rocket-rosa',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      skin: { hex: '#e48a3c' },
      hair: { hex: '#332315' },
      shorts: { hex: '#2d323c' },
    },
    sweeps: {},
    bands: {},
  },

  // ★ GIZMO'S SHOES ARE THE BACKDROP'S CREAM and his rolled denim cuffs
  // resolve to the same cluster as his light-blue tee — the sheet's washes
  // reuse tones across garments, so the cuff/tee boundary is a geometry
  // trace, not a colour one. His glasses sit in the hair's own dark cluster.
  gizmo: {
    slug: 'gizmo',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      skin: { hex: '#e38c44' },
      hair: { hex: '#6b3c13' },
      overalls: { hex: '#344b63' },
      tee: { hex: '#8cb4c3' },
    },
    sweeps: {},
    bands: {},
  },

  // ★ DEX'S LIT SKIN NEVER GETS ITS OWN CLUSTER — the 8-tone quantizer folds
  // his medium-brown face into the shadow tone (#5B2C0B, 2.9%), so the skin
  // swatch is a direct cheek sample, not a cluster centroid. His cap and
  // curls share near-black clusters; the boundary between them is geometry.
  dex: {
    slug: 'dex',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      skin: { hex: '#8a5327' },
      hair: { hex: '#2b241b' },
      hoodie: { hex: '#4c5563' },
      jeans: { hex: '#1c2632' },
    },
    sweeps: {},
    bands: {},
  },

  // ★ CLOVER'S SMILE IS DRAWN IN SKIN-ADJACENT TONES — no dark lip band
  // survives the scanner (only a corner shadow at 68.6%), so the mouth row
  // is a bounded trace. Her pigtails own every width metric from 3.4 down
  // to 2.9; the ear line is theirs, not hers.
  clover: {
    slug: 'clover',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      skin: { hex: '#f3aa74' },
      hair: { hex: '#bc833b' },
      dress: { hex: '#849a3c' },
    },
    sweeps: {},
    bands: {},
  },

  // ★ BOOMER'S TEE STRIPES SHARE THE BACKDROP'S CREAM — the pale bands live
  // in the paper's cluster, so only the GOLD bands trace as colour; the
  // cream bands between them are geometry bounded by the gold edges. His
  // widow's peak descends between the brows and the dark-row scan reads it
  // as a third brow.
  boomer: {
    slug: 'boomer',
    views: ['front', 'threeQuarter', 'profile', 'back', 'action'],
    materials: {
      skin: { hex: '#ab5d24' },
      hair: { hex: '#14120e' },
      teeGold: { hex: '#eda432' },
      shorts: { hex: '#23252b' },
    },
    sweeps: {},
    bands: {},
  },
};

export const RECIPE_IDS = Object.keys(RECIPES);
