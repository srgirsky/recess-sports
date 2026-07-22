// ---------------------------------------------------------------------------
// Venues — where recess happens. CONTENT, not logic: each venue reshapes the
// fence (short porches = cheap homers that way), changes how the ball rolls,
// and can drop obstacles on the field (the sandlot oak stops rollers dead).
// Bases and mound never move, so fielding spots and the sim stay valid.
// ---------------------------------------------------------------------------

export type VenueId = 'park' | 'sandlot' | 'blacktop';

export interface VenueObstacle {
  x: number;
  y: number;
  r: number;
  /** What to draw ('tree' for now). */
  kind: 'tree';
}

export interface VenueDef {
  id: VenueId;
  name: string;
  emoji: string;
  /**
   * Fence line endpoints: y at the LEFT foul line and at the RIGHT foul line
   * (screen px — larger y = closer to home = shorter porch). The park is the
   * classic flat 210/210. The pole x's are DERIVED from these y's via
   * geometry's FOUL_SLOPE, so foul lines always pass through 1B/3B.
   */
  fenceLeftY: number;
  fenceRightY: number;
  /**
   * Extra px of depth the fence arcs beyond the pole-to-pole chord at
   * mid-fence (a rounded wall, deepest toward center). MUST be ≥ 0 — the
   * arc bulges AWAY from home; convexity keeps clampToField valid.
   */
  fenceBulge: number;
  /** Grounder roll-speed multiplier: asphalt is fast, backyard grass is shaggy. */
  rollMult: number;
  /** Hop/carom liveliness: how springy landings and fence caroms play here. */
  bounceMult: number;
  obstacles: VenueObstacle[];
  /** drawField palette + dressing flags. The scenery descriptors keep the
   *  field renderer data-driven — new venues pick a combination instead of
   *  growing another `venue.id` branch in drawField. */
  look: {
    grass: number;
    grassDark: number;
    dirt: number;
    fence: number;
    fenceTrim: number;
    /** The park has stands + crowd; the others have their own skylines. */
    stands: boolean;
    /** Mowing stripes (grass venues only). */
    stripes: boolean;
    /** Painted blacktop look (court lines, no dirt diamond texture change). */
    asphalt: boolean;
    /** Fence surface texture. */
    fenceStyle: 'wall' | 'planks' | 'chainlink';
    /** What sits on the horizon behind the fence. */
    skyline: 'stands' | 'rooftops' | 'brick';
    /** Haze-tinted treetops peeking over the fence (distance parallax). */
    treeline: boolean;
    /** Rows of crowd head-dots in the stands band (0 = empty skyline). */
    crowdRows: number;
    /** Dirt strip hugging the fence arc, big-league style. */
    warningTrack: boolean;
    /** Outfield ground dressing. */
    mowPattern: 'stripes' | 'checker' | 'tufts' | 'court';
  };
}

export const VENUES: Record<VenueId, VenueDef> = {
  park: {
    id: 'park',
    name: 'The Park',
    emoji: '🌳',
    fenceLeftY: 210,
    fenceRightY: 210,
    fenceBulge: 24, // the classic gentle arc, deepest in dead center
    rollMult: 1,
    bounceMult: 1,
    obstacles: [],
    look: {
      grass: 0x5bbf5a,
      grassDark: 0x4aa84a,
      dirt: 0xc98a4b,
      fence: 0x2e7d4f,
      fenceTrim: 0xffce3a,
      stands: true,
      stripes: true,
      asphalt: false,
      fenceStyle: 'wall',
      skyline: 'stands',
      treeline: true,
      crowdRows: 2,
      warningTrack: true,
      mowPattern: 'checker',
    },
  },
  sandlot: {
    id: 'sandlot',
    name: 'The Sandlot',
    emoji: '🏡',
    // Short right-field porch over the neighbor's wood fence; deep left.
    fenceLeftY: 196,
    fenceRightY: 252,
    fenceBulge: 14, // a lumpy backyard curve — small, so the right porch stays cheap
    rollMult: 0.85, // shaggy backyard grass
    bounceMult: 0.8, // dead hops off the lumpy lawn
    obstacles: [{ x: 330, y: 262, r: 30, kind: 'tree' }], // the old oak in left-center
    look: {
      grass: 0x71b356,
      grassDark: 0x60a24a,
      dirt: 0xb97f45,
      fence: 0x8a5a33,
      fenceTrim: 0x6d4426,
      stands: false,
      stripes: false,
      asphalt: false,
      fenceStyle: 'planks',
      skyline: 'rooftops',
      treeline: true,
      crowdRows: 0,
      warningTrack: false,
      mowPattern: 'tufts',
    },
  },
  blacktop: {
    id: 'blacktop',
    name: 'The Blacktop',
    emoji: '🏀',
    // Deep chain-link all around — but the asphalt is FAST.
    fenceLeftY: 198,
    fenceRightY: 198,
    fenceBulge: 10, // chain-link pulled nearly straight between posts
    rollMult: 1.3,
    bounceMult: 1.3, // hot asphalt — the ball SPRINGS
    obstacles: [],
    look: {
      grass: 0x4a4f5a, // asphalt
      grassDark: 0x42474f,
      dirt: 0x5a606c, // painted "dirt" zones
      fence: 0x9aa4ad, // chain-link gray
      fenceTrim: 0x7b8790,
      stands: false,
      stripes: false,
      asphalt: true,
      fenceStyle: 'chainlink',
      skyline: 'brick',
      treeline: false,
      crowdRows: 0,
      warningTrack: false,
      mowPattern: 'court',
    },
  },
};
