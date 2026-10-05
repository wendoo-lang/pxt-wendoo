/*
 * Test-only surface: `gen-selftest.js` copies this file into the generated
 * arcade selftest project and lists it in that project's `pxt.json`.
 */

/**
 * The arcade selftest: it gives sprites of a running Arcade game the
 * programs the project's brains module declares, through the Wendoo arcade
 * extension's block function, and reports how the programs ran across the
 * game's frames -- among them programs placing the arcade base pack's dpad,
 * bump, in-range, out-of-range, myself and move tiles and the `Sprite` and
 * `Vector2` accessors, driven by pressing the controller's buttons and
 * placing and moving sprites from game code, and programs updated while the
 * game runs, through the messages the Wendoo simulator extension posts. It
 * also calls the bump, in-range, out-of-range and myself tiles' bodies and
 * the `Sprite` type's field hooks directly with image asset, sprite and
 * brain values, images resolved through an image factory registered the way
 * a project's images module registers one, and the move tile's body with
 * sprite and point targets and with wander destinations picked from random
 * sources it scripts.
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
 * - `wendoo WENDOO_ASSET_UNRESOLVED image <id>` -- one per image asset id no
 *   factory held when a tile or a sprite's image first used it, as the VM
 *   extension logs it.
 * - `wendoo WENDOO_BRAIN_UNRESOLVED <id>` -- one per brain document id no
 *   compiled brain holds when a sprite's brain was first set to it, as the
 *   arcade base pack logs it.
 * - `DEBUG ON` -- the run turned the Wendoo extensions' debug logging on;
 *   none of the `wendoo` lines above precede it.
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

  /** Whether `sprite` moves at `speed` pixels per second in the direction of `x`, `y`, which must not be the zero vector. */
  function movesAlong(sprite: Sprite, x: number, y: number, speed: number): boolean {
    const length = Math.sqrt(x * x + y * y);
    return movesAt(sprite, (speed * x) / length, (speed * y) / length);
  }

  /** The direction from the center of `from` to the center of `to`, scaled to length 1; they must not share a center. */
  function unitToward(from: Sprite, to: Sprite): wendoo.DirectionVector {
    const x = to.x - from.x;
    const y = to.y - from.y;
    const length = Math.sqrt(x * x + y * y);
    return new wendoo.DirectionVector(x / length, y / length);
  }

  /** Whether `sprite` moves at `speed` pixels per second straight toward the center of `subject`. */
  function pursues(sprite: Sprite, subject: Sprite, speed: number): boolean {
    const toward = unitToward(sprite, subject);
    return movesAlong(sprite, toward.x, toward.y, speed);
  }

  /** Whether `sprite` moves at `speed` pixels per second straight away from the center of `subject`. */
  function flees(sprite: Sprite, subject: Sprite, speed: number): boolean {
    const toward = unitToward(sprite, subject);
    return movesAlong(sprite, -toward.x, -toward.y, speed);
  }

  /** The distance between the centers of `a` and `b`, in pixels. */
  function distanceBetween(a: Sprite, b: Sprite): number {
    const x = b.x - a.x;
    const y = b.y - a.y;
    return Math.sqrt(x * x + y * y);
  }

  /** Whether `direction` is `x`, `y`. */
  function pointsAt(direction: wendoo.DirectionVector, x: number, y: number): boolean {
    return near(direction.x, x, NUMBER_TOLERANCE) && near(direction.y, y, NUMBER_TOLERANCE);
  }

  /** A sprite running `program` from the next frame. */
  function spriteRunning(program: wendoo.CompiledBrainRegistration): Sprite {
    const sprite = newSprite(SpriteKind.Player);
    wendoo.runBrain(sprite, program);
    return sprite;
  }

  /** The direction the chosen cardinals specify, as the move's direction modifiers sum them with neither `toward`, `away` nor `wander`. */
  function cardinals(up: boolean, down: boolean, left: boolean, right: boolean): wendoo.DirectionVector {
    return wendoo.specifiedDirection(up, down, left, right, false, false, undefined, undefined);
  }

  /**
   * Check the arcade base pack's direction arithmetic directly: the analog
   * dead band and its live band, the dpad's modifier mask, the move's
   * cardinal sum and direction fallback, its speed, and the speed a move
   * heading for a goal is held to: pixels per second, over a frame timed in
   * milliseconds. Call it once the program hosts have drained registrations.
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

    const diagonal = 1 / Math.sqrt(2);
    check(
      "cardinals-sum-and-normalize",
      pointsAt(cardinals(true, false, false, false), 0, -1) &&
        pointsAt(cardinals(false, true, false, false), 0, 1) &&
        pointsAt(cardinals(false, false, true, false), -1, 0) &&
        pointsAt(cardinals(false, false, false, true), 1, 0) &&
        pointsAt(cardinals(true, false, false, true), diagonal, -diagonal) &&
        pointsAt(cardinals(true, true, true, false), -1, 0)
    );
    check(
      "cancelling-cardinals-specify-no-direction",
      cardinals(false, false, false, false) === undefined &&
        cardinals(true, true, false, false) === undefined &&
        cardinals(false, false, true, true) === undefined &&
        cardinals(true, true, true, true) === undefined
    );

    const leftward = wendoo.vector2Value(new wendoo.DirectionVector(-1, 0));
    const downward = wendoo.vector2Value(new wendoo.DirectionVector(0, 1));
    const up = cardinals(true, false, false, false);
    check(
      "direction-modifiers-beat-the-direction-argument",
      pointsAt(wendoo.moveDirection(up, leftward, downward), 0, -1)
    );
    check(
      "cancelled-modifiers-leave-the-direction-argument",
      pointsAt(wendoo.moveDirection(cardinals(true, true, false, false), leftward, downward), -1, 0)
    );
    check("explicit-direction-beats-when-result", pointsAt(wendoo.moveDirection(undefined, leftward, downward), -1, 0));
    check(
      "when-result-direction-beats-the-default",
      pointsAt(wendoo.moveDirection(undefined, wendoo.NIL_VALUE, downward), 0, 1)
    );
    check(
      "default-direction-without-a-given-or-sensed-one",
      pointsAt(wendoo.moveDirection(undefined, wendoo.NIL_VALUE, wendoo.mkNumber(1)), 1, 0) &&
        pointsAt(wendoo.moveDirection(undefined, wendoo.NIL_VALUE, wendoo.NIL_VALUE), 1, 0)
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
    check(
      "move-reach-holds-speed-in-pixels-per-second-over-milliseconds",
      wendoo.speedWithinReach(5000, 100, 20) === 5000 &&
        wendoo.speedWithinReach(800, 100, 20) === 800 &&
        wendoo.speedWithinReach(100, 100, 20) === 100 &&
        wendoo.speedWithinReach(800, 5, 20) === 250 &&
        wendoo.speedWithinReach(800, 5, 33) === 5000 / 33 &&
        wendoo.speedWithinReach(100, 5, 20) === 100 &&
        wendoo.speedWithinReach(800, 0, 20) === 0 &&
        wendoo.speedWithinReach(800, 5, 0) === 800
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

    const drift = spriteRunning(wendooBrains.p_driftBareMove001);
    const counted = spriteRunning(wendooBrains.p_countedWhenMove1);
    const follow = spriteRunning(wendooBrains.p_followDpadMove01);
    const rails = spriteRunning(wendooBrains.p_railsLeftRight01);
    const corner = spriteRunning(wendooBrains.p_cornerUpLeft0001);
    const cornerFlipped = spriteRunning(wendooBrains.p_cornerLeftUp0001);
    const dash = spriteRunning(wendooBrains.p_dashQuickly00001);
    const creep = spriteRunning(wendooBrains.p_creepSlowly00001);
    const paced = spriteRunning(wendooBrains.p_pacedSpeed000001);
    const blend = spriteRunning(wendooBrains.p_blendTwoRules001);
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

  /**
   * Give sprites the programs placing the move tile with direction
   * modifiers, drive the dpad, and check how the sprites move: each cardinal
   * its own way; two perpendicular cardinals on the exact diagonal, in
   * either order; a cancelling pair falling through to the default
   * direction, and to the direction the WHEN produced; speed words composing
   * before, after and between direction modifiers; and the dpad's modifiers
   * still masking the dpad in a rule whose move's modifiers name another
   * direction. Destroys its sprites at the end.
   */
  function checkDirectionModifiers(): void {
    const climb = spriteRunning(wendooBrains.p_climbMoveUp00001);
    const sink = spriteRunning(wendooBrains.p_sinkMoveDown0001);
    const retreat = spriteRunning(wendooBrains.p_retreatMoveLeft1);
    const advance = spriteRunning(wendooBrains.p_advanceMoveRight);
    const veer = spriteRunning(wendooBrains.p_veerUpRight00001);
    const veerFlipped = spriteRunning(wendooBrains.p_veerRightUp00001);
    const stall = spriteRunning(wendooBrains.p_stallLeftRight01);
    const steer = spriteRunning(wendooBrains.p_steerDpadUpDown1);
    const sprint = spriteRunning(wendooBrains.p_sprintUpQuickly1);
    const sprintFlipped = spriteRunning(wendooBrains.p_sprintQuicklyUp1);
    const swerve = spriteRunning(wendooBrains.p_swerveLeftQkUp01);
    const guard = spriteRunning(wendooBrains.p_guardDpadUpLeft1);
    pause(FRAMES_MS);
    check(
      "each-direction-modifier-moves-its-way",
      movesAt(climb, 0, -100) && movesAt(sink, 0, 100) && movesAt(retreat, -100, 0) && movesAt(advance, 100, 0)
    );
    const diagonal = 100 / Math.sqrt(2);
    check(
      "perpendicular-modifiers-move-on-the-diagonal",
      movesAt(veer, diagonal, -diagonal) &&
        near(Math.sqrt(veer.vx * veer.vx + veer.vy * veer.vy), 100, VELOCITY_TOLERANCE)
    );
    check("direction-modifier-order-does-not-matter", movesAt(veerFlipped, diagonal, -diagonal));
    check("cancelling-modifiers-fall-through-to-the-default", movesAt(stall, 100, 0));
    check(
      "speed-words-compose-with-direction-modifiers",
      movesAt(sprint, 0, -200) && movesAt(sprintFlipped, 0, -200) && movesAt(swerve, -2 * diagonal, -2 * diagonal)
    );
    const guardQuiet = movesAt(guard, 0, 0) && movesAt(steer, 0, 0);

    controller.right.setPressed(true);
    pause(FRAMES_MS);
    const guardMasked = movesAt(guard, 0, 0);
    const steerFollowsRight = movesAt(steer, 100, 0);

    controller.up.setPressed(true);
    pause(FRAMES_MS);
    check("dpad-modifiers-still-mask-beside-move-modifiers", guardQuiet && guardMasked && movesAt(guard, -100, 0));
    check(
      "cancelling-modifiers-fall-through-to-the-when-result",
      steerFollowsRight && movesAt(steer, diagonal, -diagonal)
    );

    controller.up.setPressed(false);
    controller.right.setPressed(false);
    const placed = [
      climb,
      sink,
      retreat,
      advance,
      veer,
      veerFlipped,
      stall,
      steer,
      sprint,
      sprintFlipped,
      swerve,
      guard,
    ];
    for (let i = 0; i < placed.length; i++) {
      placed[i].destroy();
    }
    pause(FRAMES_MS);
  }

  /** A sprite in the current scene wearing a filled `size`-pixel square, centered at `x`, `y`. */
  function solidSprite(size: number, x: number, y: number): Sprite {
    const picture = image.create(size, size);
    picture.fill(1);
    const sprite = sprites.create(picture, SpriteKind.Player);
    sprite.setPosition(x, y);
    return sprite;
  }

  /** The type-atom id the arcade selftest's ids module allocates the `Sprite` type. */
  const SPRITE_ATOM = 1025;

  /**
   * In a scene of its own, check the bump sensor: the `Sprite` type takes
   * its atom from the project's ids module and its values carry their
   * sprites; the overlap read returns the touched sprite, nothing while
   * clear, and the nearest of several, ties going to the sprite created
   * first whatever order the scene keeps; a bump rule moves its sprite while
   * it touches another and stops it once they part, a bump rule's direction
   * modifiers move it on the diagonal, and a program update swaps a running
   * bump rule live.
   */
  function checkBump(): void {
    game.pushScene();
    const host = wendoo.sceneProgramHost(game.currentScene());

    const reader = solidSprite(8, 30, 30);
    const value = wendoo.spriteValue(reader);
    check(
      "sprite-type-takes-its-atom-from-the-manifest",
      wendoo.spriteBinding.atomId === SPRITE_ATOM && wendoo.spriteBinding.typeId === wendoo.structTypeId("Sprite")
    );
    check(
      "sprite-value-carries-its-sprite",
      value.t === wendoo.ValueTag.Struct && value.typeId === wendoo.structTypeId("Sprite") && value.native === reader
    );
    const clear = wendoo.bumpedSprite(reader) === undefined;
    const right = solidSprite(8, 33, 30);
    check("bump-reads-the-touched-sprite-or-nothing", clear && wendoo.bumpedSprite(reader) === right);
    const left = solidSprite(8, 28, 30);
    const nearest = wendoo.bumpedSprite(reader) === left;
    const below = solidSprite(8, 30, 32);
    below.z = -1;
    pause(FRAMES_MS);
    const tieKeptBehind = wendoo.bumpedSprite(reader) === left;
    below.z = 1;
    pause(FRAMES_MS);
    check(
      "bump-picks-the-nearest-sprite-first-created-on-ties",
      nearest && tieKeptBehind && wendoo.bumpedSprite(reader) === left
    );
    reader.destroy();
    right.destroy();
    left.destroy();
    below.destroy();

    const pusher = solidSprite(48, 80, 60);
    const nudged = solidSprite(8, 20, 100);
    const fleeing = solidSprite(8, 140, 100);
    wendoo.runBrain(nudged, wendooBrains.p_nudgeBumpMove001);
    wendoo.runBrain(fleeing, wendooBrains.p_fleeBumpLeftUp01);
    pause(FRAMES_MS);
    const waited = movesAt(nudged, 0, 0) && movesAt(fleeing, 0, 0) && nudged.x === 20 && fleeing.x === 140;

    nudged.setPosition(pusher.x, pusher.y);
    pause(FRAMES_MS);
    check("bump-rule-moves-its-sprite-while-touching", waited && movesAt(nudged, 100, 0));
    pause(3 * FRAMES_MS);
    check(
      "bump-rule-stops-its-sprite-once-parted",
      movesAt(nudged, 0, 0) && nudged.x > pusher.x && wendoo.bumpedSprite(nudged) === undefined
    );

    fleeing.setPosition(pusher.x, pusher.y);
    pause(FRAMES_MS);
    const diagonal = 100 / Math.sqrt(2);
    check("bump-rule-flees-on-the-diagonal", movesAt(fleeing, -diagonal, -diagonal));

    const fleeRuntime = runtimeIn(host, fleeing);
    fleeing.setPosition(pusher.x, pusher.y);
    postUpdate(wendooBrains.p_fleeBumpLeftUp01, wendooBrains.p_nudgeBumpMove001.bytecode, "00000011");
    pause(FRAMES_MS);
    check(
      "program-update-swaps-a-bump-rule-live",
      runtimeIn(host, fleeing) !== fleeRuntime && movesAt(fleeing, 100, 0) && faultsInScene() === 0
    );
    game.popScene();
  }

  /**
   * In a scene of its own, check the move's toward and away modifiers, each
   * steering by the sprite its rule's bump touches: pursuit closes on a still
   * sprite and flight runs from it; flight turns as the sprite it flees
   * moves; toward and away together cancel, in either order, to the move's
   * fallback; each composes with a direction modifier, in either order, and
   * with the speed words and the speed argument; two sprites sharing one
   * center each hold still, their pursuit arrived; a rule whose WHEN produces no
   * sprite moves in the default direction, or in the direction its WHEN
   * produced; and a program update turns a running pursuit to flight live.
   */
  function checkRelationalModifiers(): void {
    game.pushScene();
    const host = wendoo.sceneProgramHost(game.currentScene());
    const subject = solidSprite(80, 80, 60);

    const chasing = solidSprite(8, 104, 78);
    const fleeing = solidSprite(8, 68, 51);
    wendoo.runBrain(chasing, wendooBrains.p_chaseBumpToward1);
    wendoo.runBrain(fleeing, wendooBrains.p_shyBumpAway00001);
    const chasingStart = distanceBetween(chasing, subject);
    const fleeingStart = distanceBetween(fleeing, subject);
    pause(FRAMES_MS);
    check(
      "pursuit-closes-on-a-still-sprite",
      pursues(chasing, subject, 100) && distanceBetween(chasing, subject) < chasingStart
    );
    check(
      "flight-runs-from-a-still-sprite",
      flees(fleeing, subject, 100) && distanceBetween(fleeing, subject) > fleeingStart
    );
    chasing.destroy();

    fleeing.setPosition(subject.x + 2, subject.y - 10);
    pause(FRAMES_MS);
    const firstHeading = fleeing.vx > 0 && flees(fleeing, subject, 100);
    subject.vx = 80;
    pause(FRAMES_MS);
    check("flight-turns-as-its-subject-moves", firstHeading && fleeing.vx < 0 && flees(fleeing, subject, 100));
    subject.vx = 0;
    subject.setPosition(80, 60);
    fleeing.destroy();

    const wavering = solidSprite(8, 52, 30);
    const waveringFlipped = solidSprite(8, 52, 90);
    const stalking = solidSprite(8, 115, 30);
    const stalkingFlipped = solidSprite(8, 110, 80);
    const dodging = solidSprite(8, 70, 70);
    const lunging = solidSprite(8, 106, 46);
    const skulking = solidSprite(8, 90, 85);
    const tethered = solidSprite(8, 60, 45);
    const twin = solidSprite(8, 140, 110);
    const twinShadow = solidSprite(8, 140, 110);
    const homing = solidSprite(8, 10, 110);
    wendoo.runBrain(wavering, wendooBrains.p_waverTowardAway1);
    wendoo.runBrain(waveringFlipped, wendooBrains.p_waverAwayToward1);
    wendoo.runBrain(stalking, wendooBrains.p_stalkTowardUp001);
    wendoo.runBrain(stalkingFlipped, wendooBrains.p_stalkUpToward001);
    wendoo.runBrain(dodging, wendooBrains.p_dodgeAwayLeft001);
    wendoo.runBrain(lunging, wendooBrains.p_lungeTowardQuick);
    wendoo.runBrain(skulking, wendooBrains.p_skulkSlowlyAway1);
    wendoo.runBrain(tethered, wendooBrains.p_tetherAwaySpeed1);
    wendoo.runBrain(twin, wendooBrains.p_chaseBumpToward1);
    wendoo.runBrain(twinShadow, wendooBrains.p_chaseBumpToward1);
    wendoo.runBrain(homing, wendooBrains.p_homingAlwaysTwd1);
    pause(FRAMES_MS);
    check("toward-and-away-cancel-to-the-fallback", movesAt(wavering, 100, 0) && movesAt(waveringFlipped, 100, 0));
    const stalkingToward = unitToward(stalking, subject);
    const stalkingFlippedToward = unitToward(stalkingFlipped, subject);
    check(
      "toward-with-a-direction-modifier-bends-pursuit",
      movesAlong(stalking, stalkingToward.x, stalkingToward.y - 1, 100) &&
        movesAlong(stalkingFlipped, stalkingFlippedToward.x, stalkingFlippedToward.y - 1, 100)
    );
    const dodgingToward = unitToward(dodging, subject);
    check(
      "away-with-a-direction-modifier-bends-flight",
      movesAlong(dodging, -dodgingToward.x - 1, -dodgingToward.y, 100)
    );
    check(
      "relational-modifiers-compose-with-speed",
      pursues(lunging, subject, 200) && flees(skulking, subject, 50) && flees(tethered, subject, 30)
    );
    check(
      "a-shared-center-holds-pursuit-still",
      movesAt(twin, 0, 0) && movesAt(twinShadow, 0, 0) && twin.x === twinShadow.x && twin.y === twinShadow.y
    );
    check("toward-without-a-sprite-moves-in-the-default-direction", movesAt(homing, 100, 0));
    const placed = [
      wavering,
      waveringFlipped,
      stalking,
      stalkingFlipped,
      dodging,
      lunging,
      skulking,
      tethered,
      twin,
      twinShadow,
      homing,
    ];
    for (let i = 0; i < placed.length; i++) {
      placed[i].destroy();
    }

    const skittish = solidSprite(8, 10, 10);
    wendoo.runBrain(skittish, wendooBrains.p_skittishDpadAwy1);
    pause(FRAMES_MS);
    const skittishQuiet = movesAt(skittish, 0, 0);
    controller.up.setPressed(true);
    pause(FRAMES_MS);
    check("away-under-a-dpad-follows-the-dpad", skittishQuiet && movesAt(skittish, 0, -100));
    controller.up.setPressed(false);
    skittish.destroy();

    const pursuer = solidSprite(8, 104, 78);
    wendoo.runBrain(pursuer, wendooBrains.p_chaseBumpToward1);
    pause(FRAMES_MS);
    const pursuing = pursues(pursuer, subject, 100);
    const pursuitRuntime = runtimeIn(host, pursuer);
    postUpdate(wendooBrains.p_chaseBumpToward1, wendooBrains.p_shyBumpAway00001.bytecode, "00000012");
    pause(FRAMES_MS);
    check(
      "program-update-turns-pursuit-to-flight-live",
      pursuing && runtimeIn(host, pursuer) !== pursuitRuntime && flees(pursuer, subject, 100) && faultsInScene() === 0
    );
    game.popScene();
  }

  /** The range the in-range and out-of-range sensors sense within while their range slot is empty, in pixels. */
  const DEFAULT_RANGE = 60;

  /**
   * How far from its sensor's range a range rule's sprite may come to rest,
   * or swing while it holds a standoff, in pixels.
   */
  const RANGE_TOLERANCE = 6;

  /**
   * Whether two sprites centered `distance` pixels apart on one row, both
   * running `program`, both move at the velocity `vx`, `vy` once their
   * programs have thought. Destroys both sprites.
   */
  function pairMovesAt(program: wendoo.CompiledBrainRegistration, distance: number, vx: number, vy: number): boolean {
    const left = solidSprite(8, 40, 60);
    const right = solidSprite(8, 40 + distance, 60);
    wendoo.runBrain(left, program);
    wendoo.runBrain(right, program);
    pause(FRAMES_MS);
    const moved = movesAt(left, vx, vy) && movesAt(right, vx, vy);
    left.destroy();
    right.destroy();
    pause(FRAMES_MS);
    return moved;
  }

  /** Whether every pair `distances` apart, both running `program`, moves at the velocity `vx`, `vy`; see {@link pairMovesAt}. */
  function pairsMoveAt(
    program: wendoo.CompiledBrainRegistration,
    distances: number[],
    vx: number,
    vy: number
  ): boolean {
    let all = true;
    for (let i = 0; i < distances.length; i++) {
      if (!pairMovesAt(program, distances[i], vx, vy)) {
        all = false;
      }
    }
    return all;
  }

  /**
   * Whether, over `samples` checks `FRAMES_MS` apart, the centers of
   * `holder` and `target` stay within {@link RANGE_TOLERANCE} of
   * {@link DEFAULT_RANGE} apart.
   */
  function holdsStandoff(holder: Sprite, target: Sprite, samples: number): boolean {
    let held = true;
    for (let i = 0; i < samples; i++) {
      pause(FRAMES_MS);
      if (!near(distanceBetween(holder, target), DEFAULT_RANGE, RANGE_TOLERANCE)) {
        held = false;
      }
    }
    return held;
  }

  /**
   * In a scene of its own, check the in-range and out-of-range sensors: an
   * empty scene fires neither; in range fires within its default range,
   * boundary included, and out of range beyond it; a range of 40 narrows
   * both and a negative range reads as 0; exactly one of the pair fires
   * whenever another sprite exists; out of range and toward close on the
   * nearest sprite from across the screen and rest once in range, ties
   * going to the sprite created first whatever order the scene keeps; in
   * range and away open distance from the nearest sprite and rest once out
   * of range; the two rules together hold a standoff around a moving
   * sprite; the speed words compose; and a program update swaps in range to
   * out of range live.
   */
  function checkRangeSensors(): void {
    game.pushScene();
    const host = wendoo.sceneProgramHost(game.currentScene());

    const lone = solidSprite(8, 80, 60);
    wendoo.runBrain(lone, wendooBrains.p_eitherInUpOutDn1);
    pause(FRAMES_MS);
    lone.vx = 37;
    pause(FRAMES_MS);
    check("neither-range-sensor-fires-in-an-empty-scene", movesAt(lone, 37, 0));
    lone.destroy();
    pause(FRAMES_MS);

    const within = [0, DEFAULT_RANGE - 1, DEFAULT_RANGE];
    const beyond = [DEFAULT_RANGE + 1, 150];
    check(
      "in-range-fires-within-the-default-range-and-not-beyond",
      pairsMoveAt(wendooBrains.p_nearInRangeMove1, within, 100, 0) &&
        pairsMoveAt(wendooBrains.p_nearInRangeMove1, beyond, 0, 0)
    );
    check(
      "out-of-range-fires-beyond-the-default-range-and-not-within",
      pairsMoveAt(wendooBrains.p_farOutOfRangeMv1, beyond, 100, 0) &&
        pairsMoveAt(wendooBrains.p_farOutOfRangeMv1, within, 0, 0)
    );
    check(
      "a-given-range-narrows-both-sensors",
      pairsMoveAt(wendooBrains.p_eitherRange40001, [40], 0, -100) &&
        pairsMoveAt(wendooBrains.p_eitherRange40001, [41, DEFAULT_RANGE - 1], 0, 100)
    );
    check(
      "a-negative-range-reads-as-zero",
      pairsMoveAt(wendooBrains.p_eitherRangeNeg01, [0], 0, -100) &&
        pairsMoveAt(wendooBrains.p_eitherRangeNeg01, [1], 0, 100)
    );
    check(
      "exactly-one-range-sensor-fires-while-another-sprite-exists",
      pairsMoveAt(wendooBrains.p_eitherInUpOutDn1, [0, 30, DEFAULT_RANGE - 1, DEFAULT_RANGE], 0, -100) &&
        pairsMoveAt(wendooBrains.p_eitherInUpOutDn1, [DEFAULT_RANGE + 1, 100, 150], 0, 100)
    );

    const leashed = solidSprite(8, 150, 100);
    const owner = solidSprite(8, 20, 40);
    const decoy = solidSprite(8, 150, 270);
    wendoo.runBrain(leashed, wendooBrains.p_leashOutToward01);
    const leashStart = distanceBetween(leashed, owner);
    pause(FRAMES_MS);
    check(
      "leash-closes-on-the-nearest-sprite-from-across-the-screen",
      pursues(leashed, owner, 100) && distanceBetween(leashed, owner) < leashStart
    );
    pause(10 * FRAMES_MS);
    const leashGap = distanceBetween(leashed, owner);
    check(
      "leash-rests-once-in-range",
      movesAt(leashed, 0, 0) && leashGap <= DEFAULT_RANGE && leashGap > DEFAULT_RANGE - RANGE_TOLERANCE
    );
    leashed.destroy();
    owner.destroy();
    decoy.destroy();

    const shy = solidSprite(8, 80, 60);
    const nearest = solidSprite(8, 100, 60);
    const farther = solidSprite(8, 80, 20);
    wendoo.runBrain(shy, wendooBrains.p_keepAwayInAway01);
    pause(FRAMES_MS);
    check(
      "keep-away-opens-distance-from-the-nearest-sprite",
      flees(shy, nearest, 100) && distanceBetween(shy, nearest) > 20
    );
    farther.destroy();
    pause(10 * FRAMES_MS);
    const keptGap = distanceBetween(shy, nearest);
    check(
      "keep-away-rests-once-out-of-range",
      movesAt(shy, 0, 0) && keptGap > DEFAULT_RANGE && keptGap < DEFAULT_RANGE + RANGE_TOLERANCE
    );
    shy.destroy();
    nearest.destroy();

    const chooser = solidSprite(8, 130, 110);
    const first = solidSprite(8, 30, 110);
    const second = solidSprite(8, 130, 10);
    wendoo.runBrain(chooser, wendooBrains.p_leashOutToward01);
    pause(FRAMES_MS);
    const tieFirst = pursues(chooser, first, 100);
    chooser.setPosition(130, 110);
    second.z = -1;
    pause(FRAMES_MS);
    const tieKeptBehind = pursues(chooser, first, 100);
    chooser.setPosition(130, 110);
    second.z = 1;
    pause(FRAMES_MS);
    check(
      "range-sensors-pick-the-nearest-sprite-first-created-on-ties",
      tieFirst && tieKeptBehind && pursues(chooser, first, 100)
    );
    chooser.destroy();
    first.destroy();
    second.destroy();

    const holder = solidSprite(8, 50, 60);
    const target = solidSprite(8, 80, 60);
    wendoo.runBrain(holder, wendooBrains.p_standoffInOut001);
    pause(6 * FRAMES_MS);
    const settled = near(distanceBetween(holder, target), DEFAULT_RANGE, RANGE_TOLERANCE);
    target.vx = 40;
    const heldAsItLeaves = holdsStandoff(holder, target, 6);
    target.vx = -40;
    const heldAsItComes = holdsStandoff(holder, target, 6);
    target.vx = 0;
    target.vy = 40;
    const heldAsItCrosses = holdsStandoff(holder, target, 6);
    check(
      "standoff-holds-its-distance-from-a-moving-sprite",
      settled && heldAsItLeaves && heldAsItComes && heldAsItCrosses
    );
    holder.destroy();
    target.destroy();

    const hurrying = solidSprite(8, 150, 60);
    const hurryTarget = solidSprite(8, 10, 60);
    wendoo.runBrain(hurrying, wendooBrains.p_leashQuickly0001);
    pause(FRAMES_MS);
    const hurried = pursues(hurrying, hurryTarget, 200);
    hurrying.destroy();
    hurryTarget.destroy();
    const dawdling = solidSprite(8, 80, 60);
    const dawdleTarget = solidSprite(8, 100, 60);
    wendoo.runBrain(dawdling, wendooBrains.p_keepAwaySlowly01);
    pause(FRAMES_MS);
    check("speed-words-compose-with-range-rules", hurried && flees(dawdling, dawdleTarget, 50));
    dawdling.destroy();
    dawdleTarget.destroy();

    const swappedLeft = solidSprite(8, 20, 30);
    const swappedRight = solidSprite(8, 50, 30);
    wendoo.runBrain(swappedLeft, wendooBrains.p_nearInRangeMove1);
    wendoo.runBrain(swappedRight, wendooBrains.p_nearInRangeMove1);
    pause(FRAMES_MS);
    const movedInRange = movesAt(swappedLeft, 100, 0) && movesAt(swappedRight, 100, 0);
    const inRangeRuntime = runtimeIn(host, swappedLeft);
    postUpdate(wendooBrains.p_nearInRangeMove1, wendooBrains.p_farOutOfRangeMv1.bytecode, "00000013");
    pause(FRAMES_MS);
    const restsInRange =
      runtimeIn(host, swappedLeft) !== inRangeRuntime && movesAt(swappedLeft, 0, 0) && movesAt(swappedRight, 0, 0);
    swappedRight.setPosition(swappedLeft.x + 100, swappedLeft.y);
    pause(FRAMES_MS);
    check(
      "program-update-swaps-in-range-to-out-of-range-live",
      movedInRange &&
        restsInRange &&
        movesAt(swappedLeft, 100, 0) &&
        movesAt(swappedRight, 100, 0) &&
        faultsInScene() === 0
    );
    game.popScene();
  }

  /** Wendoo type name of an image asset value. */
  const IMAGE_TYPE = "Image";

  /** The one field of an image asset value: the asset's id. */
  const IMAGE_ASSET_FIELD = "asset";

  /** The type-atom id the arcade selftest's ids module allocates the `Image` type. */
  const IMAGE_ATOM = 1026;

  /** Asset id of the hero image the selftest's image factory holds, as a project's jres gives it. */
  const HERO_ASSET_ID = "image3";

  /** Display name of the hero image, which the selftest's image factory also answers to. */
  const HERO_DISPLAY_NAME = "hero";

  /** Asset id the selftest's late image factory holds, registered only once the game is running. */
  const LATE_ASSET_ID = "image9";

  /** Asset id no factory holds: an image the project has since deleted. */
  const DELETED_ASSET_ID = "image404";

  /** The hero image's pixels: palette indices 1 to 15 and transparent pixels, every row and column touching. */
  function heroPicture(): Image {
    return img`
      . 1 2 3 4 5 6 7
      8 9 a b c d e f
      2 2 2 2 2 2 2 .
      4 . 4 4 4 4 4 4
      6 6 6 6 6 6 6 6
      8 8 8 8 8 8 8 8
      a a a a a a a a
      c c c c c c c c
    `;
  }

  /** The late image's pixels. */
  function latePicture(): Image {
    return img`
      5 5 5 5
      5 . . 5
      5 . . 5
      5 5 5 5
    `;
  }

  /** The project's image factory, as the project's images module registers it: by asset id and by display name. */
  helpers._registerFactory("image", (name: string) => {
    if (name === HERO_ASSET_ID || name === HERO_DISPLAY_NAME) {
      return heroPicture();
    }
    return null;
  });

  /**
   * The `Image` value a compiled program carries for the asset `assetId`: a
   * plain struct holding the asset id at the field id the project's ids
   * module allocates the type's asset field.
   */
  function imageLiteral(assetId: string): wendoo.Value {
    const fieldId = wendoo.projectIds().fieldId(IMAGE_TYPE, IMAGE_ASSET_FIELD);
    const slots: wendoo.Value[] = [];
    for (let i = 0; i <= fieldId; i++) {
      slots.push(wendoo.NIL_VALUE);
    }
    slots[fieldId] = wendoo.mkString(assetId);
    return wendoo.mkStruct(wendoo.structTypeId(IMAGE_TYPE), slots);
  }

  /** A context whose world is `world`, for calling a tile's body directly. */
  function contextIn(world: wendoo.SpriteWorld): wendoo.ExecutionContext {
    const services = new wendoo.BrainServices(
      new wendoo.Program(),
      new wendoo.RuleSubtreeLiveness(),
      new wendoo.BrainPageServices()
    );
    return new wendoo.ExecutionContext(services, new wendoo.VariableStore(), world);
  }

  /** A context whose world is a fresh world of `sprite`, for calling a tile's body directly. */
  function contextOn(sprite: Sprite): wendoo.ExecutionContext {
    return contextIn(new wendoo.SpriteWorld(sprite));
  }

  /** The bound body of the tile `tileName`, or `undefined` when no registration holds it. */
  function tileBody(tileName: string): wendoo.HostActionBinding {
    return wendoo.hostRegistries().actions.getById(wendoo.projectIds().actionId(tileName));
  }

  /** What the tile body `body` returns given `args` on `sprite`'s behalf; nil when there is no body. */
  function act(body: wendoo.HostActionBinding, sprite: Sprite, args: wendoo.Value[]): wendoo.Value {
    return body ? body.execSync(contextOn(sprite), args) : wendoo.NIL_VALUE;
  }

  /** Whether `value` is the `Sprite` value standing for `sprite`. */
  function standsFor(value: wendoo.Value, sprite: Sprite): boolean {
    return (
      value.t === wendoo.ValueTag.Struct && value.typeId === wendoo.structTypeId("Sprite") && value.native === sprite
    );
  }

  /**
   * Check the `Sprite` type's `image` field around `model`, a sprite in the
   * current scene, through the type's field hooks as the VM dispatches them:
   * a read is the image the sprite wears, that same image, its `asset` field
   * reading the empty string; a write of an image asset wears the image its
   * asset id or display name resolves to when written, and keeps the
   * sprite's image given an image no factory holds or a value naming no
   * image; a write of another sprite's image wears that same image -- pixels
   * drawn on it show on both sprites, and the other sprite changing images
   * leaves the written one as it was; the proximity filters read the image a
   * sprite wears by its pixels; and a destroyed sprite reads nil and ignores
   * writes.
   */
  function checkImageField(model: Sprite): void {
    const world = hostedWorld(model);
    const read = readField(world, model, "image");
    const assetSlot = read.fields ? read.fields[wendoo.projectIds().fieldId(IMAGE_TYPE, IMAGE_ASSET_FIELD)] : undefined;
    check(
      "image-reads-the-image-the-sprite-wears-its-asset-reading-empty",
      read.t === wendoo.ValueTag.Struct &&
        read.typeId === wendoo.structTypeId(IMAGE_TYPE) &&
        read.native === model.image &&
        wendoo.imageOf(read) === model.image &&
        assetSlot !== undefined &&
        assetSlot.t === wendoo.ValueTag.String &&
        assetSlot.str === ""
    );

    const byId = solidSprite(8, 20, 40);
    const byName = solidSprite(8, 40, 40);
    const wrote =
      writeField(world, byId, "image", imageLiteral(HERO_ASSET_ID)) &&
      writeField(world, byName, "image", imageLiteral(HERO_DISPLAY_NAME));
    check(
      "image-write-wears-the-image-its-asset-resolves-to",
      wrote && byId.image.equals(heroPicture()) && byName.image.equals(heroPicture())
    );

    const steady = solidSprite(8, 60, 40);
    const steadyImage = steady.image;
    const keptGone =
      writeField(world, steady, "image", imageLiteral(DELETED_ASSET_ID)) &&
      writeField(world, steady, "image", imageLiteral(DELETED_ASSET_ID));
    const keptOther =
      writeField(world, steady, "image", wendoo.NIL_VALUE) &&
      writeField(world, steady, "image", wendoo.mkNativeStruct(wendoo.structTypeId("Decoy"), model.image)) &&
      writeField(world, steady, "image", brainLiteral(TICKER_ID));
    check(
      "image-write-of-an-image-no-factory-holds-or-a-value-naming-no-image-keeps-the-image",
      keptGone && keptOther && steady.image === steadyImage
    );

    const source = solidSprite(8, 80, 40);
    const mimic = solidSprite(8, 100, 40);
    const shared = writeField(world, mimic, "image", readField(world, source, "image"));
    const sameInstance = mimic.image === source.image;
    source.image.setPixel(0, 0, 7);
    const drawnOnBoth = mimic.image.getPixel(0, 0) === 7;
    const worn = mimic.image;
    const other = image.create(6, 6);
    other.fill(9);
    source.setImage(other);
    check(
      "image-write-of-another-sprites-image-wears-that-same-image-and-keeps-it-when-that-sprite-changes",
      shared && sameInstance && drawnOnBoth && mimic.image === worn && source.image === other
    );

    const nil = wendoo.NIL_VALUE;
    const twin = heroSprite(byId.x + 3, byId.y);
    const reader = solidSprite(8, twin.x + 3, twin.y);
    const plain = solidSprite(8, reader.x + 1, reader.y);
    const nearest = act(tileBody(wendoo.BUMP_TILE), reader, [readField(world, byId, "image"), nil, nil]);
    check("proximity-filters-read-a-worn-image-by-its-pixels", standsFor(nearest, twin));

    const doomed = solidSprite(8, 120, 40);
    const doomedImage = doomed.image;
    doomed.destroy();
    check(
      "image-on-a-destroyed-sprite-reads-nil-and-ignores-writes",
      readsNothing(readField(world, doomed, "image")) &&
        writeField(world, doomed, "image", imageLiteral(HERO_ASSET_ID)) &&
        doomed.image === doomedImage
    );
    const placed = [byId, byName, steady, source, mimic, twin, reader, plain];
    for (let i = 0; i < placed.length; i++) {
      placed[i].destroy();
    }
  }

  /**
   * In a scene of its own, check image assets: the `Image` type takes its
   * atom and its one field from the project's ids module; an image asset
   * written to a sprite's image resolves at the moment it is written; the
   * `Sprite` type's image field reads and writes as {@link checkImageField}
   * checks; and the goal toward heads for is read from a WHEN's result only
   * when it is a `Sprite` value.
   */
  function checkImageAssets(): void {
    game.pushScene();
    const imageType = wendoo.hostRegistries().types.getByTypeId(wendoo.structTypeId(IMAGE_TYPE));
    check(
      "image-type-takes-its-atom-and-field-from-the-manifest",
      imageType !== undefined &&
        imageType.atomId === IMAGE_ATOM &&
        imageType.fieldIds.length === 1 &&
        imageType.fieldIds[0] === wendoo.projectIds().fieldId(IMAGE_TYPE, IMAGE_ASSET_FIELD)
    );

    const late = solidSprite(8, 60, 20);
    const world = hostedWorld(late);
    const lateLiteral = imageLiteral(LATE_ASSET_ID);
    const beforeLate = late.image;
    writeField(world, late, "image", lateLiteral);
    const unchangedBeforeLate = late.image === beforeLate;
    helpers._registerFactory("image", (name: string) => (name === LATE_ASSET_ID ? latePicture() : null));
    writeField(world, late, "image", lateLiteral);
    check("image-resolves-when-it-is-used", unchangedBeforeLate && late.image.equals(latePicture()));

    const model = solidSprite(8, 80, 20);
    checkImageField(model);

    const goal = wendoo.moveGoal(wendoo.NIL_VALUE, wendoo.spriteValue(model));
    check(
      "toward-reads-only-a-sprite-value",
      goal !== undefined &&
        goal.x === model.x &&
        goal.y === model.y &&
        wendoo.moveGoal(wendoo.NIL_VALUE, wendoo.mkNativeStruct(wendoo.structTypeId("Decoy"), model)) === undefined &&
        wendoo.moveGoal(wendoo.NIL_VALUE, imageLiteral(HERO_ASSET_ID)) === undefined
    );
    game.popScene();
  }

  /** A sprite in the current scene wearing a fresh copy of the hero image's pixels, centered at `x`, `y`. */
  function heroSprite(x: number, y: number): Sprite {
    const picture = image.create(8, 8);
    picture.drawImage(heroPicture(), 0, 0);
    const sprite = sprites.create(picture, SpriteKind.Player);
    sprite.setPosition(x, y);
    return sprite;
  }

  /**
   * The argument buffer a proximity sensor's body receives given the filter
   * `image`, `sprite` or `brain` (nil for those not given, all nil for no
   * filter): bump's buffer holds the filter's image, sprite and brain; each
   * range sensor's holds them followed by the range `range`.
   */
  function filterArgs(
    tileName: string,
    image: wendoo.Value,
    sprite: wendoo.Value,
    brain: wendoo.Value,
    range: wendoo.Value
  ): wendoo.Value[] {
    return tileName === wendoo.BUMP_TILE ? [image, sprite, brain] : [image, sprite, brain, range];
  }

  /**
   * What the proximity sensor `tileName` reads on `reader`'s behalf given the
   * filter `image` or `sprite` and, on a range sensor, the range `range`.
   */
  function sense(
    tileName: string,
    reader: Sprite,
    image: wendoo.Value,
    sprite: wendoo.Value,
    range: wendoo.Value
  ): wendoo.Value {
    return act(tileBody(tileName), reader, filterArgs(tileName, image, sprite, wendoo.NIL_VALUE, range));
  }

  /**
   * What the proximity sensor `tileName` reads on behalf of the sprite whose
   * world is `world` given the brain filter `brain` and, on a range sensor,
   * the range `range`.
   */
  function senseBrain(
    tileName: string,
    world: wendoo.SpriteWorld,
    brain: wendoo.Value,
    range: wendoo.Value
  ): wendoo.Value {
    const nil = wendoo.NIL_VALUE;
    const body = tileBody(tileName);
    return body ? body.execSync(contextIn(world), filterArgs(tileName, nil, nil, brain, range)) : nil;
  }

  /** Whether `value` is nil. */
  function readsNothing(value: wendoo.Value): boolean {
    return value.t === wendoo.ValueTag.Nil;
  }

  /** The proximity sensors, each by its tile name and the stem of the names of its filter checks. */
  const PROXIMITY_SENSORS = [
    [wendoo.BUMP_TILE, "bump"],
    [wendoo.IN_RANGE_TILE, "in-range"],
    [wendoo.OUT_OF_RANGE_TILE, "out-of-range"],
  ];

  /**
   * In a scene of its own, check the one filter grammar every proximity
   * sensor takes, each sensor's body called directly with the values a
   * compiled program passes it, around a reader touching a plain sprite 2
   * pixels away and a sprite wearing the hero image's pixels 6 pixels away,
   * with another wearing them 100 pixels away; the out-of-range sensor is
   * given a range of 3, the others none. Given an image, each reads the
   * nearest sprite whose image has the same pixels -- touched, for bump --
   * and nothing when no sprite looks like it or no factory holds the image;
   * given a sprite, each reads that sprite alone, and nothing for a value
   * standing for no sprite in the scene or for the reader itself; given no
   * filter, each reads the nearest sprite -- touched, for bump -- whatever
   * image it wears. At equal ranges exactly one of
   * the range pair reads the nearest admitted sprite whenever one exists, and
   * neither reads while the filter admits none. Then a compiled program
   * placing the range pair given an image and a range moves its sprite by
   * the nearest sprite wearing the image alone.
   */
  function checkSpriteFilters(): void {
    game.pushScene();
    const reader = solidSprite(8, 30, 60);
    const plainNear = solidSprite(8, 32, 60);
    const twin = heroSprite(36, 60);
    const farHero = heroSprite(130, 60);
    const gone = solidSprite(8, 31, 60);
    gone.destroy();
    const hero = imageLiteral(HERO_ASSET_ID);
    const nil = wendoo.NIL_VALUE;
    const narrow = wendoo.mkNumber(3);
    for (let i = 0; i < PROXIMITY_SENSORS.length; i++) {
      const tile = PROXIMITY_SENSORS[i][0];
      const stem = PROXIMITY_SENSORS[i][1];
      const range = tile === wendoo.OUT_OF_RANGE_TILE ? narrow : nil;
      check(
        `${stem}-given-an-image-reads-the-nearest-sprite-that-looks-like-it`,
        twin.image !== heroPicture() &&
          standsFor(sense(tile, reader, hero, nil, range), twin) &&
          standsFor(sense(tile, reader, imageLiteral(HERO_DISPLAY_NAME), nil, range), twin)
      );
      check(
        `${stem}-given-an-image-no-sprite-looks-like-reads-nothing`,
        readsNothing(sense(tile, reader, imageLiteral(LATE_ASSET_ID), nil, range))
      );
      check(
        `${stem}-given-an-image-gone-from-the-project-reads-nothing`,
        readsNothing(sense(tile, reader, imageLiteral(DELETED_ASSET_ID), nil, range))
      );
      check(
        `${stem}-given-a-sprite-reads-that-sprite-alone`,
        standsFor(sense(tile, reader, nil, wendoo.spriteValue(twin), range), twin)
      );
      check(
        `${stem}-given-a-value-standing-for-no-sprite-in-the-scene-reads-nothing`,
        readsNothing(sense(tile, reader, nil, wendoo.spriteValue(gone), range)) &&
          readsNothing(sense(tile, reader, nil, wendoo.mkNativeStruct(wendoo.structTypeId("Decoy"), twin), range))
      );
      check(
        `${stem}-given-its-own-sprite-reads-nothing`,
        readsNothing(sense(tile, reader, nil, wendoo.spriteValue(reader), range))
      );
    }
    check(
      "bump-given-a-sprite-it-does-not-touch-reads-nothing",
      readsNothing(sense(wendoo.BUMP_TILE, reader, nil, wendoo.spriteValue(farHero), nil))
    );
    check(
      "proximity-sensors-given-no-filter-read-as-unfiltered",
      standsFor(act(tileBody(wendoo.BUMP_TILE), reader, []), plainNear) &&
        standsFor(sense(wendoo.BUMP_TILE, reader, nil, nil, nil), plainNear) &&
        standsFor(act(tileBody(wendoo.IN_RANGE_TILE), reader, []), plainNear) &&
        standsFor(sense(wendoo.IN_RANGE_TILE, reader, nil, nil, nil), plainNear) &&
        readsNothing(act(tileBody(wendoo.OUT_OF_RANGE_TILE), reader, [])) &&
        standsFor(sense(wendoo.OUT_OF_RANGE_TILE, reader, nil, nil, wendoo.mkNumber(1)), plainNear)
    );

    const ranges = [0, 2, 5, 6, 7, 99, 100, 101, 200];
    let complementary = true;
    for (let i = 0; i < ranges.length; i++) {
      const range = wendoo.mkNumber(ranges[i]);
      const inside = sense(wendoo.IN_RANGE_TILE, reader, hero, nil, range);
      const beyond = sense(wendoo.OUT_OF_RANGE_TILE, reader, hero, nil, range);
      const holds =
        ranges[i] >= 6
          ? standsFor(inside, twin) && readsNothing(beyond)
          : readsNothing(inside) && standsFor(beyond, twin);
      if (!holds) {
        complementary = false;
      }
      const emptyInside = sense(wendoo.IN_RANGE_TILE, reader, imageLiteral(LATE_ASSET_ID), nil, range);
      const emptyBeyond = sense(wendoo.OUT_OF_RANGE_TILE, reader, imageLiteral(LATE_ASSET_ID), nil, range);
      if (!readsNothing(emptyInside) || !readsNothing(emptyBeyond)) {
        complementary = false;
      }
    }
    check("range-pair-is-complementary-within-the-admitted-set", complementary);
    reader.destroy();
    plainNear.destroy();
    twin.destroy();
    farHero.destroy();
    pause(FRAMES_MS);

    const runner = solidSprite(8, 40, 60);
    const decoy = solidSprite(8, 45, 60);
    wendoo.runBrain(runner, wendooBrains.p_eitherHeroFilt01);
    pause(FRAMES_MS);
    runner.vx = 37;
    pause(FRAMES_MS);
    const restsWithoutHero = movesAt(runner, 37, 0);
    const nearHero = heroSprite(70, 60);
    pause(FRAMES_MS);
    const upNearHero = movesAt(runner, 0, -100);
    runner.setPosition(40, 60);
    decoy.setPosition(45, 60);
    nearHero.setPosition(90, 60);
    pause(FRAMES_MS);
    check(
      "filtered-range-rules-read-the-nearest-sprite-wearing-the-image",
      restsWithoutHero && upNearHero && movesAt(runner, 0, 100) && faultsInScene() === 0
    );
    game.popScene();
  }

  /** Wendoo type name of a brain reference value. */
  const BRAIN_TYPE = "Brain";

  /** The one field of a brain reference value: the brain's document id. */
  const BRAIN_ID_FIELD = "id";

  /** The type-atom id the arcade selftest's ids module allocates the `Brain` type. */
  const BRAIN_ATOM = 1027;

  /** A document id no program in the project carries. */
  const UNKNOWN_BRAIN_ID = "nobodyRunsThis01";

  /**
   * The `Brain` value a compiled program carries for the brain `documentId`:
   * a plain struct holding the document id at the field id the project's ids
   * module allocates the type's id field.
   */
  function brainLiteral(documentId: string): wendoo.Value {
    const fieldId = wendoo.projectIds().fieldId(BRAIN_TYPE, BRAIN_ID_FIELD);
    const slots: wendoo.Value[] = [];
    for (let i = 0; i <= fieldId; i++) {
      slots.push(wendoo.NIL_VALUE);
    }
    slots[fieldId] = wendoo.mkString(documentId);
    return wendoo.mkStruct(wendoo.structTypeId(BRAIN_TYPE), slots);
  }

  /** A world of `sprite` whose program host is the current scene's, for calling a tile's body on its behalf. */
  function hostedWorld(sprite: Sprite): wendoo.SpriteWorld {
    const world = new wendoo.SpriteWorld(sprite);
    world.host = wendoo.sceneProgramHost(game.currentScene());
    return world;
  }

  /**
   * In a scene of its own, check the brain filter every proximity sensor
   * takes: the `Brain` type takes its atom and its one field from the
   * project's ids module and reads the document id only of its own values;
   * a scene's program host lists the worlds running a brain; around a
   * reader touching a plain sprite 2 pixels away, a sprite running no brain
   * 3 pixels away and a sprite running the ticker 6 pixels away, with
   * another running it 100 pixels away, each sensor given the ticker's brain
   * reads the nearest sprite running it -- the out-of-range sensor given a
   * range of 3 -- reads nothing given a brain no sprite runs or a value
   * naming no brain, and given the brain its
   * own sprite runs reads another sprite running it, never its own, and
   * nothing while no other does. Then a compiled program filtering both
   * range sensors on its own brain moves a lone runner by neither, two
   * runners near each other by in range, and two far apart by out of range.
   */
  function checkBrainFilters(): void {
    game.pushScene();
    const host = wendoo.sceneProgramHost(game.currentScene());
    const brainType = wendoo.hostRegistries().types.getByTypeId(wendoo.structTypeId(BRAIN_TYPE));
    check(
      "brain-type-takes-its-atom-and-field-from-the-manifest",
      brainType !== undefined &&
        brainType.atomId === BRAIN_ATOM &&
        brainType.fieldIds.length === 1 &&
        brainType.fieldIds[0] === wendoo.projectIds().fieldId(BRAIN_TYPE, BRAIN_ID_FIELD)
    );
    check(
      "brain-type-reads-the-document-id-of-its-own-values",
      wendoo.brainBinding.documentIdOf(brainLiteral(TICKER_ID)) === TICKER_ID &&
        wendoo.brainBinding.documentIdOf(imageLiteral(HERO_ASSET_ID)) === "" &&
        wendoo.brainBinding.documentIdOf(wendoo.NIL_VALUE) === ""
    );

    const reader = solidSprite(8, 30, 60);
    const plainNear = solidSprite(8, 32, 60);
    const nearRunner = solidSprite(8, 36, 60);
    const farRunner = solidSprite(8, 130, 60);
    const idle = solidSprite(8, 33, 60);
    wendoo.runBrain(idle, wendooBrains.none);
    wendoo.runBrain(nearRunner, wendooBrains.p_akBQz0nySKaYx37w);
    wendoo.runBrain(farRunner, wendooBrains.p_akBQz0nySKaYx37w);
    pause(FRAMES_MS);
    const running = host.worldsRunning(TICKER_ID);
    check(
      "host-lists-the-worlds-running-a-brain",
      running.length === 2 &&
        (running[0] as wendoo.SpriteWorld).sprite === nearRunner &&
        (running[1] as wendoo.SpriteWorld).sprite === farRunner &&
        host.worldsRunning(UNKNOWN_BRAIN_ID).length === 0
    );

    const world = hostedWorld(reader);
    const ticker = brainLiteral(TICKER_ID);
    const nil = wendoo.NIL_VALUE;
    const narrow = wendoo.mkNumber(3);
    for (let i = 0; i < PROXIMITY_SENSORS.length; i++) {
      const tile = PROXIMITY_SENSORS[i][0];
      const stem = PROXIMITY_SENSORS[i][1];
      const range = tile === wendoo.OUT_OF_RANGE_TILE ? narrow : nil;
      check(
        `${stem}-given-a-brain-reads-the-nearest-sprite-running-it`,
        standsFor(senseBrain(tile, world, ticker, range), nearRunner)
      );
      check(
        `${stem}-given-a-brain-no-sprite-runs-reads-nothing`,
        readsNothing(senseBrain(tile, world, brainLiteral(UNKNOWN_BRAIN_ID), range)) &&
          readsNothing(senseBrain(tile, world, imageLiteral(HERO_ASSET_ID), range))
      );
    }

    wendoo.runBrain(reader, wendooBrains.p_akBQz0nySKaYx37w);
    pause(FRAMES_MS);
    const ownWorld = hostedWorld(reader);
    let readsAnother = true;
    for (let i = 0; i < PROXIMITY_SENSORS.length; i++) {
      const tile = PROXIMITY_SENSORS[i][0];
      const range = tile === wendoo.OUT_OF_RANGE_TILE ? narrow : nil;
      if (!standsFor(senseBrain(tile, ownWorld, ticker, range), nearRunner)) {
        readsAnother = false;
      }
    }
    nearRunner.destroy();
    farRunner.destroy();
    pause(FRAMES_MS);
    let readsNoneAlone = true;
    for (let i = 0; i < PROXIMITY_SENSORS.length; i++) {
      if (!readsNothing(senseBrain(PROXIMITY_SENSORS[i][0], ownWorld, ticker, nil))) {
        readsNoneAlone = false;
      }
    }
    check(
      "proximity-sensors-given-their-own-brain-read-another-runner-never-their-own-sprite",
      readsAnother && readsNoneAlone
    );
    reader.destroy();
    plainNear.destroy();
    idle.destroy();
    pause(FRAMES_MS);

    const lone = solidSprite(8, 80, 60);
    wendoo.runBrain(lone, wendooBrains.p_kinBrainFilter01);
    pause(FRAMES_MS);
    lone.vx = 37;
    pause(FRAMES_MS);
    const loneRests = movesAt(lone, 37, 0);
    lone.destroy();
    pause(FRAMES_MS);
    check(
      "own-brain-range-rules-read-other-runners-and-never-their-own-sprite",
      loneRests &&
        pairMovesAt(wendooBrains.p_kinBrainFilter01, 30, 0, -100) &&
        pairMovesAt(wendooBrains.p_kinBrainFilter01, 100, 0, 100) &&
        faultsInScene() === 0
    );
    game.popScene();
  }

  /** The output each proximity sensor writes: its tile name, its output's name, and the stem of its checks' names. */
  const SENSOR_OUTPUTS = [
    [wendoo.BUMP_TILE, "bumped", "bump"],
    [wendoo.IN_RANGE_TILE, "inRange", "in-range"],
    [wendoo.OUT_OF_RANGE_TILE, "outOfRange", "out-of-range"],
  ];

  /** Wendoo type name of a sprite value. */
  const SPRITE_TYPE = "Sprite";

  /** The `Sprite` type's fields, in the order the arcade base pack declares them and the manifest allocates them. */
  const SPRITE_FIELDS = ["image", "position", "brain"];

  /** The field id the project's ids module allocates the `Sprite` field `field`. */
  function spriteFieldId(field: string): number {
    return wendoo.projectIds().fieldId(SPRITE_TYPE, field);
  }

  /**
   * What a program running in `world` reads from the field `field` of the
   * `Sprite` value standing for `sprite`, through the type's field getter as
   * the VM dispatches it: nil when the getter reads nothing.
   */
  function readField(world: wendoo.SpriteWorld, sprite: Sprite, field: string): wendoo.Value {
    const read = wendoo.spriteBinding.fieldGetter(wendoo.spriteValue(sprite), spriteFieldId(field), contextIn(world));
    return read ? read : wendoo.NIL_VALUE;
  }

  /**
   * Whether the type's field setter accepts a program running in `world`
   * writing `value` into the field `field` of the `Sprite` value standing for
   * `sprite`, as the VM dispatches it; a refusal would fault the program.
   */
  function writeField(world: wendoo.SpriteWorld, sprite: Sprite, field: string, value: wendoo.Value): boolean {
    return wendoo.spriteBinding.fieldSetter(wendoo.spriteValue(sprite), spriteFieldId(field), value, contextIn(world));
  }

  /** Whether `value` is a `Vector2` holding the point `x`, `y`. */
  function holdsPoint(value: wendoo.Value, x: number, y: number): boolean {
    const point = wendoo.vector2Of(value);
    return point !== undefined && point.x === x && point.y === y;
  }

  /** Whether `value` is a `Brain` value naming the brain `documentId`. */
  function namesBrain(value: wendoo.Value, documentId: string): boolean {
    return value.t === wendoo.ValueTag.Struct && wendoo.brainBinding.documentIdOf(value) === documentId;
  }

  /**
   * In a scene of its own, check the `Sprite` type's fields, each through
   * the type's field hooks as the VM dispatches them: the type takes its
   * field ids from the project's ids module and reads and writes every field
   * through its hooks. `position` reads a snapshot of the sprite's center, a
   * fresh value per read that later moves leave alone; a write sets the
   * center at once and leaves the velocity alone, and a value naming no
   * point moves nothing. `brain` reads the brain the sprite runs, nil while
   * it runs none; a write starts nothing before the next drain, which starts
   * the brain, replaces another brain, ends the program given nil, and
   * restarts nothing given the brain already running or nil on a sprite
   * running none; a brain no registration holds changes nothing and is
   * logged once. A destroyed sprite reads nil from both fields and ignores
   * writes to them.
   */
  function checkSpriteFields(): void {
    game.pushScene();
    const reader = solidSprite(8, 20, 100);
    const world = hostedWorld(reader);
    let fieldIdsMatch = wendoo.spriteBinding.fieldIds.length === SPRITE_FIELDS.length;
    for (let i = 0; i < SPRITE_FIELDS.length; i++) {
      fieldIdsMatch = fieldIdsMatch && wendoo.spriteBinding.fieldIds[i] === spriteFieldId(SPRITE_FIELDS[i]);
    }
    check(
      "sprite-type-takes-its-fields-from-the-manifest-and-reads-and-writes-them-through-its-hooks",
      fieldIdsMatch && wendoo.spriteBinding.hasFieldGetter && wendoo.spriteBinding.hasFieldSetter
    );

    const walker = solidSprite(8, 40, 50);
    const first = readField(world, walker, "position");
    walker.setPosition(60, 70);
    const second = readField(world, walker, "position");
    check(
      "position-reads-a-snapshot-of-the-sprites-center",
      holdsPoint(first, 40, 50) && holdsPoint(second, 60, 70) && first !== second
    );

    walker.vx = 30;
    walker.vy = -20;
    const accepted = writeField(world, walker, "position", wendoo.vector2Value(new wendoo.DirectionVector(80, 90)));
    check(
      "position-write-sets-the-center-at-once-and-keeps-the-velocity",
      accepted && walker.x === 80 && walker.y === 90 && walker.vx === 30 && walker.vy === -20
    );
    walker.vx = 0;
    walker.vy = 0;

    const keptNil = writeField(world, walker, "position", wendoo.NIL_VALUE);
    const keptOther = writeField(world, walker, "position", imageLiteral(HERO_ASSET_ID));
    check(
      "position-write-of-a-value-naming-no-point-moves-nothing",
      keptNil && keptOther && walker.x === 80 && walker.y === 90
    );

    const runner = solidSprite(8, 120, 100);
    const idle = solidSprite(8, 140, 100);
    const dormant = solidSprite(8, 160, 100);
    wendoo.runBrain(runner, wendooBrains.p_akBQz0nySKaYx37w);
    wendoo.runBrain(idle, wendooBrains.none);
    pause(FRAMES_MS);
    check(
      "brain-reads-the-brain-its-sprite-runs-or-nil",
      namesBrain(readField(world, runner, "brain"), TICKER_ID) &&
        readsNothing(readField(world, idle, "brain")) &&
        readsNothing(readField(world, dormant, "brain"))
    );

    const started = writeField(world, dormant, "brain", brainLiteral(TICKER_ID));
    const waited = programOf(dormant) === NOT_RUNNING && readsNothing(readField(world, dormant, "brain"));
    pause(FRAMES_MS);
    check(
      "brain-write-waits-for-the-drain-which-starts-the-brain",
      started && waited && programOf(dormant) === TICKER_ID
    );

    const instance = hostedOf(runner);
    const ticks = ticksOf(runner);
    let repeated = true;
    for (let i = 0; i < 3; i++) {
      repeated = writeField(world, runner, "brain", brainLiteral(TICKER_ID)) && repeated;
      pause(FRAMES_MS / 4);
    }
    check(
      "brain-write-of-the-brain-already-running-restarts-nothing",
      repeated && hostedOf(runner) === instance && ticksOf(runner) > ticks
    );

    const replaced = writeField(world, runner, "brain", brainLiteral(TWIN_IDS[0]));
    const stillTicker = programOf(runner) === TICKER_ID;
    pause(FRAMES_MS);
    check(
      "brain-write-of-another-brain-replaces-the-program-at-the-drain",
      replaced && stillTicker && programOf(runner) === TWIN_IDS[0]
    );

    const ended = writeField(world, runner, "brain", wendoo.NIL_VALUE);
    const neverRan = solidSprite(8, 180, 100);
    const nothingToEnd = writeField(world, neverRan, "brain", wendoo.NIL_VALUE);
    pause(FRAMES_MS);
    check(
      "brain-write-of-nil-ends-the-program-and-starts-nothing-on-a-sprite-running-none",
      ended &&
        nothingToEnd &&
        programOf(runner) === wendooBrains.none.id &&
        readsNothing(readField(world, runner, "brain")) &&
        programOf(neverRan) === NOT_RUNNING
    );

    const unresolvedFirst = writeField(world, dormant, "brain", brainLiteral(UNKNOWN_BRAIN_ID));
    const unresolvedAgain = writeField(world, dormant, "brain", brainLiteral(UNKNOWN_BRAIN_ID));
    pause(FRAMES_MS);
    check(
      "brain-write-of-a-brain-no-registration-holds-changes-nothing",
      unresolvedFirst && unresolvedAgain && programOf(dormant) === TICKER_ID
    );

    const doomed = solidSprite(8, 200, 100);
    wendoo.runBrain(doomed, wendooBrains.p_akBQz0nySKaYx37w);
    pause(FRAMES_MS);
    doomed.destroy();
    const x = doomed.x;
    check(
      "a-destroyed-sprite-reads-nil-and-ignores-writes",
      readsNothing(readField(world, doomed, "position")) &&
        readsNothing(readField(world, doomed, "brain")) &&
        writeField(world, doomed, "position", wendoo.vector2Value(new wendoo.DirectionVector(5, 5))) &&
        writeField(world, doomed, "brain", brainLiteral(TWIN_IDS[0])) &&
        doomed.x === x &&
        faultsInScene() === 0
    );
    pause(FRAMES_MS);
    game.popScene();
  }

  /** Tile name of the myself sensor. */
  const MYSELF_TILE = "sensor.arcade.myself";

  /** Speed a move goes at when nothing sets it, in pixels per second. */
  const DEFAULT_MOVE_SPEED = 100;

  /**
   * In a scene of its own, check the myself sensor and the compiled programs
   * reading and writing a sprite's fields through it: myself reads the
   * sprite its program runs on; in range given its own sprite's brain closes
   * on another sprite running that brain past a nearer plain sprite; a move
   * toward the bumped sprite's position lands on the center it read; an
   * assignment to its own sprite's position puts it on the bumped sprite's
   * center; an assignment to its own sprite's brain swaps the program at the
   * drain after its think; and a child rule comparing the y of the sprite in
   * range with its own sprite's moves up while that sprite is above and not
   * while it is below.
   */
  function checkMyself(): void {
    game.pushScene();
    const self = solidSprite(8, 20, 20);
    check("myself-reads-the-sprite-its-program-runs-on", standsFor(act(tileBody(MYSELF_TILE), self, []), self));
    self.destroy();

    const plain = solidSprite(8, 30, 60);
    const flockA = solidSprite(8, 40, 60);
    const flockB = solidSprite(8, 80, 60);
    wendoo.runBrain(flockA, wendooBrains.p_flockOwnBrain001);
    wendoo.runBrain(flockB, wendooBrains.p_flockOwnBrain001);
    pause(FRAMES_MS);
    check(
      "in-range-given-its-own-sprites-brain-closes-on-another-runner-past-a-plain-sprite",
      pursues(flockA, flockB, DEFAULT_MOVE_SPEED) &&
        pursues(flockB, flockA, DEFAULT_MOVE_SPEED) &&
        faultsInScene() === 0
    );
    plain.destroy();
    flockA.destroy();
    flockB.destroy();
    pause(FRAMES_MS);

    const pursuer = solidSprite(8, 40, 60);
    const goal = solidSprite(8, 46, 60);
    wendoo.runBrain(pursuer, wendooBrains.p_pursuePosition01);
    pause(FRAMES_MS);
    check(
      "move-toward-the-bumped-sprites-position-lands-on-the-center-it-read",
      near(distanceBetween(pursuer, goal), 0, 0.5) && faultsInScene() === 0
    );
    pursuer.destroy();
    goal.destroy();
    pause(FRAMES_MS);

    const jumper = solidSprite(8, 40, 60);
    const landing = solidSprite(8, 46, 62);
    wendoo.runBrain(jumper, wendooBrains.p_jumpToBumped0001);
    pause(FRAMES_MS);
    check(
      "a-position-assignment-puts-its-sprite-on-the-bumped-sprites-center",
      jumper.x === landing.x && jumper.y === landing.y && faultsInScene() === 0
    );
    jumper.destroy();
    landing.destroy();
    pause(FRAMES_MS);

    const convert = solidSprite(8, 40, 60);
    const bumped = solidSprite(8, 46, 60);
    const lone = solidSprite(8, 120, 100);
    wendoo.runBrain(convert, wendooBrains.p_convertOnBump001);
    wendoo.runBrain(lone, wendooBrains.p_convertOnBump001);
    pause(FRAMES_MS);
    check(
      "a-brain-assignment-to-its-own-sprite-swaps-the-program-after-its-think",
      programOf(convert) === TICKER_ID && programOf(lone) === "convertOnBump001" && faultsInScene() === 0
    );
    convert.destroy();
    bumped.destroy();
    lone.destroy();
    pause(FRAMES_MS);

    const riser = solidSprite(8, 80, 80);
    const above = solidSprite(8, 80, 50);
    wendoo.runBrain(riser, wendooBrains.p_riseTowardAbove1);
    pause(FRAMES_MS);
    const rose = movesAt(riser, 0, -DEFAULT_MOVE_SPEED);
    above.destroy();
    riser.setPosition(80, 80);
    const below = solidSprite(8, 80, 110);
    pause(FRAMES_MS);
    check(
      "comparing-y-accessors-moves-up-toward-a-sprite-above-and-not-below",
      rose && movesAt(riser, 0, 0) && faultsInScene() === 0
    );
    riser.destroy();
    below.destroy();
    pause(FRAMES_MS);
    game.popScene();
  }

  /** Rule funcId the output checks run a parent rule's sensor under. */
  const OUTPUT_PARENT_RULE = 0;

  /** Rule funcId the output checks run a child rule's sensor under. */
  const OUTPUT_CHILD_RULE = 1;

  /** FuncId of the core host function reading a rule variable by name. */
  const RULE_CONTEXT_GET_VARIABLE = 50;

  /** The rule variable the `Sprite` output named `name` is stored under. */
  function spriteOutputKey(name: string): string {
    return wendoo.actionOutputVariableName(wendoo.structTypeId("Sprite"), name);
  }

  /**
   * A context running under a child rule whose parent is
   * {@link OUTPUT_PARENT_RULE}, its world a fresh world of `sprite`; it runs
   * under the parent until its rule funcId is changed.
   */
  function chainContextOn(sprite: Sprite): wendoo.ExecutionContext {
    const ctx = contextOn(sprite);
    ctx.services.program.ruleChildren = [OUTPUT_CHILD_RULE];
    ctx.services.program.ruleParents = [OUTPUT_PARENT_RULE];
    ctx.currentRuleFuncId = OUTPUT_PARENT_RULE;
    return ctx;
  }

  /** What the output tile of the `Sprite` output `name` reads in `ctx`, through the core rule-variable read. */
  function readOutput(ctx: wendoo.ExecutionContext, name: string): wendoo.Value {
    const fn = wendoo.hostRegistries().functions.getById(RULE_CONTEXT_GET_VARIABLE);
    return fn ? fn.exec(ctx, [wendoo.NIL_VALUE, wendoo.mkString(spriteOutputKey(name))]) : wendoo.NIL_VALUE;
  }

  /**
   * In a scene of its own, check the proximity sensors' outputs: each sensor
   * writes the sprite its result carries to its own output when it fires,
   * and clears it when it does not; a child rule reads its parent's output
   * beside its own sensor's; a child reading the output of a sprite
   * destroyed since its parent fired reads the value standing for it,
   * without a fault, and a filter on it admits nothing. Then compiled
   * programs: a bump rule setting its own sprite's image to the bumped
   * sprite's, a bump rule setting it to an image asset, and a child rule
   * filtering bump by its parent's in-range output and setting its own
   * sprite's image to that sprite's.
   */
  function checkSensorOutputs(): void {
    game.pushScene();
    const reader = solidSprite(8, 30, 60);
    const other = heroSprite(36, 60);
    for (let i = 0; i < SENSOR_OUTPUTS.length; i++) {
      const tile = SENSOR_OUTPUTS[i][0];
      const output = SENSOR_OUTPUTS[i][1];
      const stem = SENSOR_OUTPUTS[i][2];
      const ctx = chainContextOn(reader);
      const body = tileBody(tile);
      const firesNear = tile !== wendoo.OUT_OF_RANGE_TILE;
      other.setPosition(firesNear ? 36 : 130, 60);
      const fired = body.execSync(ctx, []);
      const written = readOutput(ctx, output);
      other.setPosition(firesNear ? 130 : 36, 60);
      const quiet = body.execSync(ctx, []);
      const cleared = readOutput(ctx, output);
      check(
        `${stem}-writes-its-output-when-it-fires-and-clears-it-when-it-does-not`,
        standsFor(fired, other) && standsFor(written, other) && readsNothing(quiet) && readsNothing(cleared)
      );
    }

    other.setPosition(36, 60);
    const chain = chainContextOn(reader);
    tileBody(wendoo.BUMP_TILE).execSync(chain, []);
    chain.currentRuleFuncId = OUTPUT_CHILD_RULE;
    tileBody(wendoo.IN_RANGE_TILE).execSync(chain, []);
    check(
      "two-sensors-outputs-coexist-in-one-rule-chain",
      standsFor(readOutput(chain, "bumped"), other) &&
        standsFor(readOutput(chain, "inRange"), other) &&
        readsNothing(readOutput(chain, "outOfRange"))
    );

    const doomed = heroSprite(34, 60);
    const parent = chainContextOn(reader);
    tileBody(wendoo.BUMP_TILE).execSync(parent, []);
    const bumpedFirst = standsFor(readOutput(parent, "bumped"), doomed);
    doomed.destroy();
    parent.currentRuleFuncId = OUTPUT_CHILD_RULE;
    const dead = readOutput(parent, "bumped");
    const nil = wendoo.NIL_VALUE;
    const filtered = tileBody(wendoo.IN_RANGE_TILE).execSync(parent, [nil, dead, nil, nil]);
    check(
      "a-child-reads-a-destroyed-sprites-output-without-fault-and-a-filter-on-it-admits-nothing",
      bumpedFirst && standsFor(dead, doomed) && readsNothing(filtered) && !parent.hasFault()
    );
    reader.destroy();
    other.destroy();
    pause(FRAMES_MS);

    const dressed = solidSprite(8, 40, 60);
    const bumper = heroSprite(46, 60);
    wendoo.runBrain(dressed, wendooBrains.p_lookerBumpLook01);
    pause(FRAMES_MS);
    check("bump-rule-dresses-in-the-bumped-sprite", dressed.image === bumper.image && faultsInScene() === 0);
    dressed.destroy();
    bumper.destroy();
    pause(FRAMES_MS);

    const wearer = solidSprite(8, 40, 60);
    const touched = solidSprite(8, 46, 60);
    wendoo.runBrain(wearer, wendooBrains.p_dresserBumpWear1);
    pause(FRAMES_MS);
    check(
      "bump-rule-wears-the-image-asset-it-is-given",
      wearer.image.equals(heroPicture()) && !touched.image.equals(heroPicture()) && faultsInScene() === 0
    );
    wearer.destroy();
    touched.destroy();
    pause(FRAMES_MS);

    const kin = solidSprite(8, 40, 60);
    const kinImage = kin.image;
    const visitor = heroSprite(70, 60);
    wendoo.runBrain(kin, wendooBrains.p_kinshipRangeOut1);
    pause(FRAMES_MS);
    const untouched = kin.image === kinImage;
    visitor.setPosition(46, 60);
    pause(FRAMES_MS);
    check(
      "child-rule-reads-its-parents-range-output",
      untouched && kin.image === visitor.image && faultsInScene() === 0
    );
    game.popScene();
  }

  /** Value a present modifier slot carries: its one occurrence. */
  const PRESENT = wendoo.mkNumber(1);

  /**
   * What the proximity sensor `tileName` reads on `reader`'s behalf given the
   * positional modifiers `above`, `below`, `left` and `right` -- each present
   * when `true` -- the image filter `image`, and on a range sensor the range
   * `range`: bump's buffer holds its filter's image, sprite and brain, then
   * the four modifiers; each range sensor's holds its filter, its range, then
   * the four modifiers.
   */
  function sensePositioned(
    tileName: string,
    reader: Sprite,
    above: boolean,
    below: boolean,
    left: boolean,
    right: boolean,
    image: wendoo.Value,
    range: wendoo.Value
  ): wendoo.Value {
    const nil = wendoo.NIL_VALUE;
    const head = tileName === wendoo.BUMP_TILE ? [image, nil, nil] : [image, nil, nil, range];
    const modifiers = [above ? PRESENT : nil, below ? PRESENT : nil, left ? PRESENT : nil, right ? PRESENT : nil];
    return act(tileBody(tileName), reader, head.concat(modifiers));
  }

  /**
   * In a scene of its own, check the positional modifiers every proximity
   * sensor takes, each sensor's body called directly, around a reader 48
   * pixels square touching a sprite 20 pixels above it, one 20 below, one 20
   * to its left and one 20 to its right, with one above and to the right of
   * it a little farther; the out-of-range sensor is given a range of 1, the
   * others none. Above, below, left and right each read the nearest sprite
   * whose center lies strictly on that side of the reader's center; above
   * and right together read only the sprite strictly on both. Given an image
   * too, a modifier reads the nearest sprite on its side that looks like it.
   * Then a compiled program placing in range given above pursues a sprite
   * above it and leaves one below it alone.
   */
  function checkPositionalModifiers(): void {
    game.pushScene();
    const reader = solidSprite(48, 80, 60);
    const north = solidSprite(8, 80, 40);
    const south = solidSprite(8, 80, 80);
    const west = solidSprite(8, 60, 60);
    const east = solidSprite(8, 100, 60);
    const northEast = heroSprite(95, 45);
    const nil = wendoo.NIL_VALUE;
    for (let i = 0; i < PROXIMITY_SENSORS.length; i++) {
      const tile = PROXIMITY_SENSORS[i][0];
      const stem = PROXIMITY_SENSORS[i][1];
      const range = tile === wendoo.OUT_OF_RANGE_TILE ? wendoo.mkNumber(1) : nil;
      check(
        `${stem}-given-above-reads-the-nearest-sprite-above`,
        standsFor(sensePositioned(tile, reader, true, false, false, false, nil, range), north)
      );
      check(
        `${stem}-given-below-reads-the-nearest-sprite-below`,
        standsFor(sensePositioned(tile, reader, false, true, false, false, nil, range), south)
      );
      check(
        `${stem}-given-left-reads-the-nearest-sprite-to-the-left`,
        standsFor(sensePositioned(tile, reader, false, false, true, false, nil, range), west)
      );
      check(
        `${stem}-given-right-reads-the-nearest-sprite-to-the-right`,
        standsFor(sensePositioned(tile, reader, false, false, false, true, nil, range), east)
      );
      check(
        `${stem}-given-above-and-right-reads-only-a-sprite-strictly-on-both-sides`,
        standsFor(sensePositioned(tile, reader, true, false, false, true, nil, range), northEast) &&
          readsNothing(sensePositioned(tile, reader, false, true, true, false, nil, range))
      );
    }
    const hero = imageLiteral(HERO_ASSET_ID);
    check(
      "positional-modifiers-compose-with-the-filter",
      standsFor(sensePositioned(wendoo.IN_RANGE_TILE, reader, true, false, false, false, hero, nil), northEast) &&
        readsNothing(sensePositioned(wendoo.IN_RANGE_TILE, reader, false, true, false, false, hero, nil))
    );
    reader.destroy();
    north.destroy();
    south.destroy();
    west.destroy();
    east.destroy();
    northEast.destroy();
    pause(FRAMES_MS);

    const climber = solidSprite(8, 80, 60);
    const beneath = solidSprite(8, 80, 90);
    wendoo.runBrain(climber, wendooBrains.p_perchAboveRange1);
    pause(FRAMES_MS);
    climber.vx = 37;
    pause(FRAMES_MS);
    const ignoresBelow = movesAt(climber, 37, 0);
    climber.setPosition(80, 60);
    const overhead = solidSprite(8, 80, 30);
    pause(FRAMES_MS);
    check(
      "range-rule-given-above-pursues-only-a-sprite-above",
      ignoresBelow && pursues(climber, overhead, 100) && faultsInScene() === 0
    );
    beneath.destroy();
    overhead.destroy();
    game.popScene();
  }

  /**
   * Width of the move's argument buffer: the target toward or away carries
   * once toward is placed (a point, then a sprite), the same pair once only
   * away is, its direction, `slowly`, `quickly`, speed, the four cardinals,
   * `toward`, `away` and `wander`.
   */
  const MOVE_ARGS_WIDTH = 15;

  /** Argument-buffer positions of the move's target point and target sprite once toward is placed. */
  const MOVE_TARGET_POINT = 0;
  const MOVE_TARGET_SPRITE = 1;

  /** Argument-buffer positions of the move's target point and target sprite once only away is placed. */
  const MOVE_AWAY_TARGET_POINT = 2;
  const MOVE_AWAY_TARGET_SPRITE = 3;

  /** Argument-buffer positions of the move's `slowly`, `quickly`, speed, `up`, `right`, `toward`, `away` and `wander` slots. */
  const MOVE_SLOWLY = 5;
  const MOVE_QUICKLY = 6;
  const MOVE_SPEED = 7;
  const MOVE_UP = 8;
  const MOVE_RIGHT = 11;
  const MOVE_TOWARD = 12;
  const MOVE_AWAY = 13;
  const MOVE_WANDER = 14;

  /** Arcade's physics engine's top speed, in pixels per second: the fastest any move may set a sprite going. */
  const ENGINE_TOP_SPEED = 500;

  /** Duration of the frame the direct move checks think in, in milliseconds. */
  const STEP_MS = 20;

  /**
   * Frame durations of a game running at about 60, 50 and 30 frames a
   * second, in milliseconds, each repeated in order: the whole milliseconds
   * Arcade's frame clock advances by.
   */
  const FRAME_SCHEDULES: number[][] = [[17, 17, 16], [20], [33, 33, 34]];

  /**
   * The speed a move heading straight for a goal `distance` pixels away goes
   * at, asked to go at `speed` in a frame of `stepMs` milliseconds: `speed`,
   * or the speed covering exactly `distance` in the frame when that is less.
   */
  function speedToReach(speed: number, distance: number, stepMs: number): number {
    const reaching = (distance * 1000) / stepMs;
    return speed < reaching ? speed : reaching;
  }

  /**
   * Stop the current scene's frames: none of its frame handlers -- physics,
   * programs, move arbitration -- runs until {@link resumeFrames}, so a check
   * places sprites and steps the scene itself.
   */
  function stopFrames(): void {
    control.pushEventContext();
  }

  /** Resume the current scene's frames, which {@link stopFrames} stopped. */
  function resumeFrames(): void {
    control.popEventContext();
  }

  /** Put `sprite` at rest with its center at `x`, `y`. */
  function placeAt(sprite: Sprite, x: number, y: number): void {
    sprite.vx = 0;
    sprite.vy = 0;
    sprite.setPosition(x, y);
  }

  /**
   * Step the current scene, its frames stopped, through `frames` frames of
   * the durations `schedule` repeats, the way its frame loop runs a frame:
   * the scene's physics moves its sprites over the frame, then the move in
   * `args` thinks in `ctx` at the frame's time with the frame's duration and
   * its arbitration resolves. After each frame `afterFrame` is called with
   * the frame's time, in milliseconds since the first frame began.
   */
  function stepMove(
    ctx: wendoo.ExecutionContext,
    args: wendoo.Value[],
    schedule: number[],
    frames: number,
    afterFrame: (timeMs: number) => void
  ): void {
    let time = 0;
    for (let frame = 0; frame < frames; frame++) {
      const stepMs = schedule[frame % schedule.length];
      time += stepMs;
      game.currentScene().physicsEngine.move(stepMs / 1000);
      ctx.time = time;
      ctx.dt = stepMs;
      moveNow(ctx, args);
      afterFrame(time);
    }
  }

  /** A move argument buffer with every slot empty. */
  function moveBuffer(): wendoo.Value[] {
    const args: wendoo.Value[] = [];
    for (let i = 0; i < MOVE_ARGS_WIDTH; i++) {
      args.push(wendoo.NIL_VALUE);
    }
    return args;
  }

  /**
   * Run the move's body in `ctx` given `args`, then resolve the current
   * scene's move arbitration at once, leaving the sprite moving at the
   * velocity that one move asks for. Call it only in a scene running no
   * program.
   */
  function moveNow(ctx: wendoo.ExecutionContext, args: wendoo.Value[]): void {
    tileBody(wendoo.MOVE_TILE).execSync(ctx, args);
    wendoo.sceneMotionArbiter(game.currentScene()).resolve(ctx.dt);
  }

  /** The `Vector2` value naming the point `x`, `y`. */
  function pointValue(x: number, y: number): wendoo.Value {
    return wendoo.vector2Value(new wendoo.DirectionVector(x, y));
  }

  /**
   * In a scene of its own, check the target toward and away may carry, the
   * move's body called directly with the buffers a compiled program passes
   * it, its rule's WHEN having produced a decoy sprite: given no target,
   * toward steers by the WHEN's sprite; given a sprite, toward pursues it and
   * away flees it, read where it is at every move; given a point, toward
   * heads for it and away flees it, wherever the sprite has moved, and a
   * point at the sprite's own center adds nothing; a destroyed sprite's
   * value adds nothing, without a fault; and toward and away placed together
   * share the one target, from either pair of slots. Then compiled programs:
   * in range moving toward quickly given the sprite in range, in both orders
   * of toward and quickly, pursues it; and child rules firing on the dpad
   * move toward or away from their parent's sprite in range, not the dpad's
   * way, turning as it moves.
   */
  function checkMoveTargets(): void {
    game.pushScene();
    const mover = solidSprite(8, 40, 60);
    const quarry = solidSprite(8, 100, 60);
    const decoy = solidSprite(8, 40, 110);
    const ctx = chainContextOn(mover);
    ctx.services.ruleVars.setByName(OUTPUT_PARENT_RULE, wendoo.WHEN_RESULT_VAR, wendoo.spriteValue(decoy));

    const plain = moveBuffer();
    plain[MOVE_TOWARD] = PRESENT;
    moveNow(ctx, plain);
    check("toward-given-no-target-steers-by-the-when-result", pursues(mover, decoy, 100));

    const tracked = moveBuffer();
    tracked[MOVE_TOWARD] = PRESENT;
    tracked[MOVE_TARGET_SPRITE] = wendoo.spriteValue(quarry);
    moveNow(ctx, tracked);
    const pursuedFirst = pursues(mover, quarry, 100);
    quarry.setPosition(90, 20);
    moveNow(ctx, tracked);
    check(
      "toward-given-a-sprite-pursues-it-over-the-when-result-as-it-moves",
      pursuedFirst && pursues(mover, quarry, 100)
    );

    const fled = moveBuffer();
    fled[MOVE_AWAY] = PRESENT;
    fled[MOVE_AWAY_TARGET_SPRITE] = wendoo.spriteValue(quarry);
    moveNow(ctx, fled);
    check("away-given-a-sprite-flees-it-over-the-when-result", flees(mover, quarry, 100));

    const headed = moveBuffer();
    headed[MOVE_TOWARD] = PRESENT;
    headed[MOVE_TARGET_POINT] = pointValue(130, 20);
    moveNow(ctx, headed);
    const headedFirst = movesAlong(mover, 90, -40, 100);
    mover.setPosition(100, 100);
    moveNow(ctx, headed);
    const headedAgain = movesAlong(mover, 30, -80, 100);
    const origin = moveBuffer();
    origin[MOVE_TOWARD] = PRESENT;
    origin[MOVE_TARGET_POINT] = pointValue(0, 0);
    moveNow(ctx, origin);
    check(
      "toward-given-a-point-heads-for-that-fixed-point",
      headedFirst && headedAgain && movesAlong(mover, -100, -100, 100)
    );

    const shunned = moveBuffer();
    shunned[MOVE_AWAY] = PRESENT;
    shunned[MOVE_AWAY_TARGET_POINT] = pointValue(130, 20);
    moveNow(ctx, shunned);
    check("away-given-a-point-flees-that-fixed-point", movesAlong(mover, -30, 80, 100));

    const centered = moveBuffer();
    centered[MOVE_TOWARD] = PRESENT;
    centered[MOVE_UP] = PRESENT;
    centered[MOVE_TARGET_POINT] = pointValue(100, 100);
    moveNow(ctx, centered);
    check("a-point-at-the-sprites-own-center-adds-nothing", movesAt(mover, 0, -100));

    const doomed = solidSprite(8, 10, 10);
    const doomedValue = wendoo.spriteValue(doomed);
    doomed.destroy();
    const lost = moveBuffer();
    lost[MOVE_TOWARD] = PRESENT;
    lost[MOVE_TARGET_SPRITE] = doomedValue;
    moveNow(ctx, lost);
    const lostFallsBack = movesAt(mover, 100, 0);
    lost[MOVE_UP] = PRESENT;
    moveNow(ctx, lost);
    check(
      "a-destroyed-sprite-target-adds-nothing-without-a-fault",
      lostFallsBack && movesAt(mover, 0, -100) && !ctx.hasFault()
    );

    const shared = moveBuffer();
    shared[MOVE_TOWARD] = PRESENT;
    shared[MOVE_AWAY] = PRESENT;
    shared[MOVE_UP] = PRESENT;
    shared[MOVE_TARGET_SPRITE] = wendoo.spriteValue(quarry);
    moveNow(ctx, shared);
    const sharedFirst = movesAt(mover, 0, -100);
    shared[MOVE_TARGET_SPRITE] = wendoo.NIL_VALUE;
    shared[MOVE_AWAY_TARGET_SPRITE] = wendoo.spriteValue(quarry);
    moveNow(ctx, shared);
    check("toward-and-away-share-one-target", sharedFirst && movesAt(mover, 0, -100));

    stopFrames();
    ctx.dt = STEP_MS;
    const landing = moveBuffer();
    landing[MOVE_TOWARD] = PRESENT;
    landing[MOVE_SPEED] = wendoo.mkNumber(400);
    landing[MOVE_TARGET_POINT] = pointValue(103, 104);
    placeAt(mover, 100, 100);
    moveNow(ctx, landing);
    const pointLands = movesAlong(mover, 3, 4, speedToReach(400, 5, STEP_MS));
    landing[MOVE_TARGET_POINT] = pointValue(130, 100);
    placeAt(mover, 100, 100);
    moveNow(ctx, landing);
    check(
      "toward-a-point-within-one-step-lands-on-it-and-keeps-its-speed-beyond",
      pointLands && movesAt(mover, 400, 0)
    );

    const caught = moveBuffer();
    caught[MOVE_TOWARD] = PRESENT;
    caught[MOVE_SPEED] = wendoo.mkNumber(400);
    caught[MOVE_TARGET_SPRITE] = wendoo.spriteValue(quarry);
    placeAt(quarry, 104, 97);
    placeAt(mover, 100, 100);
    moveNow(ctx, caught);
    const spriteLands = movesAlong(mover, 4, -3, speedToReach(400, 5, STEP_MS));
    const steered = moveBuffer();
    steered[MOVE_TOWARD] = PRESENT;
    steered[MOVE_SPEED] = wendoo.mkNumber(400);
    placeAt(decoy, 97, 104);
    moveNow(ctx, steered);
    check(
      "toward-a-sprite-within-one-step-lands-on-it",
      spriteLands && movesAlong(mover, -3, 4, speedToReach(400, 5, STEP_MS))
    );

    const holding = moveBuffer();
    holding[MOVE_TOWARD] = PRESENT;
    holding[MOVE_TARGET_POINT] = pointValue(100, 100);
    moveNow(ctx, holding);
    const holdsAtPoint = movesAt(mover, 0, 0);
    holding[MOVE_TARGET_POINT] = wendoo.NIL_VALUE;
    holding[MOVE_TARGET_SPRITE] = wendoo.spriteValue(quarry);
    placeAt(quarry, 100, 100);
    moveNow(ctx, holding);
    const holdsAtSprite = movesAt(mover, 0, 0);
    holding[MOVE_TARGET_SPRITE] = wendoo.NIL_VALUE;
    placeAt(decoy, 100, 100);
    moveNow(ctx, holding);
    const holdsAtWhenSprite = movesAt(mover, 0, 0);
    holding[MOVE_AWAY] = PRESENT;
    moveNow(ctx, holding);
    const holdsBesideAway = movesAt(mover, 0, 0);
    ctx.dt = 0;
    holding[MOVE_AWAY] = wendoo.NIL_VALUE;
    moveNow(ctx, holding);
    check(
      "toward-arrived-holds-still-at-its-goal",
      holdsAtPoint && holdsAtSprite && holdsAtWhenSprite && holdsBesideAway && movesAt(mover, 0, 0)
    );

    ctx.dt = STEP_MS;
    const bent = moveBuffer();
    bent[MOVE_TOWARD] = PRESENT;
    bent[MOVE_UP] = PRESENT;
    bent[MOVE_SPEED] = wendoo.mkNumber(400);
    bent[MOVE_TARGET_POINT] = pointValue(103, 104);
    moveNow(ctx, bent);
    const bentKeepsSpeed = movesAlong(mover, 0.6, 0.8 - 1, 400);
    const shy = moveBuffer();
    shy[MOVE_AWAY] = PRESENT;
    shy[MOVE_SPEED] = wendoo.mkNumber(400);
    shy[MOVE_AWAY_TARGET_POINT] = pointValue(103, 104);
    moveNow(ctx, shy);
    check("a-move-not-heading-for-one-goal-alone-keeps-its-speed", bentKeepsSpeed && movesAlong(mover, -3, -4, 400));

    const pursuit = moveBuffer();
    pursuit[MOVE_TOWARD] = PRESENT;
    pursuit[MOVE_QUICKLY] = wendoo.mkNumber(3);
    pursuit[MOVE_TARGET_SPRITE] = wendoo.spriteValue(quarry);
    let neverPasses = true;
    let holdsThere = true;
    for (let i = 0; i < FRAME_SCHEDULES.length; i++) {
      placeAt(quarry, 113, 60);
      placeAt(mover, 20, 60);
      let farthest = mover.x;
      stepMove(ctx, pursuit, FRAME_SCHEDULES[i], 90, (timeMs: number) => {
        farthest = Math.max(farthest, mover.x);
      });
      neverPasses = neverPasses && farthest <= 113 + 0.5;
      holdsThere = holdsThere && distanceBetween(mover, quarry) < 0.5 && Math.abs(mover.vx) < 1;
    }
    check("toward-a-sprite-at-speed-never-passes-it-and-holds-there", neverPasses && holdsThere);
    resumeFrames();
    mover.destroy();
    quarry.destroy();
    decoy.destroy();
    pause(FRAMES_MS);

    const prey = solidSprite(8, 80, 60);
    const pouncer = solidSprite(8, 35, 60);
    const pouncerFlipped = solidSprite(8, 125, 60);
    wendoo.runBrain(pouncer, wendooBrains.p_pounceTowardQk01);
    wendoo.runBrain(pouncerFlipped, wendooBrains.p_pounceQkToward01);
    pause(FRAMES_MS);
    check(
      "move-toward-quickly-given-the-sprite-in-range-pursues-it",
      pursues(pouncer, prey, 200) && pursues(pouncerFlipped, prey, 200) && faultsInScene() === 0
    );
    pouncer.destroy();
    pouncerFlipped.destroy();
    prey.setPosition(80, 90);
    pause(FRAMES_MS);

    const heeding = solidSprite(8, 30, 90);
    const spurning = solidSprite(8, 95, 90);
    wendoo.runBrain(heeding, wendooBrains.p_heedDpadTarget01);
    wendoo.runBrain(spurning, wendooBrains.p_spurnDpadTarget1);
    pause(FRAMES_MS);
    const quietWithoutDpad = movesAt(heeding, 0, 0) && movesAt(spurning, 0, 0);
    controller.right.setPressed(true);
    pause(FRAMES_MS);
    const firstHeading = pursues(heeding, prey, 100) && flees(spurning, prey, 100);
    prey.vy = -40;
    pause(FRAMES_MS);
    check(
      "a-child-moves-toward-or-away-from-its-parents-sprite-in-range-over-its-dpad",
      quietWithoutDpad &&
        firstHeading &&
        pursues(heeding, prey, 100) &&
        flees(spurning, prey, 100) &&
        faultsInScene() === 0
    );
    controller.right.setPressed(false);
    game.popScene();
  }

  /** A wander random source answering each pick with the least whole number it may, or the greatest, and recording each range asked. */
  class PinnedRandom extends wendoo.WanderRandom {
    /** Whether each pick answers the greatest number it may. */
    high: boolean;
    /** The bounds of each pick asked, least then greatest, in the order asked. */
    asked: number[] = [];

    constructor(high: boolean) {
      super();
      this.high = high;
    }

    pick(min: number, max: number): number {
      this.asked.push(min);
      this.asked.push(max);
      return this.high ? max : min;
    }
  }

  /** A wander random source answering its picks with the numbers it is given, in order, then with the least number each pick may. */
  class QueuedRandom extends wendoo.WanderRandom {
    /** The answers, in order. */
    answers: number[];
    /** How many picks have been asked. */
    taken = 0;

    constructor(answers: number[]) {
      super();
      this.answers = answers;
    }

    pick(min: number, max: number): number {
      const answer = this.taken < this.answers.length ? this.answers[this.taken] : min;
      this.taken++;
      return answer;
    }
  }

  /** A wander random source answering each pick from a fixed-seed linear congruential sequence, the same numbers on every run. */
  class SeededRandom extends wendoo.WanderRandom {
    /** The sequence's current state. */
    state: number;

    constructor(seed: number) {
      super();
      this.state = seed;
    }

    pick(min: number, max: number): number {
      this.state = (Math.imul(this.state, 1664525) + 1013904223) | 0;
      return min + ((this.state >>> 8) % (max - min + 1));
    }
  }

  /** How long the wander-at-speed run lasts at each frame rate, in milliseconds of game time. */
  const WANDER_RUN_MS = 6000;

  /** The fewest destinations the wander-at-speed run must arrive at, at every frame rate. */
  const WANDER_RUN_LEAST_ARRIVALS = 30;

  /** The direction from `x`, `y` toward `toX`, `toY`, scaled to length 1; the points must differ. */
  function unitBetween(x: number, y: number, toX: number, toY: number): wendoo.DirectionVector {
    const dx = toX - x;
    const dy = toY - y;
    const length = Math.sqrt(dx * dx + dy * dy);
    return new wendoo.DirectionVector(dx / length, dy / length);
  }

  /** The distance from the center of `sprite` to the point `x`, `y`, in pixels. */
  function distanceTo(sprite: Sprite, x: number, y: number): number {
    const dx = x - sprite.x;
    const dy = y - sprite.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Whether `leg` heads for the point `x`, `y`. */
  function legAt(leg: wendoo.WanderLeg, x: number, y: number): boolean {
    return leg !== undefined && leg.x === x && leg.y === y;
  }

  /** Whether `leg` lies on the screen, inside the wander margin, while the camera is unmoved. */
  function legOnScreen(leg: wendoo.WanderLeg): boolean {
    const margin = wendoo.WANDER_SCREEN_MARGIN;
    return leg.x >= margin && leg.x <= screen.width - margin && leg.y >= margin && leg.y <= screen.height - margin;
  }

  /** The world `sprite`'s program runs in, in the current scene. */
  function runningWorld(sprite: Sprite): wendoo.SpriteWorld {
    return hostedOf(sprite).world as wendoo.SpriteWorld;
  }

  /** Duration of the current scene's last frame, in milliseconds: the time its programs last thought over. */
  function lastFrameMs(): number {
    return game.currentScene().eventContext.deltaTimeMillis;
  }

  /**
   * Whether `sprite` runs one wander rule, its destination on screen inside
   * the margin, and moves straight for it at `speed` pixels per second, or
   * slower when the destination lies within one frame's move.
   */
  function headsForItsLeg(sprite: Sprite, speed: number): boolean {
    const wander = runningWorld(sprite).wander;
    if (wander.legs.length !== 1) {
      return false;
    }
    const leg = wander.legs[0];
    const reached = speedToReach(speed, distanceTo(sprite, leg.x, leg.y), lastFrameMs());
    return legOnScreen(leg) && movesAlong(sprite, leg.x - sprite.x, leg.y - sprite.y, reached);
  }

  /**
   * In a scene of its own, check the move's wander: destinations picked on
   * screen inside the margin, in the camera's view as it moves, with the
   * random source a sprite's world carries; a wander heading straight for
   * its destination, keeping it while the sprite is farther than the arrival
   * distance and before its deadline, and picking anew on arrival, the
   * arrival distance included, or once the deadline passes; two call sites
   * keeping their own destinations; and the move's body heading for the
   * destination its call site holds, picked at its think's time, composing
   * with slowly and a cardinal. Then compiled programs, picking with
   * Arcade's own random numbers: a bare wander, a slow one and a quick one
   * each head for an on-screen destination at their speed; toward with
   * wander bends pursuit toward the destination; and two wander rules on one
   * sprite keep two destinations, the sprite moving by both.
   */
  function checkWander(): void {
    game.pushScene();
    const camera = game.currentScene().camera;
    const margin = wendoo.WANDER_SCREEN_MARGIN;
    const walker = solidSprite(8, 40, 60);

    const lowWorld = new wendoo.SpriteWorld(walker);
    const low = new PinnedRandom(false);
    lowWorld.wander.random = low;
    lowWorld.wander.bearing(walker, 1, 0, camera);
    const highWorld = new wendoo.SpriteWorld(walker);
    highWorld.wander.random = new PinnedRandom(true);
    highWorld.wander.bearing(walker, 1, 0, camera);
    camera.offsetX = 40;
    camera.offsetY = 30;
    const shiftedWorld = new wendoo.SpriteWorld(walker);
    shiftedWorld.wander.random = new PinnedRandom(false);
    shiftedWorld.wander.bearing(walker, 1, 0, camera);
    camera.offsetX = 0;
    camera.offsetY = 0;
    check(
      "wander-picks-its-destination-on-screen-inside-the-margin",
      low.asked.join(",") === [margin, screen.width - margin, margin, screen.height - margin].join(",") &&
        legAt(lowWorld.wander.leg(1), margin, margin) &&
        legAt(highWorld.wander.leg(1), screen.width - margin, screen.height - margin) &&
        legAt(shiftedWorld.wander.leg(1), 40 + margin, 30 + margin)
    );

    const world = new wendoo.SpriteWorld(walker);
    const queued = new QueuedRandom([120, 90, 30, 20, 140, 100]);
    world.wander.random = queued;
    const first = world.wander.bearing(walker, 4, 1000, camera);
    const firstUnit = unitBetween(40, 60, 120, 90);
    check(
      "wander-heads-straight-for-its-destination",
      pointsAt(first, firstUnit.x, firstUnit.y) && legAt(world.wander.leg(4), 120, 90)
    );

    walker.setPosition(100, 80);
    const kept = world.wander.bearing(walker, 4, 2000, camera);
    const keptUnit = unitBetween(100, 80, 120, 90);
    const keptFar = pointsAt(kept, keptUnit.x, keptUnit.y);
    walker.setPosition(120 - wendoo.WANDER_ARRIVAL_DISTANCE - 1, 90);
    world.wander.bearing(walker, 4, 2000, camera);
    check(
      "wander-keeps-its-destination-until-it-arrives",
      keptFar && queued.taken === 2 && legAt(world.wander.leg(4), 120, 90)
    );

    walker.setPosition(120 - wendoo.WANDER_ARRIVAL_DISTANCE, 90);
    const repicked = world.wander.bearing(walker, 4, 2000, camera);
    const repickedUnit = unitBetween(120 - wendoo.WANDER_ARRIVAL_DISTANCE, 90, 30, 20);
    check(
      "wander-picks-anew-on-arrival",
      queued.taken === 4 && legAt(world.wander.leg(4), 30, 20) && pointsAt(repicked, repickedUnit.x, repickedUnit.y)
    );

    walker.setPosition(100, 100);
    world.wander.bearing(walker, 4, 2000 + wendoo.WANDER_DEADLINE_MS - 1, camera);
    const keptBeforeDeadline = queued.taken === 4 && legAt(world.wander.leg(4), 30, 20);
    world.wander.bearing(walker, 4, 2000 + wendoo.WANDER_DEADLINE_MS, camera);
    check(
      "wander-picks-anew-once-its-deadline-passes",
      keptBeforeDeadline &&
        queued.taken === 6 &&
        legAt(world.wander.leg(4), 140, 100) &&
        world.wander.leg(4).deadline === 2000 + 2 * wendoo.WANDER_DEADLINE_MS
    );

    const pair = new wendoo.SpriteWorld(walker);
    pair.wander.random = new QueuedRandom([20, 20, 140, 100, 60, 30]);
    walker.setPosition(80, 60);
    const toFirst = pair.wander.bearing(walker, 3, 0, camera);
    const toSecond = pair.wander.bearing(walker, 7, 0, camera);
    const firstPairUnit = unitBetween(80, 60, 20, 20);
    const secondPairUnit = unitBetween(80, 60, 140, 100);
    walker.setPosition(20, 20);
    pair.wander.bearing(walker, 3, 10, camera);
    check(
      "two-wander-call-sites-keep-their-own-destinations",
      pointsAt(toFirst, firstPairUnit.x, firstPairUnit.y) &&
        pointsAt(toSecond, secondPairUnit.x, secondPairUnit.y) &&
        legAt(pair.wander.leg(3), 60, 30) &&
        legAt(pair.wander.leg(7), 140, 100)
    );

    const bodyWorld = new wendoo.SpriteWorld(walker);
    bodyWorld.wander.random = new QueuedRandom([120, 90]);
    walker.setPosition(40, 60);
    const ctx = contextIn(bodyWorld);
    ctx.currentCallSiteId = 9;
    ctx.time = 1500;
    const args = moveBuffer();
    args[MOVE_WANDER] = PRESENT;
    moveNow(ctx, args);
    const bodyLeg = bodyWorld.wander.leg(9);
    const movedFirst = movesAlong(walker, 80, 30, 100);
    const composed = moveBuffer();
    composed[MOVE_WANDER] = PRESENT;
    composed[MOVE_SLOWLY] = PRESENT;
    composed[MOVE_UP] = PRESENT;
    moveNow(ctx, composed);
    const heading = unitBetween(40, 60, 120, 90);
    check(
      "move-wander-heads-for-the-destination-its-call-site-holds",
      legAt(bodyLeg, 120, 90) &&
        bodyLeg.deadline === 1500 + wendoo.WANDER_DEADLINE_MS &&
        movedFirst &&
        movesAlong(walker, heading.x, heading.y - 1, 50)
    );

    stopFrames();
    const closeWorld = new wendoo.SpriteWorld(walker);
    closeWorld.wander.random = new QueuedRandom([43, 64]);
    placeAt(walker, 40, 60);
    const closeCtx = contextIn(closeWorld);
    closeCtx.currentCallSiteId = 2;
    closeCtx.dt = STEP_MS;
    const brisk = moveBuffer();
    brisk[MOVE_WANDER] = PRESENT;
    brisk[MOVE_SPEED] = wendoo.mkNumber(400);
    moveNow(closeCtx, brisk);
    check(
      "wander-within-one-step-lands-on-its-destination",
      legAt(closeWorld.wander.leg(2), 43, 64) && movesAlong(walker, 3, 4, speedToReach(400, 5, STEP_MS))
    );

    const restWorld = new wendoo.SpriteWorld(walker);
    restWorld.wander.random = new QueuedRandom([40, 60]);
    const restCtx = contextIn(restWorld);
    restCtx.currentCallSiteId = 2;
    restCtx.dt = STEP_MS;
    moveNow(restCtx, brisk);
    check("wander-arrived-holds-still", legAt(restWorld.wander.leg(2), 40, 60) && movesAt(walker, 0, 0));

    const arrivals: number[] = [];
    for (let i = 0; i < FRAME_SCHEDULES.length; i++) {
      const roving = new wendoo.SpriteWorld(walker);
      roving.wander.random = new SeededRandom(7);
      placeAt(walker, 80, 60);
      const rovingCtx = contextIn(roving);
      rovingCtx.currentCallSiteId = 5;
      const fast = moveBuffer();
      fast[MOVE_WANDER] = PRESENT;
      fast[MOVE_QUICKLY] = wendoo.mkNumber(3);
      let leg: wendoo.WanderLeg;
      let arrived = 0;
      let deadlines = 0;
      let frames = 0;
      let elapsed = 0;
      while (elapsed < WANDER_RUN_MS) {
        elapsed += FRAME_SCHEDULES[i][frames % FRAME_SCHEDULES[i].length];
        frames++;
      }
      stepMove(rovingCtx, fast, FRAME_SCHEDULES[i], frames, (timeMs: number) => {
        const current = roving.wander.leg(5);
        if (leg !== undefined && current !== leg) {
          if (timeMs >= leg.deadline) {
            deadlines++;
          } else {
            arrived++;
          }
        }
        leg = current;
      });
      arrivals.push(deadlines > 0 ? 0 : arrived);
    }
    resumeFrames();
    let fewest = arrivals[0];
    let most = arrivals[0];
    for (let i = 1; i < arrivals.length; i++) {
      fewest = Math.min(fewest, arrivals[i]);
      most = Math.max(most, arrivals[i]);
    }
    check(
      "wander-at-speed-arrives-alike-at-every-frame-rate",
      fewest >= WANDER_RUN_LEAST_ARRIVALS && most - fewest <= most * 0.15
    );
    walker.destroy();
    pause(FRAMES_MS);

    const roamer = solidSprite(8, 40, 40);
    const ambler = solidSprite(8, 120, 40);
    const darter = solidSprite(8, 40, 100);
    wendoo.runBrain(roamer, wendooBrains.p_roamBareWander01);
    wendoo.runBrain(ambler, wendooBrains.p_ambleSlowWander1);
    wendoo.runBrain(darter, wendooBrains.p_dartQuickWander1);
    pause(FRAMES_MS);
    check("a-bare-wander-heads-for-an-on-screen-destination", headsForItsLeg(roamer, 100) && faultsInScene() === 0);
    check("wander-composes-with-slowly-and-quickly", headsForItsLeg(ambler, 50) && headsForItsLeg(darter, 200));
    roamer.destroy();
    ambler.destroy();
    darter.destroy();
    pause(FRAMES_MS);

    const lure = solidSprite(8, 80, 60);
    const drawn = solidSprite(8, 40, 60);
    wendoo.runBrain(drawn, wendooBrains.p_drawnTowardWndr1);
    pause(FRAMES_MS);
    const drawnWander = runningWorld(drawn).wander;
    const drawnLeg = drawnWander.legs[0];
    const toLure = unitToward(drawn, lure);
    const toLeg = unitBetween(drawn.x, drawn.y, drawnLeg.x, drawnLeg.y);
    check(
      "toward-with-wander-bends-pursuit-toward-the-destination",
      drawnWander.legs.length === 1 &&
        legOnScreen(drawnLeg) &&
        movesAlong(drawn, toLure.x + toLeg.x, toLure.y + toLeg.y, 100)
    );
    lure.destroy();
    drawn.destroy();
    pause(FRAMES_MS);

    const doubled = solidSprite(8, 80, 60);
    wendoo.runBrain(doubled, wendooBrains.p_twofoldWander001);
    pause(FRAMES_MS);
    const doubledWander = runningWorld(doubled).wander;
    let twoLegs = doubledWander.legs.length === 2 && doubledWander.callSiteIds[0] !== doubledWander.callSiteIds[1];
    let blendX = 0;
    let blendY = 0;
    for (let i = 0; twoLegs && i < 2; i++) {
      const leg = doubledWander.legs[i];
      twoLegs = legOnScreen(leg);
      const toward = unitBetween(doubled.x, doubled.y, leg.x, leg.y);
      const share = speedToReach(100, distanceTo(doubled, leg.x, leg.y), lastFrameMs()) / 2;
      blendX += share * toward.x;
      blendY += share * toward.y;
    }
    check(
      "two-wander-rules-on-one-sprite-keep-two-destinations",
      twoLegs && movesAt(doubled, blendX, blendY) && faultsInScene() === 0
    );
    game.popScene();
  }

  /**
   * In a scene of its own, its frames stopped, check the top speed a move
   * sets its sprite going: a move asking for more than the engine's top
   * speed goes at the top speed in the direction it asks, on a diagonal as
   * on a straight line, and a move below it at its own speed; and the direct
   * applicator holds a verdict faster than the top speed to the top speed in
   * the verdict's own direction, and sets any other verdict as it is.
   */
  function checkSpeedLimit(): void {
    game.pushScene();
    stopFrames();
    const racer = solidSprite(8, 80, 60);
    const ctx = contextOn(racer);
    const dash = moveBuffer();
    dash[MOVE_QUICKLY] = wendoo.mkNumber(3);
    dash[MOVE_RIGHT] = PRESENT;
    moveNow(ctx, dash);
    const straight = movesAt(racer, ENGINE_TOP_SPEED, 0);
    dash[MOVE_UP] = PRESENT;
    moveNow(ctx, dash);
    const diagonal = movesAlong(racer, 1, -1, ENGINE_TOP_SPEED);
    dash[MOVE_QUICKLY] = wendoo.NIL_VALUE;
    dash[MOVE_SPEED] = wendoo.mkNumber(400);
    moveNow(ctx, dash);
    check(
      "move-past-the-engines-top-speed-goes-at-it-in-the-direction-asked",
      straight && diagonal && movesAlong(racer, 1, -1, 400)
    );

    const applicator = new wendoo.DirectMotionApplicator();
    applicator.apply(new wendoo.MotionVerdict(racer, 480, -640, new wendoo.AppliedMotion()), 0);
    const held = movesAt(racer, 300, -400);
    applicator.apply(new wendoo.MotionVerdict(racer, -300, 400, new wendoo.AppliedMotion()), 0);
    const atTop = movesAt(racer, -300, 400);
    applicator.apply(new wendoo.MotionVerdict(racer, 120, 0, new wendoo.AppliedMotion()), 0);
    check(
      "the-direct-applicator-holds-a-velocity-to-the-top-speed-in-its-direction",
      held && atTop && movesAt(racer, 120, 0)
    );
    racer.destroy();
    resumeFrames();
    game.popScene();
  }

  /** The smoothing time constants the smoothing checks set, in milliseconds: a moderate one and a heavy one. */
  const SMOOTHING_TIME_CONSTANTS = [100, 150];

  /** The fraction of the gap to its asked velocity a move smoothed with time constant `smoothingMs` closes over a frame of `stepMs` milliseconds. */
  function easedShare(stepMs: number, smoothingMs: number): number {
    return 1 - Math.exp(-stepMs / smoothingMs);
  }

  /** Whether `motion` is the velocity `vx`, `vy` to within {@link NUMBER_TOLERANCE}. */
  function motionIs(motion: wendoo.AppliedMotion, vx: number, vy: number): boolean {
    return near(motion.vx, vx, NUMBER_TOLERANCE) && near(motion.vy, vy, NUMBER_TOLERANCE);
  }

  /** How many frames of the durations `schedule` repeats make up `durationMs` milliseconds, rounded up. */
  function frameCount(schedule: number[], durationMs: number): number {
    let elapsed = 0;
    let frames = 0;
    while (elapsed < durationMs) {
      elapsed += schedule[frames % schedule.length];
      frames++;
    }
    return frames;
  }

  /** How long the smoothed-start runs last, in milliseconds of game time. */
  const SMOOTHED_RUN_MS = 600;

  /** The earliest time after its first frame began, as a multiple of the smoothing time constant, at which a smoothed move from rest may first reach 90% of its speed. */
  const SMOOTHED_RISE_LEAST = 2;

  /** The latest time after its first frame began, as a multiple of the smoothing time constant, at which a smoothed move from rest may first reach 90% of its speed. */
  const SMOOTHED_RISE_MOST = 2.8;

  /** How far apart the smoothed-start runs at about 60 and 30 frames a second may be at each 100 ms mark, in pixels. */
  const SMOOTHED_TRACK_TOLERANCE = 1.5;

  /**
   * In a scene of its own, its frames stopped, check move smoothing at each
   * of {@link SMOOTHING_TIME_CONSTANTS}: the direct applicator eases a
   * speed-up by the exponential of the frame's duration, eases a turn at the
   * same speed, and sets a slow-down and a stop at once; it reads the
   * setting on every verdict, sets every verdict at once while smoothing is
   * off or the frame's duration is 0, and keeps the velocity it set while
   * off; stepped at about 60, 50 and 30 frames a second, a move from rest
   * reaches 90% of its speed within its envelope and stops on the first
   * frame without a move, and the runs at about 60 and 30 travel alike; and
   * a move toward a still sprite never passes it, and a move toward a point
   * its sprite already holds sets it still at once, whatever velocity it
   * last set. Each check holds at every time constant.
   */
  function checkMoveSmoothing(): void {
    game.pushScene();
    stopFrames();
    const glider = solidSprite(8, 20, 60);
    const quarry = solidSprite(8, 113, 60);
    const applicator = new wendoo.DirectMotionApplicator();
    let easesSpeedUps = true;
    let snapsSlowing = true;
    let readsLive = true;
    let risesAndStops = true;
    let travelsAlike = true;
    let keepsGoals = true;
    for (let t = 0; t < SMOOTHING_TIME_CONSTANTS.length; t++) {
      const smoothingMs = SMOOTHING_TIME_CONSTANTS[t];
      const share = easedShare(STEP_MS, smoothingMs);
      wendoo.moveSmoothing = smoothingMs;

      const rising = new wendoo.AppliedMotion();
      applicator.apply(new wendoo.MotionVerdict(glider, 100, 0, rising), STEP_MS);
      const firstEase = motionIs(rising, 100 * share, 0) && movesAt(glider, rising.vx, 0);
      const afterFirst = rising.vx;
      applicator.apply(new wendoo.MotionVerdict(glider, 100, 0, rising), 2 * STEP_MS);
      easesSpeedUps =
        easesSpeedUps &&
        firstEase &&
        motionIs(rising, afterFirst + (100 - afterFirst) * easedShare(2 * STEP_MS, smoothingMs), 0);

      const cruising = new wendoo.AppliedMotion();
      cruising.vx = 100;
      applicator.apply(new wendoo.MotionVerdict(glider, 40, 30, cruising), STEP_MS);
      const slowsAtOnce = cruising.vx === 40 && cruising.vy === 30 && movesAt(glider, 40, 30);
      applicator.apply(new wendoo.MotionVerdict(glider, -30, 40, cruising), STEP_MS);
      const turnEases = motionIs(cruising, 40 - 70 * share, 30 + 10 * share);
      applicator.release(glider, cruising);
      snapsSlowing =
        snapsSlowing && slowsAtOnce && turnEases && cruising.vx === 0 && cruising.vy === 0 && movesAt(glider, 0, 0);

      const live = new wendoo.AppliedMotion();
      wendoo.moveSmoothing = 0;
      applicator.apply(new wendoo.MotionVerdict(glider, 100, 0, live), STEP_MS);
      const offSetsAtOnce = live.vx === 100 && live.vy === 0 && movesAt(glider, 100, 0);
      wendoo.moveSmoothing = smoothingMs;
      applicator.apply(new wendoo.MotionVerdict(glider, 100, 0, live), STEP_MS);
      const keptWhileOff = live.vx === 100;
      applicator.apply(new wendoo.MotionVerdict(glider, 200, 0, live), STEP_MS);
      const easesOnceOn = motionIs(live, 100 + 100 * share, 0);
      applicator.apply(new wendoo.MotionVerdict(glider, 300, 0, live), 0);
      const untimedSetsAtOnce = live.vx === 300;
      wendoo.moveSmoothing = 0;
      applicator.apply(new wendoo.MotionVerdict(glider, 400, -100, live), STEP_MS);
      readsLive =
        readsLive &&
        offSetsAtOnce &&
        keptWhileOff &&
        easesOnceOn &&
        untimedSetsAtOnce &&
        live.vx === 400 &&
        live.vy === -100 &&
        movesAt(glider, 400, -100);

      wendoo.moveSmoothing = smoothingMs;
      const rightward = moveBuffer();
      rightward[MOVE_RIGHT] = PRESENT;
      const marks: number[][] = [];
      for (let i = 0; i < FRAME_SCHEDULES.length; i++) {
        placeAt(glider, 20, 60);
        const world = new wendoo.SpriteWorld(glider);
        const ctx = contextIn(world);
        const positions: number[] = [];
        let rise = -1;
        stepMove(
          ctx,
          rightward,
          FRAME_SCHEDULES[i],
          frameCount(FRAME_SCHEDULES[i], SMOOTHED_RUN_MS),
          (timeMs: number) => {
            if (rise < 0 && glider.vx >= 90) {
              rise = timeMs;
            }
            if (timeMs % 100 === 0) {
              positions.push(glider.x);
            }
          }
        );
        marks.push(positions);
        const stopMs = FRAME_SCHEDULES[i][0];
        game.currentScene().physicsEngine.move(stopMs / 1000);
        wendoo.sceneMotionArbiter(game.currentScene()).resolve(stopMs);
        risesAndStops =
          risesAndStops &&
          rise >= SMOOTHED_RISE_LEAST * smoothingMs &&
          rise <= SMOOTHED_RISE_MOST * smoothingMs &&
          glider.vx === 0 &&
          glider.vy === 0 &&
          world.motion.vx === 0;
      }
      const last = marks.length - 1;
      travelsAlike =
        travelsAlike && marks[0].length === SMOOTHED_RUN_MS / 100 && marks[last].length === marks[0].length;
      for (let i = 0; travelsAlike && i < marks[0].length; i++) {
        travelsAlike = Math.abs(marks[0][i] - marks[last][i]) <= SMOOTHED_TRACK_TOLERANCE;
      }

      const pursuit = moveBuffer();
      pursuit[MOVE_TOWARD] = PRESENT;
      pursuit[MOVE_QUICKLY] = wendoo.mkNumber(3);
      pursuit[MOVE_TARGET_SPRITE] = wendoo.spriteValue(quarry);
      for (let i = 0; i < FRAME_SCHEDULES.length; i++) {
        placeAt(quarry, 113, 60);
        placeAt(glider, 20, 60);
        const ctx = contextIn(new wendoo.SpriteWorld(glider));
        let farthest = glider.x;
        stepMove(ctx, pursuit, FRAME_SCHEDULES[i], 90, (timeMs: number) => {
          farthest = Math.max(farthest, glider.x);
        });
        keepsGoals =
          keepsGoals && farthest <= 113 + 0.5 && distanceBetween(glider, quarry) < 0.5 && Math.abs(glider.vx) < 1;
      }
      const holder = new wendoo.SpriteWorld(glider);
      holder.motion.vx = 250;
      const holdCtx = contextIn(holder);
      holdCtx.dt = STEP_MS;
      const holding = moveBuffer();
      holding[MOVE_TOWARD] = PRESENT;
      holding[MOVE_TARGET_POINT] = pointValue(60, 60);
      placeAt(glider, 60, 60);
      moveNow(holdCtx, holding);
      keepsGoals = keepsGoals && glider.vx === 0 && glider.vy === 0 && holder.motion.vx === 0;
    }
    wendoo.moveSmoothing = 0;
    check("smoothing-eases-a-speed-up-by-the-exponential-of-the-frame-time", easesSpeedUps);
    check("smoothing-sets-a-slow-down-and-a-stop-at-once-and-eases-a-turn", snapsSlowing);
    check("smoothing-reads-its-setting-live-and-sets-at-once-when-off", readsLive);
    check("smoothing-eases-a-start-within-its-envelope-and-stops-at-once", risesAndStops);
    check("smoothing-travels-alike-at-60-and-30-frames-a-second", travelsAlike);
    check("smoothing-keeps-goal-landings-and-the-arrival-hold-exact", keepsGoals);
    glider.destroy();
    quarry.destroy();
    resumeFrames();
    game.popScene();
  }

  /** A one-bit-per-pixel image 2 wide and 9 tall, as MakeCode's own image buffer: rows 0, 7 and 8 lit in column 0, rows 1 and 8 in column 1. */
  const MONO_ICON_HEX = "870102000900000081010201";

  /**
   * Check the arcade icon encoder: it writes MakeCode's own image buffer --
   * 0x87, the image's bits per pixel, its width and height as little-endian
   * 16-bit integers, two zero bytes, then each column, 4-bit pixels two to a
   * byte with the upper row in the high nibble and each column padded to a
   * multiple of 4 bytes, 1-bit pixels eight to a byte padded to whole bytes
   * -- which MakeCode's image reader turns back into the same image; and it
   * renders nothing for an icon that is no image.
   */
  function checkIconEncoder(): void {
    const encoder = new wendoo.ImageIconEncoder();
    let wide = "87042c0101000000";
    for (let i = 0; i < 300; i++) {
      wide += "00000000";
    }
    check(
      "icon-encoder-writes-makecodes-image-buffer",
      encoder.encode(img`
        . 1 f
        a . 2
      `) === "8704030002000000a0000000010000002f000000" &&
        encoder.encode(img`
          1
          2
          3
        `) === "870401000300000021030000" &&
        encoder.encode(image.create(300, 1)) === wide &&
        encoder.encode(image.ofBuffer(Buffer.fromHex(MONO_ICON_HEX))) === MONO_ICON_HEX
    );
    const icons = [
      wendoo.DPAD_ICON,
      wendoo.IMAGE_ACCESSOR_ICON,
      heroPicture(),
      image.ofBuffer(Buffer.fromHex(MONO_ICON_HEX)),
    ];
    let readBack = true;
    for (let i = 0; i < icons.length; i++) {
      readBack = readBack && image.ofBuffer(Buffer.fromHex(encoder.encode(icons[i]))).equals(icons[i]);
    }
    check("icon-encoder-buffer-reads-back-as-the-same-image", readBack);
    check("icon-encoder-renders-nothing-for-what-is-no-image", encoder.encode("dpad") === "");
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
    const drift = wendooBrains.p_driftBareMove001;
    const dashBytes = wendooBrains.p_dashQuickly00001.bytecode;
    const host = wendoo.sceneProgramHost(game.currentScene());
    const swapped = spriteRunning(drift);
    const alsoSwapped = spriteRunning(drift);
    const bystander = spriteRunning(wendooBrains.p_countedWhenMove1);
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

    postUpdate(drift, wendooBrains.p_wrongProfile0001.bytecode, "0000000b");
    postUpdate(drift, wendooBrains.p_unmappedMove0001.bytecode, "0000000c");
    postUpdate(drift, wendooBrains.p_unmappedType0001.bytecode, "0000000d");
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

    const twin = wendooBrains.p_Hq7EB8SthdeOudyP;
    const twinBytes = wendooBrains.p_LBddvitRopf1wCnj.bytecode;
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
        drift.bytecode.equals(wendooBrains.none.bytecode) &&
        movesAt(swapped, 0, 0) &&
        movesAt(spawned, 0, 0) &&
        faultsInScene() === 0
    );
    controller.right.setPressed(false);
  }

  /** Line the selftest prints as it turns the Wendoo extensions' debug logging on. */
  const DEBUG_ON_LINE = "DEBUG ON";

  /**
   * With the Wendoo extensions' debug logging left as the game starts --
   * off -- provoke what they log while it is on: the first frames of the
   * game's first scene, whose program host refuses programs, a message the
   * VM extension refuses, and an image no factory holds; then print
   * {@link DEBUG_ON_LINE} and turn debug logging on for the rest of the run.
   */
  function checkDebugLoggingOff(): void {
    check("debug-logging-defaults-off", !wendoo.debug);
    check("move-smoothing-defaults-off", wendoo.moveSmoothing === 0);
    wendoo.receiveSimMessage(Buffer.fromArray([0x78, 0x0a]));
    wendoo.imageOf(imageLiteral("imageQuiet"));
    pause(FRAMES_MS);
    console.log(DEBUG_ON_LINE);
    wendoo.debug = true;
  }

  /**
   * Give sprites their programs, let the game run, and check the programs
   * ran on their sprites: paired by id, thinking each frame, two programs
   * sharing a name each on its own sprite, the empty program running
   * nothing, a destroyed sprite's program ended, and a pushed scene pausing
   * its programs while the new scene runs its own; then check the arcade
   * base pack's direction arithmetic, how its tiles move sprites, how the
   * running game takes program updates, the bump sensor, the move's toward
   * and away modifiers, the in-range and out-of-range sensors, image assets
   * with the tiles reading them, the proximity sensors' image, sprite and
   * brain filters, their outputs and their positional modifiers, the target
   * the move's toward and away carry, the move's wander, and the arcade icon
   * encoder.
   */
  export function run(): void {
    console.log(`SIMCAP START ${SELFTEST_CASE_ID}`);
    checkDebugLoggingOff();

    const ticker = newSprite(SpriteKind.Player);
    const twinA = newSprite(SpriteKind.Player);
    const twinB = newSprite(SpriteKind.Enemy);
    const idle = newSprite(SpriteKind.Enemy);
    wendoo.runBrain(ticker, wendooBrains.p_akBQz0nySKaYx37w);
    wendoo.runBrain(twinA, wendooBrains.p_Hq7EB8SthdeOudyP);
    wendoo.runBrain(twinB, wendooBrains.p_LBddvitRopf1wCnj);
    wendoo.runBrain(idle, wendooBrains.none);
    check("program-waits-for-the-next-frame", programOf(ticker) === NOT_RUNNING);

    pause(FRAMES_MS);
    check(
      "program-runs-on-its-sprite-by-id",
      programOf(ticker) === TICKER_ID &&
        programOf(twinA) === TWIN_IDS[0] &&
        programOf(twinB) === TWIN_IDS[1] &&
        programOf(idle) === wendooBrains.none.id
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
    wendoo.runBrain(pushed, wendooBrains.p_akBQz0nySKaYx37w);
    pause(FRAMES_MS);
    check("pushed-scene-runs-its-own-programs", programOf(pushed) === TICKER_ID && ticksOf(pushed) > 0);
    game.popScene();
    check("pushed-scene-pauses-programs-below-it", ticksOf(twinA) === pausedTicks);
    pause(FRAMES_MS);
    check("popped-scene-resumes-its-programs", ticksOf(twinA) > pausedTicks);

    checkDirectionArithmetic();
    checkMovement();
    checkDirectionModifiers();
    checkProgramUpdates(twinA);
    checkBump();
    checkRelationalModifiers();
    checkRangeSensors();
    checkImageAssets();
    checkSpriteFilters();
    checkBrainFilters();
    checkSpriteFields();
    checkMyself();
    checkSensorOutputs();
    checkPositionalModifiers();
    checkMoveTargets();
    checkWander();
    checkSpeedLimit();
    checkMoveSmoothing();
    checkIconEncoder();

    console.log(`CHECKS failed ${failedChecks}`);
    console.log(`SIMCAP PASS ${SELFTEST_CASE_ID}`);
  }
}
