/*
 * Test-only surface: `gen-selftest.js` copies this file into the generated
 * arcade selftest project and lists it in that project's `pxt.json`.
 */

/**
 * The arcade selftest: it gives sprites of a running Arcade game the
 * programs the project's brains module declares, through the Wendoo arcade
 * extension's block function, and reports how the programs ran across the
 * game's frames -- among them programs placing the arcade base pack's dpad,
 * bump, in-range, out-of-range and move tiles, driven by pressing the
 * controller's buttons and placing and moving sprites from game code, and
 * programs updated while the game runs, through the messages the Wendoo
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
    wendoo.runProgram(sprite, program);
    return sprite;
  }

  /** The direction the chosen cardinals specify, as the move's direction modifiers sum them with neither `toward` nor `away`. */
  function cardinals(up: boolean, down: boolean, left: boolean, right: boolean): wendoo.DirectionVector {
    return wendoo.specifiedDirection(up, down, left, right, false, false, undefined);
  }

  /**
   * Check the arcade base pack's direction arithmetic directly: the analog
   * dead band and its live band, the dpad's modifier mask, the move's
   * cardinal sum and direction fallback, and its speed. Call it once the
   * program hosts have drained registrations.
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
    wendoo.runProgram(nudged, wendooBrains.p_nudgeBumpMove001);
    wendoo.runProgram(fleeing, wendooBrains.p_fleeBumpLeftUp01);
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
   * center add nothing to each other's pursuit; a rule whose WHEN produces no
   * sprite moves in the default direction, or in the direction its WHEN
   * produced; and a program update turns a running pursuit to flight live.
   */
  function checkRelationalModifiers(): void {
    game.pushScene();
    const host = wendoo.sceneProgramHost(game.currentScene());
    const subject = solidSprite(80, 80, 60);

    const chasing = solidSprite(8, 104, 78);
    const fleeing = solidSprite(8, 68, 51);
    wendoo.runProgram(chasing, wendooBrains.p_chaseBumpToward1);
    wendoo.runProgram(fleeing, wendooBrains.p_shyBumpAway00001);
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
    wendoo.runProgram(wavering, wendooBrains.p_waverTowardAway1);
    wendoo.runProgram(waveringFlipped, wendooBrains.p_waverAwayToward1);
    wendoo.runProgram(stalking, wendooBrains.p_stalkTowardUp001);
    wendoo.runProgram(stalkingFlipped, wendooBrains.p_stalkUpToward001);
    wendoo.runProgram(dodging, wendooBrains.p_dodgeAwayLeft001);
    wendoo.runProgram(lunging, wendooBrains.p_lungeTowardQuick);
    wendoo.runProgram(skulking, wendooBrains.p_skulkSlowlyAway1);
    wendoo.runProgram(tethered, wendooBrains.p_tetherAwaySpeed1);
    wendoo.runProgram(twin, wendooBrains.p_chaseBumpToward1);
    wendoo.runProgram(twinShadow, wendooBrains.p_chaseBumpToward1);
    wendoo.runProgram(homing, wendooBrains.p_homingAlwaysTwd1);
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
      "a-shared-center-adds-nothing-to-pursuit",
      movesAt(twin, 100, 0) && movesAt(twinShadow, 100, 0) && twin.x === twinShadow.x && twin.y === twinShadow.y
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
    wendoo.runProgram(skittish, wendooBrains.p_skittishDpadAwy1);
    pause(FRAMES_MS);
    const skittishQuiet = movesAt(skittish, 0, 0);
    controller.up.setPressed(true);
    pause(FRAMES_MS);
    check("away-under-a-dpad-follows-the-dpad", skittishQuiet && movesAt(skittish, 0, -100));
    controller.up.setPressed(false);
    skittish.destroy();

    const pursuer = solidSprite(8, 104, 78);
    wendoo.runProgram(pursuer, wendooBrains.p_chaseBumpToward1);
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
    wendoo.runProgram(left, program);
    wendoo.runProgram(right, program);
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
    wendoo.runProgram(lone, wendooBrains.p_eitherInUpOutDn1);
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
    wendoo.runProgram(leashed, wendooBrains.p_leashOutToward01);
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
    wendoo.runProgram(shy, wendooBrains.p_keepAwayInAway01);
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
    wendoo.runProgram(chooser, wendooBrains.p_leashOutToward01);
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
    wendoo.runProgram(holder, wendooBrains.p_standoffInOut001);
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
    wendoo.runProgram(hurrying, wendooBrains.p_leashQuickly0001);
    pause(FRAMES_MS);
    const hurried = pursues(hurrying, hurryTarget, 200);
    hurrying.destroy();
    hurryTarget.destroy();
    const dawdling = solidSprite(8, 80, 60);
    const dawdleTarget = solidSprite(8, 100, 60);
    wendoo.runProgram(dawdling, wendooBrains.p_keepAwaySlowly01);
    pause(FRAMES_MS);
    check("speed-words-compose-with-range-rules", hurried && flees(dawdling, dawdleTarget, 50));
    dawdling.destroy();
    dawdleTarget.destroy();

    const swappedLeft = solidSprite(8, 20, 30);
    const swappedRight = solidSprite(8, 50, 30);
    wendoo.runProgram(swappedLeft, wendooBrains.p_nearInRangeMove1);
    wendoo.runProgram(swappedRight, wendooBrains.p_nearInRangeMove1);
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

  /**
   * Give sprites their programs, let the game run, and check the programs
   * ran on their sprites: paired by id, thinking each frame, two programs
   * sharing a name each on its own sprite, the empty program running
   * nothing, a destroyed sprite's program ended, and a pushed scene pausing
   * its programs while the new scene runs its own; then check the arcade
   * base pack's direction arithmetic, how its tiles move sprites, how the
   * running game takes program updates, the bump sensor, the move's toward
   * and away modifiers, and the in-range and out-of-range sensors.
   */
  export function run(): void {
    console.log(`SIMCAP START ${SELFTEST_CASE_ID}`);

    const ticker = newSprite(SpriteKind.Player);
    const twinA = newSprite(SpriteKind.Player);
    const twinB = newSprite(SpriteKind.Enemy);
    const idle = newSprite(SpriteKind.Enemy);
    wendoo.runProgram(ticker, wendooBrains.p_akBQz0nySKaYx37w);
    wendoo.runProgram(twinA, wendooBrains.p_Hq7EB8SthdeOudyP);
    wendoo.runProgram(twinB, wendooBrains.p_LBddvitRopf1wCnj);
    wendoo.runProgram(idle, wendooBrains.none);
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
    wendoo.runProgram(pushed, wendooBrains.p_akBQz0nySKaYx37w);
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

    console.log(`CHECKS failed ${failedChecks}`);
    console.log(`SIMCAP PASS ${SELFTEST_CASE_ID}`);
  }
}
