// ---------------------------------------------------------------------------
// The app: title -> draft -> setup (-> batting order) -> game -> result, with the
// persistent Recess Week schedule wrapping five trips through that same game.
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
//
// ★ ONLINE IS THE SAME ORDER WITH A FRIEND IN IT: lobby -> draft -> game ->
// result, where the other drafter and the other dugout are a second device
// (`net/OnlineMatch.ts`). The host's device plays the visitors and runs the
// sim; the guest's plays the home side off the host's frames. § "Online", at
// the bottom of this file, is all of it.
// ---------------------------------------------------------------------------

import { DEFAULT_INNINGS, GameView } from './game/GameView';
import type { VenueId } from './sim/field';
import { parseSkill, type Skill } from './sim/assist';
import { loadCoachCounts, loadSkill, saveCoachCounts, saveSkill } from './ui/skillStore';
import { Coach } from './ui/coachModel';
import { Router } from './ui/Router';
import { TitleScreen } from './ui/screens/TitleScreen';
import { PauseScreen } from './ui/screens/PauseScreen';
import { DraftScreen } from './ui/screens/DraftScreen';
import { LobbyScreen } from './ui/screens/LobbyScreen';
import { NoticeScreen } from './ui/screens/NoticeScreen';
import { OnlineMatch, type OnlineHooks } from './net/OnlineMatch';
import { VENUE_GEOMETRY } from './sim/field';
import { TeamScreen } from './ui/screens/TeamScreen';
import {
  TEAM_COLOR_NAMES,
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
import type { SessionLog } from './ui/sessionLog';
import { isLogEnabled } from './ui/sessionLogEnabled';
import { ROSTER, getCharacter } from '../data/characters';
import { makeRng } from './sim/rng';
import { getGamesPlayed, readPickRates, recordGamePlayed } from '../systems/picklog';
import { getAlbum, recordAlbumGame, recordTrophy } from '../systems/album';
import type { GameResult } from './sim/game';
import { ClubhouseScreen } from './ui/screens/ClubhouseScreen';
import { clubhouseModel } from './ui/clubhouseModel';
import { StrategyScreen } from './ui/screens/StrategyScreen';
import {
  clearSeason,
  getSeason,
  isWeekOver,
  newSeason,
  recordSeasonGame,
  saveSeason,
  type SeasonState,
} from '../systems/season';
import { SeasonScreen } from './ui/screens/SeasonScreen';
import { statEventsFromLines } from './ui/seasonModel';
import { CustomPlayerScreen } from './ui/screens/CustomPlayerScreen';
import {
  customPlayerCharacter,
  loadCustomPlayer,
  saveCustomPlayer,
  type CustomPlayerProfile,
} from './ui/customPlayer';
import { EXTRA_MODES, ModeScreen, versusHeadline, type ExtraModeId } from './ui/screens/ModeScreen';
import type { Character } from '../data/types';

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
  /** The draft/setup is creating a new week rather than an exhibition. */
  private seasonDraft = false;
  /** The game currently under the canvas belongs to this week. */
  private seasonGame = false;
  private season: SeasonState | null = null;
  /**
   * The player's colours. Read from `recess_team` — the SAME key v1 writes, so
   * a kid who named their team at `/` finds it already named at `/v2/`.
   */
  private identity: TeamIdentity = getTeamIdentity() ?? { color: 5, logo: 0 };
  private innings = DEFAULT_INNINGS;
  /** T-BALL..ALL-STAR (`sim/assist.ts`). Remembered per browser; `?skill=` seeds it for review. */
  private skill: Skill = parseSkill(new URLSearchParams(location.search).get('skill') ?? loadSkill());
  /** Day or night, chosen on the team screen. `?night=1` seeds it for review. */
  private night = new URLSearchParams(location.search).get('night') === '1';
  /** Where we play, chosen on the team screen. `?venue=` seeds it. */
  private venue = (new URLSearchParams(location.search).get('venue') as VenueId) ?? 'park';
  private customProfile: CustomPlayerProfile | null = loadCustomPlayer();
  private customPlayer: Character | null = this.customProfile
    ? customPlayerCharacter(this.customProfile)
    : null;
  private activeMode: 'pickup' | 'season' | ExtraModeId = 'pickup';
  /** The online match in progress — lobby to GOOD GAME — or null. */
  private match: OnlineMatch | null = null;
  private lobby: LobbyScreen | null = null;
  /** An online game is on the field (not the draft, not the result). */
  private onlineLive = false;
  /** The Result screen of an online game, so the rematch vote can relabel it. */
  private onlineResult: ResultScreen | null = null;
  /** Which waiting notice is up, so only the thing that raised it lowers it. */
  private onlineNotice: 'paused' | 'lost' | null = null;
  /** The field last showed the HOST's game (we were the guest): it needs its own back. */
  private borrowedField = false;

  private log: SessionLog | null = null;
  /** Speaks the control hint (`coachModel.ts`) — every verb a few times per browser, always in the lesson. */
  private readonly coach = new Coach(loadCoachCounts(), saveCoachCounts);

  constructor(canvas: HTMLCanvasElement, screens: HTMLElement) {
    this.router = new Router(screens);
    this.game = new GameView(canvas);
  }

  async start(): Promise<void> {
    // Show the actual title while assets load. A blank canvas gives a child
    // no sign the game is starting; disabled game actions prevent entry into
    // an incomplete scene, while Classic remains available.
    const noop = () => {};
    this.router.show(new TitleScreen(noop, noop, noop, noop, 'loading'));
    try {
      if (isLogEnabled(location.search)) {
        const { SessionLog } = await import('./ui/sessionLog');
        this.log = new SessionLog();
      }
      await this.game.start();
      if (this.customPlayer) await this.game.setCustomPlayer(this.customPlayer);
    } catch (error) {
      console.error('[App] Could not start the game', error);
      this.router.show(new TitleScreen(noop, noop, noop, noop, 'error'));
      return;
    }
    this.game.setTeamNames(this.names());
    this.game.onGameEnd((r) => this.showResult(r));
    this.game.onSimEvent((e) => this.sound.onEvent(e));
    this.game.onFrame((f) => {
      this.sound.setBatter(this.lookup(f.batterId).name);
      this.sound.onFrame(f);
    });
    this.game.onReplay((kind) => this.sound.onReplay(kind));
    // The coach speaks only in a person's game: the attract game behind the
    // title paints hints too, and a screen being up means nobody is playing.
    this.game.onHint((hint) => {
      if (this.router.showing) return;
      const line = this.coach.onHint(hint, performance.now() / 1000);
      if (line) this.sound.sayCoach(line);
    });
    this.game.onPauseRequest(() => this.pauseGame());
    new MuteButton(this.sound).mount();
    // The playtest log: a fourth read-only listener on the same streams,
    // inert unless `?log=1` or `?features=` asked for it (`ui/sessionLog.ts`).
    this.log?.attach(this.game);
    this.showTitle();
  }

  /**
   * Freeze the game under a two-card pause screen. Guarded on `showing`
   * because the button is hidden under any open screen anyway — this is the
   * belt for a tap racing a screen transition.
   */
  private pauseGame(): void {
    if (this.router.showing) return;
    this.game.setPaused(true);
    // Online, a pause is both devices': the friend sees why the game stopped.
    if (this.onlineLive) this.match?.sendPause(true);
    this.router.show(
      new PauseScreen(
        () => {
          this.router.hide();
          this.game.setPaused(false);
          if (this.onlineLive) this.match?.sendPause(false);
        },
        () => {
          // The one way out of a game mid-way: the session log closes as `quit`.
          this.log?.end('quit');
          this.game.setPaused(false);
          this.showTitle();
        }
      )
    );
  }

  /** The app-shell form of the existing dev-only fixed-clock verifier seam. */
  devStepFixedClock(ticks = 6) {
    return this.game.devStepFixedClock(ticks);
  }

  /** Its painting half: `frames` drawn frames, one sim step each, off the fixed clock. */
  devPaint(frames = 1) {
    this.game.devPaint(frames);
  }

  private showTitle(): void {
    // Null on purpose, looked at through the title's new window (see
    // `.screen--title::before`): the attract game's own cues put a batter's
    // head and shoulders in the opening and keep cutting with the plays,
    // which reads as a real game outside. A locked FIELD/PLAY rig was tried
    // and shows only a static band of dirt through the same slot.
    this.game.setScreenCue(null);
    // Every road home leaves the room: the friend is told, not left waiting.
    this.leaveOnline();
    this.rosters = null;
    this.seasonDraft = false;
    this.seasonGame = false;
    this.season = null;
    this.activeMode = 'pickup';
    this.game.setControlMode('both');
    this.router.show(
      new TitleScreen(
        () => {
          // ★ THE GESTURE. Audio cannot start without one, and this is the only
          // tap guaranteed to happen before anything makes a noise. v1 unlocks on
          // the same button for the same reason.
          this.sound.start();
          this.seasonDraft = false;
          this.showDraft();
        },
        () => {
          this.sound.start();
          this.showClubhouse();
        },
        () => {
          this.sound.start();
          const saved = getSeason();
          if (saved) this.showSeason(saved);
          else {
            this.seasonDraft = true;
            this.showDraft();
          }
        },
        () => {
          this.sound.start();
          this.showModes();
        }
      )
    );
  }

  /** The five-day schedule, resumed from the shared `recess_season` key. */
  private showSeason(season: SeasonState): void {
    this.game.setScreenCue('DEEP');
    this.season = season;
    this.seasonGame = false;
    this.identity = season.identity;
    this.router.show(
      new SeasonScreen(
        season,
        () => this.startSeasonGame(season),
        (awardIds) => {
          for (const id of awardIds) recordTrophy(id);
          clearSeason();
          this.showTitle();
        },
        () => this.showTitle()
      )
    );
  }

  private startSeasonGame(season: SeasonState): void {
    if (isWeekOver(season)) return;
    this.season = season;
    this.seasonGame = true;
    this.activeMode = 'season';
    this.game.setControlMode('both');
    this.identity = season.identity;
    this.rosters = {
      away: [...season.playerTeam],
      home: [...season.rivalTeams[season.gameIndex]],
    };
    void this.playBall();
  }

  /** Personal records and stickers, read from the same stores v1 maintains. */
  private showClubhouse(): void {
    this.game.setScreenCue('PITCH_HERO');
    const rosterOrder = ROSTER.map((c) => c.id);
    this.router.show(
      new ClubhouseScreen(
        clubhouseModel(getAlbum(), getGamesPlayed(), readPickRates(), rosterOrder),
        ROSTER,
        this.customPlayer,
        (c) => this.sound.sayDraft(c),
        () => this.showCustomPlayer(),
        () => this.showTitle()
      )
    );
  }

  private showCustomPlayer(): void {
    this.game.setScreenCue('PLAY');
    this.router.show(
      new CustomPlayerScreen(
        this.customProfile,
        (profile) => void this.finishCustomPlayer(profile),
        () => this.showClubhouse()
      )
    );
  }

  private async finishCustomPlayer(profile: CustomPlayerProfile): Promise<void> {
    saveCustomPlayer(profile);
    this.customProfile = profile;
    this.customPlayer = customPlayerCharacter(profile);
    await this.game.setCustomPlayer(this.customPlayer);
    this.sound.sayDraft(this.customPlayer);
    this.showClubhouse();
  }

  /** Pickup stays one tap away; focused practice and watch live behind this door. */
  private showModes(): void {
    this.game.setScreenCue('PLAY');
    this.router.show(new ModeScreen((mode) => void this.startExtraMode(mode), () => this.showTitle()));
  }

  private async startExtraMode(mode: ExtraModeId): Promise<void> {
    if (mode === 'online') return this.showLobby();
    this.activeMode = mode;
    this.seasonDraft = false;
    this.seasonGame = false;
    this.season = null;
    const option = EXTRA_MODES.find((entry) => entry.id === mode)!;
    this.game.setControlMode(option.controls);
    // Practice is one inning; pass and play is a real (short) game.
    this.innings = mode === 'versus' ? DEFAULT_INNINGS : 1;
    this.coach.setLesson(mode === 'lesson');

    const ids = ROSTER.map((c) => c.id);
    const rng = makeRng(`mode-${mode}-${this.seedBase()}-${this.gameNo}`);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const away = ids.slice(0, 9);
    const home = ids.slice(9, 18);
    if (this.customPlayer && mode !== 'watch') {
      if (mode === 'pitching') home[0] = this.customPlayer.id;
      else away[0] = this.customPlayer.id;
    }
    this.rosters = { away, home };
    await this.playBall();
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
    this.activeMode = this.seasonDraft ? 'season' : 'pickup';
    this.game.setControlMode('both');
    this.game.setScreenCue('DEEP');
    this.router.show(
      new DraftScreen(
        ROSTER.map((c) => c.id),
        makeRng(`draft-${this.seedBase()}-${this.gameNo}`),
        (c) => this.sound.sayDraft(c),
        (playerTeam, aiTeam) => {
          this.rosters = { away: playerTeam, home: aiTeam };
          // The batting order is a choice, not a gate: the drafted order bats
          // unless the player opens BATTING ORDER on the team screen
          // (maintainer decision, 2026-09-29).
          this.showTeam();
        },
        (id, pool, playerTeam, aiTeam, host, mode) =>
          this.game.setDraftSpotlight(id, pool, playerTeam, aiTeam, host, mode),
        (id) => this.lookup(id),
        !this.seasonDraft ? this.customPlayer?.id : undefined,
        () => this.showTitle()
      )
    );
  }

  /** One real strategy decision: the human batting order handed to the sim. */
  private showStrategy(): void {
    if (!this.rosters) return;
    this.game.setScreenCue('PLAY');
    this.router.show(
      new StrategyScreen(
        this.rosters.away,
        (order) => {
          if (!this.rosters) return;
          this.rosters.away = order;
          if (this.seasonGame) void this.playBall();
          else this.showTeam();
        },
        (id) => this.lookup(id)
      )
    );
  }

  /** Colours and a logo, which together are the team's spoken name. */
  private showTeam(): void {
    this.game.setScreenCue('PLAY');
    this.router.show(
      new TeamScreen(
        this.identity,
        this.innings,
        this.night,
        this.venue,
        (n) => {
          this.innings = n;
        },
        (night) => {
          this.night = night;
          // The same preview rule as the colours: the park behind the screen
          // IS the park the game starts in.
          this.game.applyNight(night);
        },
        (v) => {
          this.venue = v;
          this.game.applyVenue(v);
        },
        (t) => {
          this.identity = t;
          void this.dress();
        },
        (t) => {
          this.identity = t;
          setTeamIdentity(t);
          this.game.setSkill(this.skill);
          if (this.seasonDraft && this.rosters) {
            const season = newSeason(
              this.rosters.away,
              t,
              ROSTER.map((c) => c.id),
              makeRng(`season-${this.seedBase()}-${this.gameNo}`)
            );
            saveSeason(season);
            this.seasonDraft = false;
            this.showSeason(season);
          } else {
            void this.playBall();
          }
        },
        this.skill,
        (k) => {
          this.skill = k;
          saveSkill(k);
          this.game.setSkill(k);
        },
        () => this.showStrategy()
      )
    );
  }

  /** Put the drafted nine in the chosen colour, live behind the picker. */
  private async dress(): Promise<void> {
    if (!this.rosters) return;
    this.game.setTeamNames(this.names());
    await this.game.newGame(this.seed(), this.rosters, this.uniforms(), this.innings);
  }

  private rival(): TeamIdentity {
    if (this.seasonGame && this.season) {
      return this.season.rivals[this.season.gameIndex] ?? pickRival(this.identity, this.gameNo);
    }
    return pickRival(this.identity, this.gameNo);
  }

  private names() {
    return { away: teamName(this.identity), home: teamName(this.rival()) };
  }

  private uniforms() {
    return { away: this.identity.color, home: this.rival().color };
  }

  private async playBall(): Promise<void> {
    this.game.setScreenCue(null);
    // The lesson always plays T-BALL with the ring; otherwise the chosen level,
    // with the ring on for the two easy ones.
    const lesson = this.activeMode === 'lesson';
    const skill = lesson ? 'tball' : this.skill;
    this.game.setSkill(skill);
    this.game.setTimingRing(lesson || skill === 'tball' || skill === 'rookie');
    this.coach.setLesson(lesson);
    this.coach.reset();
    this.gameNo += 1;
    this.sound.reset();
    this.game.setTeamNames(this.names());
    await this.game.newGame(this.seed(), this.rosters ?? undefined, this.uniforms(), this.innings);
    // A PERSON'S game is starting — this is the one place a session opens.
    // The attract game behind the title and the team-picker preview never do.
    this.log?.begin();
    // ★ THE BOOTH SAYS THE NAME. It is the payoff for the whole screen, and it
    // is why the name is a spoken colour and a spoken animal rather than text.
    this.sound.sayTeam(teamName(this.identity));
    // Only drafted games advance the pick-rate denominator. Practice/watch has
    // no votes, so counting it would quietly depress every authored pick rate.
    if (this.activeMode === 'pickup' || this.activeMode === 'season') recordGamePlayed();
    this.router.hide();
  }

  private seedBase(): string {
    return new URLSearchParams(location.search).get('seed') ?? 'play';
  }

  private seed(): string {
    return this.gameNo <= 1 ? this.seedBase() : `${this.seedBase()}-${this.gameNo}`;
  }

  private lookup(id: string): Character {
    return this.customPlayer?.id === id ? this.customPlayer : getCharacter(id);
  }

  private showResult(result: GameResult): void {
    this.game.setScreenCue('PITCH_HERO');
    // ★ THE ATTRACT GAME MUST NOT INTERRUPT THE TITLE. A game is already running
    // behind the front screen so the park is alive, and it can reach the ninth
    // while a kid is deciding — which would slap a Result screen for a game
    // nobody played over the PLAY button. If a screen is up, the game on the
    // canvas is scenery.
    if (this.router.showing) return;
    const model = resultModel(
      result,
      { ...this.game.teams, you: this.game.humanSide },
      [...ROSTER.map((c) => c.id), ...(this.customPlayer ? [this.customPlayer.id] : [])]
    );
    // One completed v2 game advances the SAME sticker book v1 shows. Only the
    // human roster counts: CPU picks are neither votes nor earned stickers.
    const playerIds = this.rosters?.[this.game.humanSide] ?? [];
    // An online game was drafted by a person too — it earns stickers like any
    // other drafted game, for the nine on THIS device's side.
    const isProgressGame =
      this.activeMode === 'pickup' || this.activeMode === 'season' || this.activeMode === 'online';
    if (isProgressGame) {
      const authored = new Set(ROSTER.map((c) => c.id));
      recordAlbumGame(playerIds.filter((id) => authored.has(id)), model.verdict === 'win');
    }
    let completedWeek: SeasonState | null = null;
    if (this.activeMode === 'season' && this.seasonGame && this.season) {
      completedWeek = recordSeasonGame(
        this.season,
        model.verdict === 'win' ? 'W' : model.verdict === 'loss' ? 'L' : 'T',
        statEventsFromLines(result.lines)
      );
      saveSeason(completedWeek);
      this.season = completedWeek;
      this.seasonGame = false;
    }
    if (this.activeMode === 'online') {
      this.showOnlineResult(model);
      return;
    }
    this.router.show(
      new ResultScreen(
        model,
        (id) => this.lookup(id),
        // PLAY AGAIN is a REMATCH — same nine kids, so a player is not made to
        // re-draft to have another go at a team they just built.
        () => completedWeek ? this.showSeason(completedWeek) : void this.playBall(),
        () => this.showTitle(),
        completedWeek
          ? { again: '📅  BACK TO WEEK' }
          : this.activeMode === 'watch'
            ? { headline: 'FINAL SCORE', again: '🍿  WATCH AGAIN' }
            : this.activeMode === 'versus'
              ? { headline: versusHeadline(result.awayScore, result.homeScore), again: '👥  REMATCH' }
            : this.activeMode === 'batting' || this.activeMode === 'pitching' || this.activeMode === 'lesson'
              ? { headline: 'NICE WORK!', again: '🎯  PRACTICE AGAIN' }
              : undefined
      )
    );
  }

  // --- Online ---------------------------------------------------------------

  /** MAKE A GAME / JOIN A GAME. Leaving it leaves the room. */
  private showLobby(): void {
    this.leaveOnline();
    this.game.setScreenCue('PLAY');
    const lobby = new LobbyScreen(
      () => void this.openMatch().host(),
      (code) => void this.openMatch().join(code),
      () => {
        this.leaveOnline();
        this.showModes();
      }
    );
    this.lobby = lobby;
    this.router.show(lobby);
  }

  /** A fresh room object, carrying this device's colours and table rules. */
  private openMatch(): OnlineMatch {
    this.match?.leave();
    const hooks: OnlineHooks = {
      onLobby: (state) => {
        const lobby = this.lobby;
        if (!lobby || this.router.showing !== lobby) return;
        if (state.s === 'hosting') lobby.showCode(state.code);
        else if (state.s === 'finding') lobby.showFinding();
        else {
          this.match?.leave();
          this.match = null;
          lobby.showFailed(state.why);
        }
      },
      onDraft: () => this.showOnlineDraft(),
      onStart: (start) => void this.playOnline(start.rosters),
      onPause: (paused) => this.friendPaused(paused),
      onStatus: (status) => {
        if (status === 'gone') this.friendGone('GOOD GAME!');
        else if (this.onlineLive) this.friendLost(status === 'reconnecting');
      },
      onBye: () => this.friendGone('GOOD GAME!'),
      onDesync: () => this.friendGone('GOOD GAME!'),
      onRematch: (vote) => {
        if (vote.agreed) {
          this.match?.beginDraft();
          this.showOnlineDraft();
        } else {
          this.onlineResult?.setAgain(vote.waitingOnThem ? '🔍  WAITING…' : '🔁  PLAY AGAIN!');
        }
      },
    };
    const match = new OnlineMatch(
      this.identity,
      { innings: this.innings, venueId: this.venue, night: this.night },
      hooks,
      TEAM_COLOR_NAMES.length
    );
    this.match = match;
    return match;
  }

  /**
   * The draft, with a friend picking where the CPU would. Every tap is still a
   * vote, and only THIS device's taps: the friend's picks were counted on the
   * friend's device (`draftSession.pickByFriend`).
   */
  private showOnlineDraft(): void {
    const match = this.match;
    if (!match) return;
    this.lobby = null;
    this.onlineResult = null;
    this.onlineLive = false;
    this.activeMode = 'online';
    this.rosters = null;
    this.seasonDraft = false;
    // The host's table rules win; the guest's park becomes the host's.
    this.innings = match.settings.innings;
    const venue = match.settings.venueId as VenueId;
    if (venue in VENUE_GEOMETRY && venue !== this.venue) {
      this.venue = venue;
      this.game.applyVenue(venue);
    }
    if (match.settings.night !== this.night) {
      this.night = match.settings.night;
      this.game.applyNight(this.night);
    }
    this.game.setControlMode(match.role === 'host' ? 'both' : 'home');
    this.game.setScreenCue('DEEP');
    this.router.show(
      new DraftScreen(
        ROSTER.map((c) => c.id),
        makeRng(`draft-online-${this.gameNo}`),
        (c) => this.sound.sayDraft(c),
        (mine, theirs) => this.onlineDrafted(mine, theirs),
        (id, pool, playerTeam, aiTeam, host, mode) =>
          this.game.setDraftSpotlight(id, pool, playerTeam, aiTeam, host, mode),
        (id) => this.lookup(id),
        undefined,
        () => this.showTitle(),
        {
          first: match.role === 'host',
          send: (id) => match.sendPick(id),
          onPick: (fn) => match.onFriendPick(fn),
        }
      )
    );
  }

  /** Both benches are full. The host says PLAY BALL; the guest waits to hear it. */
  private onlineDrafted(mine: string[], theirs: string[]): void {
    const match = this.match;
    if (!match || this.onlineLive) return;
    if (match.role === 'host') {
      const rosters = { away: mine, home: theirs };
      match.sendStart({ rosters });
      void this.playOnline(rosters);
    } else {
      this.router.show(new NoticeScreen('⚾', 'GET READY!', 'HERE COMES THE FIRST PITCH'));
    }
  }

  /** PLAY BALL, on either device: the same two nines, the same two colours. */
  private async playOnline(rosters: { away: string[]; home: string[] }): Promise<void> {
    const match = this.match;
    if (!match?.identities || this.onlineLive) return;
    this.onlineLive = true;
    this.borrowedField = match.role === 'guest';
    this.rosters = rosters;
    const ids = match.identities;
    this.game.setScreenCue(null);
    this.game.setSkill(this.skill);
    this.game.setTimingRing(this.skill === 'tball' || this.skill === 'rookie');
    this.coach.setLesson(false);
    this.coach.reset();
    this.gameNo += 1;
    this.sound.reset();
    this.game.setTeamNames({ away: teamName(ids.away), home: teamName(ids.home) });
    await this.game.newGame(
      this.seed(),
      rosters,
      { away: ids.away.color, home: ids.home.color },
      this.innings,
      match.seat
    );
    // The friend may have left while eighteen kids were dressing.
    if (this.match !== match) return;
    this.log?.begin();
    this.sound.sayTeam(teamName(match.role === 'host' ? ids.away : ids.home));
    recordGamePlayed();
    this.router.hide();
  }

  /** The friend's pause is ours too: say why the game stopped. */
  private friendPaused(paused: boolean): void {
    if (!this.onlineLive) return;
    if (paused) {
      if (this.router.showing) return; // we are paused ourselves
      this.game.setPaused(true);
      this.onlineNotice = 'paused';
      this.router.show(new NoticeScreen('⏸', 'YOUR FRIEND PAUSED', 'BACK IN A MOMENT'));
    } else if (this.onlineNotice === 'paused') {
      this.onlineNotice = null;
      this.router.hide();
      this.game.setPaused(false);
    }
  }

  /** The channel dropped mid-game (and may come back), or came back. */
  private friendLost(lost: boolean): void {
    if (lost) {
      if (this.router.showing) return;
      this.game.setPaused(true);
      this.onlineNotice = 'lost';
      this.router.show(
        new NoticeScreen('🔍', 'LOOKING FOR YOUR FRIEND…', '', {
          label: '🏠  HOME',
          onTap: () => this.showTitle(),
        })
      );
    } else if (this.onlineNotice === 'lost') {
      this.onlineNotice = null;
      this.router.hide();
      this.game.setPaused(false);
    }
  }

  /**
   * The friend left, or the channel is gone for good. Never a word about who
   * or why (`NoticeScreen`). On the Result screen the game is already over, so
   * only the rematch goes away.
   */
  private friendGone(title: string): void {
    if (!this.match) return;
    const onResult = this.onlineResult !== null && this.router.showing === this.onlineResult;
    const result = this.onlineResult;
    const inLobby = this.lobby !== null && this.router.showing === this.lobby;
    this.leaveOnline();
    if (onResult) {
      result?.setAgain('👋  FRIEND WENT HOME', false);
      return;
    }
    if (inLobby) return this.showLobby();
    this.game.setPaused(false);
    this.router.show(
      new NoticeScreen('👋', title, 'YOUR FRIEND WENT HOME', {
        label: '🏠  HOME',
        onTap: () => this.showTitle(),
      })
    );
  }

  /** An online game's Result: PLAY AGAIN is a vote both kids cast. */
  private showOnlineResult(model: ReturnType<typeof resultModel>): void {
    this.onlineLive = false;
    this.game.leaveOnline();
    const screen = new ResultScreen(
      model,
      (id) => this.lookup(id),
      () => this.match?.voteRematch(),
      () => this.showTitle(),
      { again: '🔁  PLAY AGAIN' }
    );
    this.onlineResult = screen;
    this.router.show(screen);
    if (!this.match?.connected) screen.setAgain('👋  FRIEND WENT HOME', false);
    else if (this.match.vote.theyAsked) screen.setAgain('🔁  PLAY AGAIN!');
  }

  /** Leave the room, if there is one. Safe from anywhere, any number of times. */
  private leaveOnline(): void {
    this.match?.leave();
    this.match = null;
    this.lobby = null;
    this.onlineResult = null;
    this.onlineNotice = null;
    this.onlineLive = false;
    this.game.leaveOnline();
    this.game.setPaused(false);
    // A guest's field was the host's game; give the park its own again, so the
    // title's window is not a frozen frame.
    if (this.borrowedField) {
      this.borrowedField = false;
      void this.game.newGame(this.seed());
    }
  }
}
