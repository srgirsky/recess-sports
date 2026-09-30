// The v2 viewport matrix, shared by `audit:v2-layout` and `audit:draft-stage`.
// Chosen for where the `clamp()` binds, not for popularity: see ui-audit.mjs.
export const VIEWPORTS = [
  { name: 'phone portrait', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'short landscape', width: 740, height: 320 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'large display', width: 2560, height: 1440 },
];
