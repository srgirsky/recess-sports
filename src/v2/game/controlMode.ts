// Which live verbs belong to the person in each focused game mode. Pure so a
// hands-free mode cannot accidentally wait eight seconds for a hidden pitcher.

export type PlayerControlMode = 'both' | 'batting' | 'pitching' | 'watch';

export function controlsAt(
  mode: PlayerControlMode,
  half: 'top' | 'bottom'
): { bat: boolean; pitch: boolean; run: boolean; field: boolean } {
  return {
    bat: half === 'top' && (mode === 'both' || mode === 'batting'),
    pitch: half === 'bottom' && (mode === 'both' || mode === 'pitching'),
    run: half === 'top' && (mode === 'both' || mode === 'batting'),
    field: half === 'bottom' && (mode === 'both' || mode === 'pitching'),
  };
}
