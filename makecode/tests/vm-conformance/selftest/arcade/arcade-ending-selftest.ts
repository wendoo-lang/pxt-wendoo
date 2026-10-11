/*
 * Test-only surface: `gen-selftest.js` copies this file into each generated
 * arcade ending project and lists it in that project's `pxt.json`.
 */

/**
 * The arcade ending selftest: one run ends a running Arcade game one way --
 * as a loss, as a win, as a player's win, or as a win from the final think
 * of a program that destroyed its own sprite -- through a program placing
 * the arcade base pack's game-over tile, and reports how the game ended. Each
 * ending runs in a project of its own, its `main.ts` naming the ending. The
 * game's code handles game over, so the run goes on past the ending to
 * report it: Arcade hands that handler whether the game was won, and the run
 * reads the effect and sound Arcade's game-over settings hold for that
 * outcome as the handler runs.
 *
 * Output grammar, one line each:
 *
 * - `CHECK <check> ok` or `CHECK <check> failed`, one per check.
 * - `ASSERT <check>` -- follows each failed check; the capture harness reads
 *   it as the run's failure.
 * - `wendoo program-rejected <code> <id>` -- one per program the scene's host
 *   refused, as the host logs it.
 * - `wendoo WENDOO_EFFECT_UNUSABLE` and `wendoo WENDOO_SOUND_UNUSABLE` -- one
 *   each for the whole run, the first time the game-over tile is given an
 *   effect or a sound naming nothing Arcade holds, as the arcade base pack
 *   logs them.
 * - `wendoo program-faulted <code> <id>` -- one per fault code the program
 *   raised; a run whose program runs without a fault logs none.
 * - `DEBUG ON` -- the run turned the Wendoo extensions' debug logging on;
 *   none of the `wendoo` lines above precede it.
 * - `SIMCAP PASS <case>` -- the run reached its end.
 */
namespace arcadeEndingSelftest {
  /** The ending whose program places a bare game over. */
  export const LOSE = "lose";

  /** The ending whose program places a game over given `win` and an effect and a sound naming nothing Arcade holds. */
  export const WIN = "win";

  /** The ending whose program places a game over given `lose`, player two, an effect and a sound. */
  export const PLAYER = "player";

  /** The ending whose program destroys its own sprite and places a game over given `win` under destroyed. */
  export const DESTROYED = "destroyed";

  /** Milliseconds the run lets the game run between readings: several frames. */
  const FRAMES_MS = 120;

  /** How many checks reported a failure. */
  let failedChecks = 0;

  /**
   * Report one check and, when it failed, the assertion the capture harness
   * reads as the run's failure.
   *
   * @param name - Stable name of the check.
   * @param ok - Whether the check holds.
   */
  function check(name: string, ok: boolean): void {
    console.log(`CHECK ${name} ${ok ? "ok" : "failed"}`);
    if (!ok) {
      failedChecks++;
      console.log(`ASSERT ${name}`);
    }
  }

  /** How many thinks the program `sprite` runs in the current scene has had, or -1 when it runs none. */
  function ticksOf(sprite: Sprite): number {
    const hosted = wendoo.sceneProgramHost(game.currentScene()).hostedPrograms();
    for (let i = 0; i < hosted.length; i++) {
      if ((hosted[i].attachment as wendoo.SpriteAttachment).sprite === sprite) {
        return hosted[i].runtime.tickCount();
      }
    }
    return -1;
  }

  /** The melody `sound` plays, or `undefined` when it plays no built-in melody. */
  function melodyOf(sound: music.Playable): music.Melody {
    return sound instanceof music.MelodyPlayable ? (sound as music.MelodyPlayable).melody : undefined;
  }

  /**
   * How the game ended, as the game's own game-over handler saw it: how many
   * times Arcade called the handler, whether the game was won, and the
   * effect and melody Arcade's game-over settings held, for each outcome, as
   * the handler ran, with whether game code -- the game-over tile included --
   * had set an effect or a sound.
   */
  class SeenEnding {
    /** How many times Arcade called the handler. */
    calls: number;
    /** Whether the game was won, as Arcade told the handler. */
    win: boolean;
    /** The effect the settings held for a win. */
    winEffect: effects.BackgroundEffect;
    /** The melody the settings held for a win, or `undefined` for a sound that is no built-in melody. */
    winMelody: music.Melody;
    /** The effect the settings held for a loss. */
    loseEffect: effects.BackgroundEffect;
    /** The melody the settings held for a loss, or `undefined` for a sound that is no built-in melody. */
    loseMelody: music.Melody;
    /** Whether game code had set an effect. */
    effectSet: boolean;
    /** Whether game code had set a sound. */
    soundSet: boolean;
    /** Whether the sprite {@link SeenEnding.watched} names was destroyed as the handler ran; `false` while it names none. */
    watchedDestroyed: boolean;
    /** The sprite whose destruction the handler reads, or `undefined` for none. */
    watched: Sprite;

    constructor() {
      this.calls = 0;
      this.win = false;
      this.effectSet = false;
      this.soundSet = false;
      this.watchedDestroyed = false;
    }

    /** Record one call of the handler, given `win`, reading the settings as they stand. */
    record(win: boolean): void {
      const config = game.gameOverConfig();
      this.calls++;
      this.win = win;
      this.winEffect = config.getEffect(true);
      this.winMelody = melodyOf(config.getSound(true));
      this.loseEffect = config.getEffect(false);
      this.loseMelody = melodyOf(config.getSound(false));
      this.effectSet = config.effectSetByUser;
      this.soundSet = config.soundSetByUser;
      this.watchedDestroyed = this.watched !== undefined && wendoo.isDestroyed(this.watched);
    }
  }

  /**
   * The program the ending `ending` runs: one game-over rule on every frame,
   * or, for {@link DESTROYED}, a bare destroy on every frame and a game-over
   * rule under destroyed.
   */
  function programFor(ending: string): wendoo.CompiledBrainRegistration {
    if (ending === WIN) {
      return wendooBrains.p_endingWinUnheld1;
    }
    if (ending === DESTROYED) {
      return wendooBrains.p_endingDestroyed1;
    }
    return ending === PLAYER ? wendooBrains.p_endingPlayerTwo1 : wendooBrains.p_endingLoseBare01;
  }

  /**
   * Check the loss a bare game over ends the game with: Arcade ends it once
   * as a loss, the rule acting again on every later frame ending nothing, and
   * the program runs on; and the loss keeps Arcade's own effect and sound,
   * melt and wawawawaa, none set.
   */
  function checkLoss(seen: SeenEnding, runsOn: boolean): void {
    check(
      "a-bare-game-over-ends-the-game-once-as-a-loss-and-its-program-runs-on",
      seen.calls === 1 && !seen.win && runsOn
    );
    check(
      "a-game-over-given-no-effect-or-sound-leaves-the-loss-with-arcades-own",
      !seen.effectSet && !seen.soundSet && seen.loseEffect === effects.melt && seen.loseMelody === music.wawawawaa
    );
  }

  /**
   * Check the win a game over given `win` ends the game with: Arcade ends it
   * once as a win and the program runs on; and given an effect and a sound
   * naming nothing Arcade holds -- the program compiled against literals
   * naming effects and melodies this pack does not hold -- the win keeps
   * Arcade's own effect and sound, confetti and power up, none set, each
   * logged once for the run however many frames the rule acts on.
   */
  function checkWin(seen: SeenEnding, runsOn: boolean): void {
    check(
      "a-game-over-given-win-ends-the-game-once-as-a-win-and-its-program-runs-on",
      seen.calls === 1 && seen.win && runsOn
    );
    check(
      "a-game-over-given-an-effect-and-a-sound-naming-nothing-leaves-the-win-with-arcades-own",
      !seen.effectSet && !seen.soundSet && seen.winEffect === effects.confetti && seen.winMelody === music.powerUp
    );
  }

  /**
   * Check the ending a game over given a player ends the game with: Arcade
   * ends it once as a win, though the program's game over also says `lose`,
   * and the program runs on; the game-over handler is told only that the
   * game was won, so the check holds the win and not which player won it.
   * Given an effect and a sound, the win -- the outcome the game ends with --
   * shows hearts and plays jump up, set before the game ended, and the loss
   * keeps Arcade's own.
   */
  function checkPlayerWin(seen: SeenEnding, runsOn: boolean): void {
    check(
      "a-game-over-given-a-player-ends-the-game-once-as-a-win-even-given-lose-and-its-program-runs-on",
      seen.calls === 1 && seen.win && runsOn
    );
    check(
      "a-game-over-given-an-effect-and-a-sound-sets-them-for-the-win-it-ends-the-game-with",
      seen.effectSet &&
        seen.soundSet &&
        seen.winEffect === effects.hearts &&
        seen.winMelody === music.jumpUp &&
        seen.loseEffect === effects.melt &&
        seen.loseMelody === music.wawawawaa
    );
  }

  /**
   * Check the ending a program destroying its own sprite ends the game with:
   * its first think destroys the sprite, and its final think, the next
   * frame, fires its game over given `win` under destroyed, which ends the
   * game once as a win with the sprite already destroyed; the program is gone
   * after it.
   */
  function checkDestroyedWin(seen: SeenEnding, sprite: Sprite): void {
    check(
      "a-brain-destroying-its-own-sprite-ends-the-game-once-from-its-final-think-and-is-gone-after",
      seen.calls === 1 && seen.win && wendoo.isDestroyed(sprite) && ticksOf(sprite) === -1
    );
    check("the-game-ends-with-the-sprite-already-destroyed", seen.watchedDestroyed);
  }

  /**
   * Turn debug logging on, handle game over in game code, give a sprite the
   * program of the ending `ending` -- {@link LOSE}, {@link WIN},
   * {@link PLAYER} or {@link DESTROYED} -- let the game run, and check how
   * the game ended.
   *
   * @param ending - Which ending the run checks.
   */
  export function run(ending: string): void {
    const caseId = `arcade-ending-${ending}`;
    console.log(`SIMCAP START ${caseId}`);
    console.log("DEBUG ON");
    wendoo.debug = true;

    const seen = new SeenEnding();
    game.onGameOver((win: boolean) => {
      seen.record(win);
    });
    const sprite = sprites.create(image.create(2, 2), SpriteKind.Player);
    seen.watched = sprite;
    wendoo.runBrain(sprite, programFor(ending));
    pause(FRAMES_MS);
    const firstTicks = ticksOf(sprite);
    pause(FRAMES_MS);
    const runsOn = firstTicks > 0 && ticksOf(sprite) > firstTicks;

    if (ending === WIN) {
      checkWin(seen, runsOn);
    } else if (ending === DESTROYED) {
      checkDestroyedWin(seen, sprite);
    } else if (ending === PLAYER) {
      checkPlayerWin(seen, runsOn);
    } else {
      checkLoss(seen, runsOn);
    }

    console.log(`CHECKS failed ${failedChecks}`);
    console.log(`SIMCAP PASS ${caseId}`);
  }
}
