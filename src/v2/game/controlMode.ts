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

/** A short instruction for the verb that actually belongs to this player.
 * Watch mode and resolved plays must never ask for an input they ignore. */
export function controlHint(
  mode: PlayerControlMode,
  half: 'top' | 'bottom',
  phase: 'windup' | 'pitch' | 'live' | 'between'
): string {
  const controls = controlsAt(mode, half);
  if (phase === 'windup' && controls.pitch) return '👆 AIM AT THE BOX · TAP TO PITCH';
  if (phase === 'windup' && controls.bat) return '👀 WATCH THE BALL';
  if (phase === 'pitch' && controls.bat) return '🏏 TAP AS THE BALL REACHES THE PLATE';
  if (phase === 'live' && controls.field) return '🧤 DRAG TO RUN · TAP A BASE TO THROW';
  if (phase === 'live' && controls.run) return '👟 TAP THE NEXT BASE TO RUN';
  return '';
}
