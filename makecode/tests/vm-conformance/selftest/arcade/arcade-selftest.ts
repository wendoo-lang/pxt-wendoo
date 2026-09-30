/*
 * Test-only surface: `gen-selftest.js` copies this file into the generated
 * arcade selftest project and lists it in that project's `pxt.json`.
 */

/**
 * The arcade selftest: it gives sprites of a running Arcade game the
 * programs the project's brains module declares, through the Wendoo arcade
 * extension's block function, and reports how the programs ran across the
 * game's frames.
 *
 * Output grammar, one line each:
 *
 * - `CHECK <check> ok` or `CHECK <check> failed`, one per check.
 * - `ASSERT <check>` -- follows each failed check; the capture harness reads
 *   it as the run's failure.
 * - `wendoo program-rejected <code> <id>` -- one per program a scene's host
 *   refused, as the host logs it.
 * - `SIMCAP PASS <case>` -- the run reached its end.
 */
namespace arcadeSelftest {
  /** Manifest id the capture harness brackets this run's output with. */
  export const SELFTEST_CASE_ID = "arcade-selftest";

  /** Document id of the ticker program. */
  const TICKER_ID = "akBQz0nySKaYx37w";

  /** Document ids of the two programs named `Twin`. */
  const TWIN_IDS = ["Hq7EB8SthdeOudyP", "LBddvitRopf1wCnj"];

  /** What {@link programOf} answers for a sprite running no program. */
  const NOT_RUNNING = "<not running>";

  /** Milliseconds the selftest lets the game run between checks: several frames. */
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

  /** The program `sprite` runs in the current scene, or `undefined` when it runs none. */
  function hostedOf(sprite: Sprite): wendoo.HostedProgram {
    const hosted = wendoo.sceneProgramHost(game.currentScene()).hostedPrograms();
    for (let i = 0; i < hosted.length; i++) {
      if ((hosted[i].world as wendoo.SpriteWorld).sprite === sprite) {
        return hosted[i];
      }
    }
    return undefined;
  }

  /** The document id of the program `sprite` runs in the current scene, or {@link NOT_RUNNING}. */
  function programOf(sprite: Sprite): string {
    const hosted = hostedOf(sprite);
    return hosted === undefined ? NOT_RUNNING : hosted.loaded.registration.id;
  }

  /** How many thinks the program `sprite` runs has had, or -1 when it runs none. */
  function ticksOf(sprite: Sprite): number {
    const hosted = hostedOf(sprite);
    return hosted === undefined ? -1 : hosted.runtime.tickCount();
  }

  /** A new sprite of `kind` in the current scene. */
  function newSprite(kind: number): Sprite {
    return sprites.create(image.create(2, 2), kind);
  }

  /**
   * Give sprites their programs, let the game run, and check the programs
   * ran on their sprites: paired by id, thinking each frame, two programs
   * sharing a name each on its own sprite, the empty program running
   * nothing, a destroyed sprite's program ended, and a pushed scene pausing
   * its programs while the new scene runs its own.
   */
  export function run(): void {
    console.log(`SIMCAP START ${SELFTEST_CASE_ID}`);

    const ticker = newSprite(SpriteKind.Player);
    const twinA = newSprite(SpriteKind.Player);
    const twinB = newSprite(SpriteKind.Enemy);
    const idle = newSprite(SpriteKind.Enemy);
    wendoo.runProgram(ticker, wendooPrograms.p_akBQz0nySKaYx37w);
    wendoo.runProgram(twinA, wendooPrograms.p_Hq7EB8SthdeOudyP);
    wendoo.runProgram(twinB, wendooPrograms.p_LBddvitRopf1wCnj);
    wendoo.runProgram(idle, wendooPrograms.none);
    check("program-waits-for-the-next-frame", programOf(ticker) === NOT_RUNNING);

    pause(FRAMES_MS);
    check(
      "program-runs-on-its-sprite-by-id",
      programOf(ticker) === TICKER_ID &&
        programOf(twinA) === TWIN_IDS[0] &&
        programOf(twinB) === TWIN_IDS[1] &&
        programOf(idle) === wendooPrograms.none.id
    );
    const firstTicks = ticksOf(twinA);
    pause(FRAMES_MS);
    check(
      "programs-think-each-frame",
      firstTicks > 0 && ticksOf(twinA) > firstTicks && ticksOf(twinB) > firstTicks && ticksOf(idle) > firstTicks
    );

    ticker.destroy();
    pause(FRAMES_MS);
    let faults = 0;
    const hosted = wendoo.sceneProgramHost(game.currentScene()).hostedPrograms();
    for (let i = 0; i < hosted.length; i++) {
      faults += hosted[i].runtime.faults().length;
    }
    check("destroyed-sprite-program-ends", programOf(ticker) === NOT_RUNNING && hosted.length === 3 && faults === 0);

    const pausedTicks = ticksOf(twinA);
    game.pushScene();
    const pushed = newSprite(SpriteKind.Player);
    wendoo.runProgram(pushed, wendooPrograms.p_akBQz0nySKaYx37w);
    pause(FRAMES_MS);
    check("pushed-scene-runs-its-own-programs", programOf(pushed) === TICKER_ID && ticksOf(pushed) > 0);
    game.popScene();
    check("pushed-scene-pauses-programs-below-it", ticksOf(twinA) === pausedTicks);
    pause(FRAMES_MS);
    check("popped-scene-resumes-its-programs", ticksOf(twinA) > pausedTicks);

    console.log(`CHECKS failed ${failedChecks}`);
    console.log(`SIMCAP PASS ${SELFTEST_CASE_ID}`);
  }
}
