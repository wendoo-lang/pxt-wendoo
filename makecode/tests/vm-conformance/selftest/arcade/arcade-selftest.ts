/*
 * Test-only surface: `gen-selftest.js` copies this file into the generated
 * arcade selftest project and lists it in that project's `pxt.json`.
 */

/**
 * The arcade selftest: it gives sprites of a running Arcade game the
 * programs the project's brains module declares, through the Wendoo arcade
 * extension's block function, and reports how the programs ran across the
 * game's frames -- among them programs placing the arcade base pack's dpad
 * and move tiles, driven by pressing the controller's buttons from game code,
 * and programs updated while the game runs, through the messages the Wendoo
 * simulator extension posts.
 *
 * Output grammar, one line each:
 *
 * - `CHECK <check> ok` or `CHECK <check> failed`, one per check.
 * - `ASSERT <check>` -- follows each failed check; the capture harness reads
 *   it as the run's failure.
 * - `wendoo program-rejected <code> <id>` -- one per program a scene's host
 *   refused, as the host logs it.
 * - `wendoo program-updated <id> <source-hash>`, `wendoo program-removed <id>`,
 *   `wendoo program-update-rejected <code> <id>`, and
 *   `wendoo sim-channel-rejected <code>` -- one per program update taken,
 *   removal taken, update refused, and message refused, as the VM extension
 *   logs them.
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

  /**
   * How far a velocity may read from the one a check expects, in pixels per
   * second; wider than the 1/256 step of a sprite's fixed-point velocity.
   */
  const VELOCITY_TOLERANCE = 0.05;

  /** How far a computed number may read from the one a check expects. */
  const NUMBER_TOLERANCE = 1e-9;

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

  /** Whether `actual` is within `tolerance` of `expected`. */
  function near(actual: number, expected: number, tolerance: number): boolean {
    return Math.abs(actual - expected) <= tolerance;
  }

  /** Whether `sprite` moves at the velocity `vx`, `vy`, in pixels per second. */
  function movesAt(sprite: Sprite, vx: number, vy: number): boolean {
    return near(sprite.vx, vx, VELOCITY_TOLERANCE) && near(sprite.vy, vy, VELOCITY_TOLERANCE);
  }

  /** Whether `direction` is `x`, `y`. */
  function pointsAt(direction: wendoo.DirectionVector, x: number, y: number): boolean {
    return near(direction.x, x, NUMBER_TOLERANCE) && near(direction.y, y, NUMBER_TOLERANCE);
  }

  /** A sprite running `program` from the next frame. */
  function spriteRunning(program: wendoo.CompiledBrainRegistration): Sprite {
    const sprite = newSprite(SpriteKind.Player);
    wendoo.runProgram(sprite, program);
    return sprite;
  }

  /**
   * Check the arcade base pack's direction arithmetic directly: the analog
   * dead band and its live band, the direction modifiers' mask, the move's
   * direction fallback, and its speed. Call it once the program hosts have
   * drained registrations.
   */
  function checkDirectionArithmetic(): void {
    check(
      "dead-band-reads-zero-inside-the-band",
      wendoo.deadBandAxis(wendoo.DPAD_DEAD_BAND) === 0 &&
        wendoo.deadBandAxis(-wendoo.DPAD_DEAD_BAND) === 0 &&
        wendoo.deadBandAxis(0.05) === 0
    );
    const justAbove = wendoo.deadBandAxis(wendoo.DPAD_DEAD_BAND + 0.009);
    check("live-band-rises-from-zero-at-the-band-edge", justAbove > 0 && near(justAbove, 0.01, NUMBER_TOLERANCE));
    check(
      "live-band-rescales-to-full-deflection",
      near(wendoo.deadBandAxis(0.55), 0.5, NUMBER_TOLERANCE) &&
        near(wendoo.deadBandAxis(-0.55), -0.5, NUMBER_TOLERANCE) &&
        wendoo.deadBandAxis(1) === 1 &&
        wendoo.deadBandAxis(-1) === -1
    );

    const stick = new wendoo.DirectionVector(0.6, -0.8);
    check(
      "modifier-mask-keeps-only-admitted-components",
      pointsAt(wendoo.maskDirection(stick, true, false, false, false), 0, -0.8) &&
        pointsAt(wendoo.maskDirection(stick, false, false, true, false), 0, 0) &&
        pointsAt(wendoo.maskDirection(stick, false, true, false, true), 0.6, 0) &&
        pointsAt(wendoo.maskDirection(stick, true, true, true, true), 0.6, -0.8)
    );

    const leftward = wendoo.vector2Value(new wendoo.DirectionVector(-1, 0));
    const downward = wendoo.vector2Value(new wendoo.DirectionVector(0, 1));
    check("explicit-direction-beats-when-result", pointsAt(wendoo.moveDirection(leftward, downward), -1, 0));
    check("when-result-direction-beats-the-default", pointsAt(wendoo.moveDirection(wendoo.NIL_VALUE, downward), 0, 1));
    check(
      "default-direction-without-a-given-or-sensed-one",
      pointsAt(wendoo.moveDirection(wendoo.NIL_VALUE, wendoo.mkNumber(1)), 1, 0) &&
        pointsAt(wendoo.moveDirection(wendoo.NIL_VALUE, wendoo.NIL_VALUE), 1, 0)
    );
    check(
      "move-speed-counts-steps-and-clamps-the-argument",
      wendoo.moveSpeed(wendoo.NIL_VALUE, wendoo.NIL_VALUE, wendoo.NIL_VALUE) === 100 &&
        wendoo.moveSpeed(wendoo.mkNumber(1), wendoo.NIL_VALUE, wendoo.NIL_VALUE) === 50 &&
        wendoo.moveSpeed(wendoo.NIL_VALUE, wendoo.mkNumber(2), wendoo.NIL_VALUE) === 400 &&
        wendoo.moveSpeed(wendoo.NIL_VALUE, wendoo.mkNumber(5), wendoo.NIL_VALUE) === 800 &&
        wendoo.moveSpeed(wendoo.NIL_VALUE, wendoo.NIL_VALUE, wendoo.mkNumber(30)) === 30 &&
        wendoo.moveSpeed(wendoo.NIL_VALUE, wendoo.NIL_VALUE, wendoo.mkNumber(-5)) === 0
    );
  }

  /**
   * Give sprites the programs placing the dpad and move tiles, drive them by
   * pressing and releasing the controller's buttons, and check how the
   * sprites move: a bare move and a move under a WHEN producing no direction
   * both move rightward; the dpad moves its sprite its way at the move's
   * speed, a diagonal as fast as a straight line; direction modifiers mask
   * the dpad, in either order; two moving rules blend by average; release
   * stops a sprite with one zero; and no frame without a move touches a
   * velocity game code set.
   */
  function checkMovement(): void {
    check("arcade-pack-registers-without-diagnostics", wendoo.registrationDiagnostics().length === 0);

    const drift = spriteRunning(wendooPrograms.p_driftBareMove001);
    const counted = spriteRunning(wendooPrograms.p_countedWhenMove1);
    const follow = spriteRunning(wendooPrograms.p_followDpadMove01);
    const rails = spriteRunning(wendooPrograms.p_railsLeftRight01);
    const corner = spriteRunning(wendooPrograms.p_cornerUpLeft0001);
    const cornerFlipped = spriteRunning(wendooPrograms.p_cornerLeftUp0001);
    const dash = spriteRunning(wendooPrograms.p_dashQuickly00001);
    const creep = spriteRunning(wendooPrograms.p_creepSlowly00001);
    const paced = spriteRunning(wendooPrograms.p_pacedSpeed000001);
    const blend = spriteRunning(wendooPrograms.p_blendTwoRules001);
    follow.vx = 37;
    pause(FRAMES_MS);
    check("bare-move-moves-in-the-default-direction", movesAt(drift, 100, 0));
    check("non-direction-when-result-moves-in-the-default-direction", movesAt(counted, 100, 0));
    check("quiet-frames-leave-a-game-set-velocity-alone", movesAt(follow, 37, 0));

    controller.right.setPressed(true);
    pause(FRAMES_MS);
    check("dpad-move-follows-the-dpad", movesAt(follow, 100, 0));
    check(
      "slowly-quickly-and-speed-set-the-speed",
      movesAt(dash, 400, 0) && movesAt(creep, 50, 0) && movesAt(paced, 30, 0)
    );

    controller.down.setPressed(true);
    pause(FRAMES_MS);
    const diagonal = 100 / Math.sqrt(2);
    check(
      "diagonal-moves-at-cardinal-speed",
      movesAt(follow, diagonal, diagonal) &&
        near(Math.sqrt(follow.vx * follow.vx + follow.vy * follow.vy), 100, VELOCITY_TOLERANCE)
    );
    check("direction-modifiers-mask-the-dpad", movesAt(rails, 100, 0));
    check("two-moving-rules-blend-by-average", movesAt(blend, 50, 50));

    controller.down.setPressed(false);
    controller.up.setPressed(true);
    pause(FRAMES_MS);
    check("modifier-order-does-not-matter", movesAt(corner, 0, -100) && movesAt(cornerFlipped, 0, -100));

    controller.up.setPressed(false);
    controller.right.setPressed(false);
    pause(FRAMES_MS);
    check(
      "release-stops-the-sprite",
      movesAt(follow, 0, 0) && movesAt(blend, 0, 0) && movesAt(corner, 0, 0) && movesAt(dash, 0, 0)
    );

    follow.vx = 25;
    blend.vy = -12;
    pause(FRAMES_MS);
    check("release-writes-one-zero", movesAt(follow, 25, 0) && movesAt(blend, 0, -12));
  }

  /** Append `value` to `out` as a ULEB128 unsigned integer. */
  function appendVarUint(out: number[], value: number): void {
    let rest = value;
    while (rest >= 0x80) {
      out.push((rest % 0x80) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    out.push(rest);
  }

  /** Append the ASCII text `text` to `out`, after its byte length as a ULEB128. */
  function appendText(out: number[], text: string): void {
    appendVarUint(out, text.length);
    for (let i = 0; i < text.length; i++) {
      out.push(text.charCodeAt(i));
    }
  }

  /**
   * The message the Wendoo simulator extension posts to update the program
   * `documentId`: a frame declaring channel version `version`, carrying the
   * program `bytecode` compiled from source hashed `sourceHash`, or the
   * program's removal when `bytecode` is empty.
   */
  function updateMessage(
    documentId: string,
    name: string,
    sourceHash: string,
    bytecode: Buffer,
    version: number
  ): Buffer {
    const out: number[] = [];
    const declaration = `${version}\n`;
    for (let i = 0; i < declaration.length; i++) {
      out.push(declaration.charCodeAt(i));
    }
    appendText(out, documentId);
    appendText(out, name);
    appendText(out, sourceHash);
    appendVarUint(out, bytecode.length);
    for (let i = 0; i < bytecode.length; i++) {
      out.push(bytecode[i]);
    }
    return Buffer.fromArray(out);
  }

  /**
   * Deliver to the program, as MakeCode delivers the Wendoo simulator
   * extension's messages, the update of `registration`'s program to
   * `bytecode` compiled from source hashed `sourceHash`.
   */
  function postUpdate(registration: wendoo.CompiledBrainRegistration, bytecode: Buffer, sourceHash: string): void {
    wendoo.receiveSimMessage(
      updateMessage(registration.id, registration.name, sourceHash, bytecode, wendoo.SIM_CHANNEL_VERSION)
    );
  }

  /** The runtime of the program `sprite` runs in the program host `host`, or `undefined` when it runs none there. */
  function runtimeIn(host: wendoo.ProgramHost, sprite: Sprite): wendoo.BrainRuntime {
    const hosted = host.hostedPrograms();
    for (let i = 0; i < hosted.length; i++) {
      if ((hosted[i].world as wendoo.SpriteWorld).sprite === sprite) {
        return hosted[i].runtime;
      }
    }
    return undefined;
  }

  /** How many faults the programs running in the current scene have raised. */
  function faultsInScene(): number {
    let faults = 0;
    const hosted = wendoo.sceneProgramHost(game.currentScene()).hostedPrograms();
    for (let i = 0; i < hosted.length; i++) {
      faults += hosted[i].runtime.faults().length;
    }
    return faults;
  }

  /**
   * Update programs while the game runs, as the Wendoo simulator extension
   * does when a program is saved, and check the running game takes them: a
   * program's sprites restart it from the update at the next frame and move
   * the update's way, its old instances gone without a fault, while another
   * program's sprites run on undisturbed; later spawns run the update; an
   * identical update restarts nothing; a refused update, a frame this
   * extension does not read, and an update for a program the game lacks all
   * leave the running programs as they were; a scene paused under another
   * takes the update when it resumes; and a removal leaves the program's
   * sprites running nothing.
   *
   * @param twinSprite - The sprite running the first program named `Twin` in the current scene.
   */
  function checkProgramUpdates(twinSprite: Sprite): void {
    const drift = wendooPrograms.p_driftBareMove001;
    const dashBytes = wendooPrograms.p_dashQuickly00001.bytecode;
    const host = wendoo.sceneProgramHost(game.currentScene());
    const swapped = spriteRunning(drift);
    const alsoSwapped = spriteRunning(drift);
    const bystander = spriteRunning(wendooPrograms.p_countedWhenMove1);
    controller.right.setPressed(true);
    pause(FRAMES_MS);
    const oldRuntime = runtimeIn(host, swapped);
    const oldTwinRuntime = runtimeIn(host, alsoSwapped);
    const bystanderRuntime = runtimeIn(host, bystander);
    const bystanderTicks = ticksOf(bystander);
    const hostedCount = host.hostedPrograms().length;
    const oldBytes = drift.bytecode;

    postUpdate(drift, dashBytes, "0000000a");
    check(
      "update-waits-for-the-next-frame",
      runtimeIn(host, swapped) === oldRuntime && drift.bytecode === oldBytes && movesAt(swapped, 100, 0)
    );

    pause(FRAMES_MS);
    const newRuntime = runtimeIn(host, swapped);
    check(
      "update-restarts-the-program-on-its-sprite",
      newRuntime !== undefined &&
        newRuntime !== oldRuntime &&
        hostedOf(swapped).loaded.registration === drift &&
        drift.bytecode.equals(dashBytes) &&
        movesAt(swapped, 400, 0)
    );
    check(
      "update-restarts-every-instance-of-the-program",
      runtimeIn(host, alsoSwapped) !== oldTwinRuntime && movesAt(alsoSwapped, 400, 0)
    );
    let oldStillHosted = false;
    const hosted = host.hostedPrograms();
    for (let i = 0; i < hosted.length; i++) {
      if (hosted[i].runtime === oldRuntime || hosted[i].runtime === oldTwinRuntime) {
        oldStillHosted = true;
      }
    }
    check(
      "update-ends-the-old-instances-cleanly",
      !oldStillHosted && hosted.length === hostedCount && faultsInScene() === 0
    );
    check(
      "update-leaves-other-programs-running",
      runtimeIn(host, bystander) === bystanderRuntime && ticksOf(bystander) > bystanderTicks
    );

    const spawned = spriteRunning(drift);
    pause(FRAMES_MS);
    check("later-spawns-run-the-update", movesAt(spawned, 400, 0) && hostedOf(spawned).loaded.registration === drift);

    postUpdate(drift, dashBytes, "0000000a");
    pause(FRAMES_MS);
    check("identical-update-restarts-nothing", runtimeIn(host, swapped) === newRuntime);

    postUpdate(drift, wendooPrograms.p_wrongProfile0001.bytecode, "0000000b");
    postUpdate(drift, wendooPrograms.p_unmappedMove0001.bytecode, "0000000c");
    postUpdate(drift, wendooPrograms.p_unmappedType0001.bytecode, "0000000d");
    pause(FRAMES_MS);
    check(
      "refused-updates-keep-the-old-program-running",
      runtimeIn(host, swapped) === newRuntime && drift.bytecode.equals(dashBytes) && movesAt(swapped, 400, 0)
    );

    const registered = wendoo.compiledBrainRegistrations().length;
    wendoo.receiveSimMessage(updateMessage(drift.id, drift.name, "0000000e", oldBytes, wendoo.SIM_CHANNEL_VERSION + 1));
    wendoo.receiveSimMessage(Buffer.fromArray([0x31, 0x0a, 0x10, 0x64]));
    wendoo.receiveSimMessage(Buffer.fromArray([0x78, 0x0a]));
    wendoo.receiveSimMessage(
      updateMessage("brandNewProgram1", "New", "0000000f", oldBytes, wendoo.SIM_CHANNEL_VERSION)
    );
    pause(FRAMES_MS);
    check(
      "unread-frames-and-unknown-programs-change-nothing",
      runtimeIn(host, swapped) === newRuntime &&
        drift.bytecode.equals(dashBytes) &&
        wendoo.compiledBrainRegistrations().length === registered
    );

    const twin = wendooPrograms.p_Hq7EB8SthdeOudyP;
    const twinBytes = wendooPrograms.p_LBddvitRopf1wCnj.bytecode;
    const belowRuntime = runtimeIn(host, twinSprite);
    game.pushScene();
    const above = spriteRunning(twin);
    postUpdate(twin, twinBytes, "00000010");
    pause(FRAMES_MS);
    const aboveRuns = hostedOf(above);
    check(
      "paused-scene-keeps-its-program-until-it-resumes",
      runtimeIn(host, twinSprite) === belowRuntime &&
        aboveRuns !== undefined &&
        aboveRuns.loaded.registration === twin &&
        twin.bytecode.equals(twinBytes)
    );
    game.popScene();
    pause(FRAMES_MS);
    const resumed = runtimeIn(host, twinSprite);
    check("paused-scene-takes-the-update-on-resume", resumed !== undefined && resumed !== belowRuntime);

    postUpdate(drift, Buffer.create(0), "");
    pause(FRAMES_MS);
    check(
      "removal-leaves-the-programs-sprites-running-nothing",
      runtimeIn(host, swapped) !== newRuntime &&
        drift.bytecode.equals(wendooPrograms.none.bytecode) &&
        movesAt(swapped, 0, 0) &&
        movesAt(spawned, 0, 0) &&
        faultsInScene() === 0
    );
    controller.right.setPressed(false);
  }

  /**
   * Give sprites their programs, let the game run, and check the programs
   * ran on their sprites: paired by id, thinking each frame, two programs
   * sharing a name each on its own sprite, the empty program running
   * nothing, a destroyed sprite's program ended, and a pushed scene pausing
   * its programs while the new scene runs its own; then check the arcade
   * base pack's direction arithmetic, how its tiles move sprites, and how
   * the running game takes program updates.
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

    checkDirectionArithmetic();
    checkMovement();
    checkProgramUpdates(twinA);

    console.log(`CHECKS failed ${failedChecks}`);
    console.log(`SIMCAP PASS ${SELFTEST_CASE_ID}`);
  }
}
