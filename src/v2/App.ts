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
import { ResultScreen } from './ui/screens/ResultScreen';
import { resultModel } from './ui/resultModel';
import { ROSTER, getCharacter } from '../data/characters';
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

  constructor(canvas: HTMLCanvasElement, screens: HTMLElement) {
    this.router = new Router(screens);
    this.game = new GameView(canvas);
  }

  async start(): Promise<void> {
    // The park is built and the characters are loaded BEFORE the title shows,
    // so PLAY is instant and the title has something real behind it.
    await this.game.start();
    this.game.onGameEnd((r) => this.showResult(r));
    this.showTitle();
  }

  private showTitle(): void {
    this.router.show(new TitleScreen(() => this.playBall()));
  }

  private playBall(): void {
    this.gameNo += 1;
    this.game.newGame(this.seed());
    this.router.hide();
  }

  private seed(): string {
    const pinned = new URLSearchParams(location.search).get('seed') ?? 'play';
    return this.gameNo <= 1 ? pinned : `${pinned}-${this.gameNo}`;
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
        () => this.playBall(),
        () => this.showTitle()
      )
    );
  }
}
