// ---------------------------------------------------------------------------
// The app: title -> game -> result -> title.
//
// ★ WHAT THIS REPLACES IS NOTHING, WHICH WAS THE PROBLEM. v2 could play a whole
// game and had no way to START one and no way to FINISH one. Loading `/v2/` put
// you in a spike; loading `/v2/?play=1` dropped you mid-pitch into a game
// already in progress, and when it ended the page simply stopped moving. Every
// verb worked and there was no product around them.
//
// ★ THE WORLD IS NEVER TORN DOWN. v1 is five Phaser scenes and a transition is a
// scene swap; here the canvas is always the game and a screen is DOM over it. So
// the title shows the real park, PLAY AGAIN costs one generator rather than a
// model reload, and there is no Boot screen because there is nothing to boot
// between screens. `Router` owns that rule; this owns the order.
//
// ★ AND THE ROUTER IS DRIVEN BY THE SIM, NOT BY A TIMER. The Result screen
// appears because `simulateGameLive` RETURNED — the same value `simulateGame`
// hands the harness — not because the view guessed the game looked over.
// ---------------------------------------------------------------------------

import { GameView } from './game/GameView';
import { Router } from './ui/Router';
import { TitleScreen } from './ui/screens/TitleScreen';
import { DraftScreen } from './ui/screens/DraftScreen';
import { TeamScreen } from './ui/screens/TeamScreen';
import {
  getTeamIdentity,
  pickRival,
  setTeamIdentity,
  teamName,
  type TeamIdentity,
} from '../systems/team';
import { ResultScreen } from './ui/screens/ResultScreen';
import { resultModel } from './ui/resultModel';
import { Sound } from './ui/Sound';
import { MuteButton } from './ui/MuteButton';
import { ROSTER, getCharacter } from '../data/characters';
import { makeRng } from './sim/rng';
import { recordGamePlayed } from '../systems/picklog';
import type { GameResult } from './sim/game';

export class App {
  private readonly router: Router;
  private readonly game: GameView;
  /**
   * Which game this is, so PLAY AGAIN is a different one.
   *
   * ★ COUNTED, NEVER `Date.now()`. A seed is what makes "watch that again"
   * possible and what every record rests on; deriving it from the clock would
   * make a session unreproducible for no benefit. `?seed=` still pins the first
   * game exactly, and the rematches walk from there.
   */
  private gameNo = 0;
  private readonly sound = new Sound();
  /** The teams the player drafted, kept so PLAY AGAIN is a rematch. */
  private rosters: { away: string[]; home: string[] } | null = null;
  /**
   * The player's colours. Read from `recess_team` — the SAME key v1 writes, so
   * a kid who named their team at `/` finds it already named at `/v2/`.
   */
  private identity: TeamIdentity = getTeamIdentity() ?? { color: 5, logo: 0 };

  constructor(canvas: HTMLCanvasElement, screens: HTMLElement) {
    this.router = new Router(screens);
    this.game = new GameView(canvas);
  }

  async start(): Promise<void> {
    // The park is built and the characters are loaded BEFORE the title shows,
    // so PLAY is instant and the title has something real behind it.
    await this.game.start();
    this.game.setTeamNames(this.names());
    this.game.onGameEnd((r) => this.showResult(r));
    this.game.onSimEvent((e) => this.sound.onEvent(e));
    this.game.onFrame((f) => {
      this.sound.setBatter(getCharacter(f.batterId).name);
      this.sound.onFrame(f);
    });
    new MuteButton(this.sound).mount();
    this.showTitle();
  }

  private showTitle(): void {
    this.rosters = null;
    this.router.show(
      new TitleScreen(() => {
        // ★ THE GESTURE. Audio cannot start without one, and this is the only
        // tap guaranteed to happen before anything makes a noise. v1 unlocks on
        // the same button for the same reason.
        this.sound.start();
        this.showDraft();
      })
    );
  }

  /**
   * The draft — and the reason the whole project exists.
   *
   * ★ EVERY TAP HERE IS A VOTE. `picklog.recordPick` tallies the human's picks
   * and never the CPU's, which is what makes pick rates mean preference rather
   * than mean the greedy value function. `draftSession.ts` owns that rule and a
   * test asserts the exact set of ids counted.
   */
  private showDraft(): void {
    this.router.show(
      new DraftScreen(
        ROSTER.map((c) => c.id),
        makeRng(`draft-${this.seedBase()}-${this.gameNo}`),
        (c) => this.sound.sayName(c),
        (playerTeam, aiTeam) => {
          this.rosters = { away: playerTeam, home: aiTeam };
          this.showTeam();
        }
      )
    );
  }

  /** Colours and a logo, which together are the team's spoken name. */
  private showTeam(): void {
    this.router.show(
      new TeamScreen(
        this.identity,
        (t) => {
          this.identity = t;
          void this.dress();
        },
        (t) => {
          this.identity = t;
          setTeamIdentity(t);
          void this.playBall();
        }
      )
    );
  }

  /** Put the drafted nine in the chosen colour, live behind the picker. */
  private async dress(): Promise<void> {
    if (!this.rosters) return;
    this.game.setTeamNames(this.names());
    await this.game.newGame(this.seed(), this.rosters, this.uniforms());
  }

  private rival(): TeamIdentity {
    return pickRival(this.identity, this.gameNo);
  }

  private names() {
    return { away: teamName(this.identity), home: teamName(this.rival()) };
  }

  private uniforms() {
    return { away: this.identity.color, home: this.rival().color };
  }

  private async playBall(): Promise<void> {
    this.gameNo += 1;
    this.sound.reset();
    this.game.setTeamNames(this.names());
    await this.game.newGame(this.seed(), this.rosters ?? undefined, this.uniforms());
    // ★ THE BOOTH SAYS THE NAME. It is the payoff for the whole screen, and it
    // is why the name is a spoken colour and a spoken animal rather than text.
    this.sound.sayTeam(teamName(this.identity));
    // The denominator for a pick rate: how many games this browser has played.
    recordGamePlayed();
    this.router.hide();
  }

  private seedBase(): string {
    return new URLSearchParams(location.search).get('seed') ?? 'play';
  }

  private seed(): string {
    return this.gameNo <= 1 ? this.seedBase() : `${this.seedBase()}-${this.gameNo}`;
  }

  private showResult(result: GameResult): void {
    // ★ THE ATTRACT GAME MUST NOT INTERRUPT THE TITLE. A game is already running
    // behind the front screen so the park is alive, and it can reach the ninth
    // while a kid is deciding — which would slap a Result screen for a game
    // nobody played over the PLAY button. If a screen is up, the game on the
    // canvas is scenery.
    if (this.router.showing) return;
    const model = resultModel(
      result,
      { ...this.game.teams, you: this.game.humanSide },
      ROSTER.map((c) => c.id)
    );
    this.router.show(
      new ResultScreen(
        model,
        (id) => getCharacter(id).name,
        // PLAY AGAIN is a REMATCH — same nine kids, so a player is not made to
        // re-draft to have another go at a team they just built.
        () => void this.playBall(),
        () => this.showTitle()
      )
    );
  }
}
