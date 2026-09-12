// ---------------------------------------------------------------------------
// The playtest session log. UI-side, read-only, and off unless asked for.
//
// ★ WHAT IT IS FOR. `docs/playtests/PROTOCOL.md` puts a child in front of the
// game with one held feature switched on (`?features=`) and an observer
// watching. The observer writes down what they SAW; this writes down what the
// game DID — pitches, swings, whiffs, outs made in the field, how often each
// verb was tapped, how long the session ran and how it ended — so the record
// filed under `docs/playtests/` can reconcile the two. Counts only. Nothing
// here can identify a child, and the protocol forbids adding anything that
// could.
//
// ★ THE SIM NEVER SEES IT. It subscribes to `GameView.onSimEvent`, `onFrame`,
// `onInput` and `onGameEnd` — four read-only listener lists — and folds through
// `sessionModel.ts`, which is pure. There is no path from here to `PlayInputs`
// and none may be added: a log that could nudge the game would be a second
// input channel, and the fingerprint gates would not see it.
//
// ★ ENABLED BY `?log=1` OR ANY `?features=`. A playtest that switches a feature
// on is a playtest, and it would be a shame to run one and find nothing was
// recorded. The `⬇ LOG` button stays hidden otherwise, so a kid playing at
// home never sees it.
//
// Storage is `localStorage` under `recess_playtest_log`, an array capped at 20
// records, guarded the way `customPlayer.ts` guards its key — a headless run
// or a private window has no storage and must not throw. The download is a
// Blob; nothing leaves the device unless the observer carries the file.
// ---------------------------------------------------------------------------

import { button } from './dom';
import type { GameView } from '../game/GameView';
import type { GameResult } from '../sim/game';
import { enabledFeatures } from '../sim/features';
import { snapshot, type Snapshot } from './soundCues';
import { emptySession, foldEvent, foldFrame, foldInput, type SessionCounts } from './sessionModel';

export const PLAYTEST_LOG_KEY = 'recess_playtest_log';
/** Sessions kept. A playtest day is a handful; twenty is a comfortable ring. */
export const PLAYTEST_LOG_CAP = 20;

export type SessionHow = 'finished' | 'quit' | 'unloaded';

export interface SessionRecord {
  v: 1;
  /** Start instant plus a per-page counter — unique enough to replace in place. */
  id: string;
  startedAt: string;
  seed: string;
  /** The held features that were ON. Empty is the baseline. */
  features: string[];
  controlMode: string;
  /** `finished` — the game ended; `quit` — the pause screen's exit; `unloaded` — the tab went away. */
  how: SessionHow;
  elapsedMs: number;
  counts: SessionCounts;
  /** The final line when the game finished; null for a partial record. */
  final: { awayScore: number; homeScore: number; innings: number } | null;
}

/** `?log=1`, or any `?features=` — a session with a feature on is a playtest. */
export function isLogEnabled(search: string): boolean {
  const p = new URLSearchParams(search);
  return p.get('log') === '1' || p.has('features');
}

export function readLog(): SessionRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PLAYTEST_LOG_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SessionRecord[]) : [];
  } catch {
    return [];
  }
}

/** Replace the record with this id, or append; keep the newest `cap`. */
export function upsertRecord(
  records: SessionRecord[],
  record: SessionRecord,
  cap = PLAYTEST_LOG_CAP
): SessionRecord[] {
  const i = records.findIndex((r) => r.id === record.id);
  const next = i >= 0 ? records.map((r, j) => (j === i ? record : r)) : [...records, record];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

function writeLog(records: SessionRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PLAYTEST_LOG_KEY, JSON.stringify(records));
  } catch {
    // Quota or a private window. The download button still serves the open
    // record; losing persistence is not worth throwing over.
  }
}

interface Open {
  record: SessionRecord;
  startedMs: number;
  prev: Snapshot | null;
  half: 'top' | 'bottom';
  counts: SessionCounts;
}

export class SessionLog {
  private game: GameView | null = null;
  private open: Open | null = null;
  private opened = 0;
  private readonly el: HTMLButtonElement;

  constructor(private readonly enabled: boolean = isLogEnabled(location.search)) {
    this.el = button('⬇ LOG', () => this.download(), 'btn--log');
    this.el.setAttribute('aria-label', 'download the playtest log');
    this.el.hidden = !enabled;
  }

  /** Subscribe to the view and mount the button. Idempotent per view. */
  attach(game: GameView): void {
    if (!this.enabled || this.game === game) return;
    this.game = game;
    game.onSimEvent((e) => {
      if (!this.open) return;
      this.open.counts = foldEvent(this.open.counts, e, game.playerControlMode, this.open.half);
    });
    game.onFrame((f) => {
      if (!this.open) return;
      const next = snapshot(f);
      this.open.counts = foldFrame(this.open.counts, this.open.prev, next, game.playerControlMode);
      this.open.prev = next;
      this.open.half = next.half;
    });
    game.onInput((verb) => {
      if (!this.open) return;
      this.open.counts = foldInput(this.open.counts, verb);
    });
    game.onGameEnd((r) => this.end('finished', r));
    // The tab going away is the record's last chance. `pagehide` is the
    // reliable one on mobile; `visibilitychange` catches a backgrounded tab
    // that may never come back. Both write a PARTIAL record — the session
    // stays open, so if the tab does return, a later finish replaces it.
    window.addEventListener('pagehide', () => this.checkpoint());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.checkpoint();
    });
    document.getElementById('hud')?.appendChild(this.el);
  }

  /** A person's game is starting. The attract game behind the title never begins one. */
  begin(): void {
    if (!this.enabled || !this.game) return;
    if (this.open) this.end('quit');
    this.opened += 1;
    const startedAt = new Date().toISOString();
    this.open = {
      record: {
        v: 1,
        id: `${startedAt}-${this.opened}`,
        startedAt,
        seed: this.game.seed,
        features: enabledFeatures(this.game.features),
        controlMode: this.game.playerControlMode,
        how: 'unloaded',
        elapsedMs: 0,
        counts: emptySession(),
        final: null,
      },
      startedMs: performance.now(),
      prev: null,
      half: 'top',
      counts: emptySession(),
    };
  }

  /** Close the open session, if any, and persist it. */
  end(how: SessionHow, result?: GameResult): void {
    if (!this.open) return;
    const record = this.snapshotRecord(how, result ?? null);
    this.open = null;
    writeLog(upsertRecord(readLog(), record));
  }

  /** Whether a session is being recorded right now. */
  get recording(): boolean {
    return this.open !== null;
  }

  private checkpoint(): void {
    if (!this.open) return;
    writeLog(upsertRecord(readLog(), this.snapshotRecord('unloaded', null)));
  }

  private snapshotRecord(how: SessionHow, result: GameResult | null): SessionRecord {
    const o = this.open!;
    return {
      ...o.record,
      how,
      elapsedMs: Math.round(performance.now() - o.startedMs),
      counts: o.counts,
      final: result ? { awayScore: result.awayScore, homeScore: result.homeScore, innings: result.innings } : null,
    };
  }

  private download(): void {
    const records = readLog();
    // The open session rides along, so a download mid-game is not empty.
    const all = this.open ? upsertRecord(records, this.snapshotRecord('unloaded', null)) : records;
    const body = JSON.stringify({ v: 1, exportedAt: new Date().toISOString(), records: all }, null, 2);
    const blob = new Blob([body], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `playtest-${all.length}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
