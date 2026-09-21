// Keep the opt-in check in the startup bundle; the recorder and its event
// aggregation are downloaded only for an explicitly requested playtest.
export function isLogEnabled(search: string): boolean {
  const p = new URLSearchParams(search);
  return p.get('log') === '1' || p.has('features');
}
