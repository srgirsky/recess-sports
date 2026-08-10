// OWNER: render agent. Every color the render subsystem uses, in one place.
// NOTE for the materials owner: ARCHITECTURE.md makes materials/palette.ts the
// single color authority. Render inits FIRST (before materials exists on the
// bus), so these sky/light values live here for now — when the materials pass
// lands, claim any of these into palette.ts and I will consume them lazily via
// ctx.get('materials') inside a tick/scene:ready handler. Until then this file
// is the only render file with hex values.

export const SKY = {
  zenith: '#1a6fe0', // deep saturated afternoon blue
  mid: '#3d9dee',
  horizon: '#c9ecf9', // pale cyan haze the fog cites
  cloudLit: '#ffffff',
  cloudShade: '#c9d9ec',
  hazeBand: '#e8f7fd',
};

export const LIGHT = {
  sun: 0xffedc2, // warm late-afternoon key
  fill: 0xbdd9ff, // cool sky fill opposite the sun
  hemiSky: 0x9fd4ff,
  hemiGround: 0x6da65a, // grass bounce
  fog: 0xc9ecf9, // MUST match SKY.horizon so scenery melts into the sky
};

// Placeholder stage only (self-retires — see stage.ts).
export const STAGE = {
  grass: 0x5fb63c,
  dirt: 0xc98f52,
  chalk: 0xf5f2e6,
  dummy: 0x7a8699,
};
