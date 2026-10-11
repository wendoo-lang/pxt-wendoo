/*
 * Test-only surface: `gen-selftest.js` copies this file into the generated
 * arcade selftest project and lists it in that project's `pxt.json`.
 */

/**
 * The arcade selftest: it gives sprites of a running Arcade game the
 * programs the project's brains module declares, through the Wendoo arcade
 * extension's block function, and reports how the programs ran across the
 * game's frames -- among them programs placing the arcade base pack's dpad,
 * A button, B button, bump, in-range, out-of-range, myself, destroyed, move,
 * add-score, game-over and destroy tiles, its player and particle effect
 * literals, and the `Sprite`, `Vector2` and `Player` accessors, driven by
 * pressing the controllers' buttons, placing, moving and destroying sprites
 * and setting scores from game code, and programs updated while the game
 * runs, through the messages the Wendoo simulator extension posts -- and a
 * program on a program host it drains by hand. It also calls the bump,
 * in-range, out-of-range, myself, dpad, A button, B button, add-score,
 * destroy and destroyed tiles' bodies and the `Sprite` and `Player` types'
 * field hooks directly with image asset, sprite, brain, player and particle
 * effect values, the `Effect`, `Sound` and `ParticleEffect` types' bindings
 * with each of their literals, images resolved through an image factory
 * registered the way a project's images module registers one, and the move
 * tile's body with sprite and point targets and with wander destinations
 * picked from random sources it scripts. It reads and writes the variables
 * of the brains sprites run through the arcade extension's brain variable
 * block functions.
 *
 * Output grammar, one line each:
 *
 * - `CHECK <check> ok` or `CHECK <check> failed`, one per check.
 * - `ASSERT <check>` -- follows each failed check; the capture harness reads
 *   it as the run's failure.
 * - `wendoo program-rejected <code> <id>` -- one per program a scene's host,
 *   or the host drained by hand, refused, as the host logs it.
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
 * - `wendoo WENDOO_PARTICLE_EFFECT_UNUSABLE` -- one for the whole run, the
 *   first time the destroy tile is given a particle effect naming nothing
 *   Arcade holds, as the arcade base pack logs it.
 * - `wendoo WENDOO_SAY_UNSPEAKABLE` -- one for the whole run, the first time
 *   the say tile, given no text, finds its rule's WHEN result holding no
 *   number, text or switch, as the arcade base pack logs it.
 * - `wendoo WENDOO_MOVE_SMOOTHING_UNUSABLE` and `wendoo WENDOO_SCORE_UNUSABLE`
 *   -- one each for the whole run, the first time a sprite's move smoothing
 *   is written, and a score written or added to, with no usable number, as
 *   the arcade base pack logs them.
 * - `wendoo WENDOO_VARIABLE_NO_PROGRAM` and
 *   `wendoo WENDOO_VARIABLE_TYPE_MISMATCH` -- one each for the whole run,
 *   the first time game code reads or writes a brain variable of a sprite
 *   running no brain, and reads one holding a value of another type; and
 *   `wendoo WENDOO_VARIABLE_UNKNOWN <name>` -- one per name, as a JSON
 *   string literal, that game code first read or wrote on a brain declaring
 *   no variable by it, as the VM extension logs them.
 * - `wendoo program-faulted <code> <id>` -- one per fault code a running
 *   program raised, the first time it raised it, as its scene's host logs it;
 *   a run whose programs all run without a fault logs none.
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
      if ((hosted[i].attachment as wendoo.SpriteAttachment).sprite === sprite) {
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
      runtimeIn(host, fleeing) !== fleeRuntime && movesAt(fleeing, 100, 0)
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
      pursuing && runtimeIn(host, pursuer) !== pursuitRuntime && flees(pursuer, subject, 100)
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
      movedInRange && restsInRange && movesAt(swappedLeft, 100, 0) && movesAt(swappedRight, 100, 0)
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

  /** A context whose attachment is `attachment`, for calling a tile's body directly. */
  function contextIn(attachment: wendoo.SpriteAttachment): wendoo.ExecutionContext {
    const services = new wendoo.BrainServices(
      new wendoo.Program(),
      new wendoo.RuleSubtreeLiveness(),
      new wendoo.BrainPageServices()
    );
    return new wendoo.ExecutionContext(services, new wendoo.VariableStore(), attachment);
  }

  /** A context whose attachment is a fresh attachment of `sprite`, for calling a tile's body directly. */
  function contextOn(sprite: Sprite): wendoo.ExecutionContext {
    return contextIn(new wendoo.SpriteAttachment(sprite));
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
    const attachment = hostedAttachment(model);
    const read = readField(attachment, model, "image");
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
      writeField(attachment, byId, "image", imageLiteral(HERO_ASSET_ID)) &&
      writeField(attachment, byName, "image", imageLiteral(HERO_DISPLAY_NAME));
    check(
      "image-write-wears-the-image-its-asset-resolves-to",
      wrote && byId.image.equals(heroPicture()) && byName.image.equals(heroPicture())
    );

    const steady = solidSprite(8, 60, 40);
    const steadyImage = steady.image;
    const keptGone =
      writeField(attachment, steady, "image", imageLiteral(DELETED_ASSET_ID)) &&
      writeField(attachment, steady, "image", imageLiteral(DELETED_ASSET_ID));
    const keptOther =
      writeField(attachment, steady, "image", wendoo.NIL_VALUE) &&
      writeField(attachment, steady, "image", wendoo.mkNativeStruct(wendoo.structTypeId("Decoy"), model.image)) &&
      writeField(attachment, steady, "image", brainLiteral(TICKER_ID));
    check(
      "image-write-of-an-image-no-factory-holds-or-a-value-naming-no-image-keeps-the-image",
      keptGone && keptOther && steady.image === steadyImage
    );

    const source = solidSprite(8, 80, 40);
    const mimic = solidSprite(8, 100, 40);
    const shared = writeField(attachment, mimic, "image", readField(attachment, source, "image"));
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
    const nearest = act(tileBody(wendoo.BUMP_TILE), reader, [readField(attachment, byId, "image"), nil, nil]);
    check("proximity-filters-read-a-worn-image-by-its-pixels", standsFor(nearest, twin));

    const doomed = solidSprite(8, 120, 40);
    const doomedImage = doomed.image;
    doomed.destroy();
    check(
      "image-on-a-destroyed-sprite-reads-nil-and-ignores-writes",
      readsNothing(readField(attachment, doomed, "image")) &&
        writeField(attachment, doomed, "image", imageLiteral(HERO_ASSET_ID)) &&
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
    const attachment = hostedAttachment(late);
    const lateLiteral = imageLiteral(LATE_ASSET_ID);
    const beforeLate = late.image;
    writeField(attachment, late, "image", lateLiteral);
    const unchangedBeforeLate = late.image === beforeLate;
    helpers._registerFactory("image", (name: string) => (name === LATE_ASSET_ID ? latePicture() : null));
    writeField(attachment, late, "image", lateLiteral);
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
   * attachment is `attachment` given the brain filter `brain` and, on a range
   * sensor, the range `range`.
   */
  function senseBrain(
    tileName: string,
    attachment: wendoo.SpriteAttachment,
    brain: wendoo.Value,
    range: wendoo.Value
  ): wendoo.Value {
    const nil = wendoo.NIL_VALUE;
    const body = tileBody(tileName);
    return body ? body.execSync(contextIn(attachment), filterArgs(tileName, nil, nil, brain, range)) : nil;
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
      restsWithoutHero && upNearHero && movesAt(runner, 0, 100)
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

  /** An attachment of `sprite` whose program host is the current scene's, for calling a tile's body on its behalf. */
  function hostedAttachment(sprite: Sprite): wendoo.SpriteAttachment {
    const attachment = new wendoo.SpriteAttachment(sprite);
    attachment.host = wendoo.sceneProgramHost(game.currentScene());
    return attachment;
  }

  /**
   * In a scene of its own, check the brain filter every proximity sensor
   * takes: the `Brain` type takes its atom and its one field from the
   * project's ids module and reads the document id only of its own values;
   * a scene's program host lists the attachments running a brain; around a
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
    const running = host.attachmentsRunning(TICKER_ID);
    check(
      "host-lists-the-attachments-running-a-brain",
      running.length === 2 &&
        (running[0] as wendoo.SpriteAttachment).sprite === nearRunner &&
        (running[1] as wendoo.SpriteAttachment).sprite === farRunner &&
        host.attachmentsRunning(UNKNOWN_BRAIN_ID).length === 0
    );

    const attachment = hostedAttachment(reader);
    const ticker = brainLiteral(TICKER_ID);
    const nil = wendoo.NIL_VALUE;
    const narrow = wendoo.mkNumber(3);
    for (let i = 0; i < PROXIMITY_SENSORS.length; i++) {
      const tile = PROXIMITY_SENSORS[i][0];
      const stem = PROXIMITY_SENSORS[i][1];
      const range = tile === wendoo.OUT_OF_RANGE_TILE ? narrow : nil;
      check(
        `${stem}-given-a-brain-reads-the-nearest-sprite-running-it`,
        standsFor(senseBrain(tile, attachment, ticker, range), nearRunner)
      );
      check(
        `${stem}-given-a-brain-no-sprite-runs-reads-nothing`,
        readsNothing(senseBrain(tile, attachment, brainLiteral(UNKNOWN_BRAIN_ID), range)) &&
          readsNothing(senseBrain(tile, attachment, imageLiteral(HERO_ASSET_ID), range))
      );
    }

    wendoo.runBrain(reader, wendooBrains.p_akBQz0nySKaYx37w);
    pause(FRAMES_MS);
    const ownAttachment = hostedAttachment(reader);
    let readsAnother = true;
    for (let i = 0; i < PROXIMITY_SENSORS.length; i++) {
      const tile = PROXIMITY_SENSORS[i][0];
      const range = tile === wendoo.OUT_OF_RANGE_TILE ? narrow : nil;
      if (!standsFor(senseBrain(tile, ownAttachment, ticker, range), nearRunner)) {
        readsAnother = false;
      }
    }
    nearRunner.destroy();
    farRunner.destroy();
    pause(FRAMES_MS);
    let readsNoneAlone = true;
    for (let i = 0; i < PROXIMITY_SENSORS.length; i++) {
      if (!readsNothing(senseBrain(PROXIMITY_SENSORS[i][0], ownAttachment, ticker, nil))) {
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
        pairMovesAt(wendooBrains.p_kinBrainFilter01, 100, 0, 100)
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
  const SPRITE_FIELDS = ["image", "position", "brain", "moveSmoothing"];

  /** The field id the project's ids module allocates the `Sprite` field `field`. */
  function spriteFieldId(field: string): number {
    return wendoo.projectIds().fieldId(SPRITE_TYPE, field);
  }

  /**
   * What a program running in `attachment` reads from the field `field` of the
   * `Sprite` value standing for `sprite`, through the type's field getter as
   * the VM dispatches it: nil when the getter reads nothing.
   */
  function readField(attachment: wendoo.SpriteAttachment, sprite: Sprite, field: string): wendoo.Value {
    const read = wendoo.spriteBinding.fieldGetter(
      wendoo.spriteValue(sprite),
      spriteFieldId(field),
      contextIn(attachment)
    );
    return read ? read : wendoo.NIL_VALUE;
  }

  /**
   * Whether the type's field setter accepts a program running in `attachment`
   * writing `value` into the field `field` of the `Sprite` value standing for
   * `sprite`, as the VM dispatches it; a refusal would fault the program.
   */
  function writeField(
    attachment: wendoo.SpriteAttachment,
    sprite: Sprite,
    field: string,
    value: wendoo.Value
  ): boolean {
    return wendoo.spriteBinding.fieldSetter(
      wendoo.spriteValue(sprite),
      spriteFieldId(field),
      value,
      contextIn(attachment)
    );
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
    const attachment = hostedAttachment(reader);
    let fieldIdsMatch = wendoo.spriteBinding.fieldIds.length === SPRITE_FIELDS.length;
    for (let i = 0; i < SPRITE_FIELDS.length; i++) {
      fieldIdsMatch = fieldIdsMatch && wendoo.spriteBinding.fieldIds[i] === spriteFieldId(SPRITE_FIELDS[i]);
    }
    check(
      "sprite-type-takes-its-fields-from-the-manifest-and-reads-and-writes-them-through-its-hooks",
      fieldIdsMatch && wendoo.spriteBinding.hasFieldGetter && wendoo.spriteBinding.hasFieldSetter
    );

    const walker = solidSprite(8, 40, 50);
    const first = readField(attachment, walker, "position");
    walker.setPosition(60, 70);
    const second = readField(attachment, walker, "position");
    check(
      "position-reads-a-snapshot-of-the-sprites-center",
      holdsPoint(first, 40, 50) && holdsPoint(second, 60, 70) && first !== second
    );

    walker.vx = 30;
    walker.vy = -20;
    const accepted = writeField(
      attachment,
      walker,
      "position",
      wendoo.vector2Value(new wendoo.DirectionVector(80, 90))
    );
    check(
      "position-write-sets-the-center-at-once-and-keeps-the-velocity",
      accepted && walker.x === 80 && walker.y === 90 && walker.vx === 30 && walker.vy === -20
    );
    walker.vx = 0;
    walker.vy = 0;

    const keptNil = writeField(attachment, walker, "position", wendoo.NIL_VALUE);
    const keptOther = writeField(attachment, walker, "position", imageLiteral(HERO_ASSET_ID));
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
      namesBrain(readField(attachment, runner, "brain"), TICKER_ID) &&
        readsNothing(readField(attachment, idle, "brain")) &&
        readsNothing(readField(attachment, dormant, "brain"))
    );

    const started = writeField(attachment, dormant, "brain", brainLiteral(TICKER_ID));
    const waited = programOf(dormant) === NOT_RUNNING && readsNothing(readField(attachment, dormant, "brain"));
    pause(FRAMES_MS);
    check(
      "brain-write-waits-for-the-drain-which-starts-the-brain",
      started && waited && programOf(dormant) === TICKER_ID
    );

    const instance = hostedOf(runner);
    const ticks = ticksOf(runner);
    let repeated = true;
    for (let i = 0; i < 3; i++) {
      repeated = writeField(attachment, runner, "brain", brainLiteral(TICKER_ID)) && repeated;
      pause(FRAMES_MS / 4);
    }
    check(
      "brain-write-of-the-brain-already-running-restarts-nothing",
      repeated && hostedOf(runner) === instance && ticksOf(runner) > ticks
    );

    const replaced = writeField(attachment, runner, "brain", brainLiteral(TWIN_IDS[0]));
    const stillTicker = programOf(runner) === TICKER_ID;
    pause(FRAMES_MS);
    check(
      "brain-write-of-another-brain-replaces-the-program-at-the-drain",
      replaced && stillTicker && programOf(runner) === TWIN_IDS[0]
    );

    const ended = writeField(attachment, runner, "brain", wendoo.NIL_VALUE);
    const neverRan = solidSprite(8, 180, 100);
    const nothingToEnd = writeField(attachment, neverRan, "brain", wendoo.NIL_VALUE);
    pause(FRAMES_MS);
    check(
      "brain-write-of-nil-ends-the-program-and-starts-nothing-on-a-sprite-running-none",
      ended &&
        nothingToEnd &&
        programOf(runner) === wendooBrains.none.id &&
        readsNothing(readField(attachment, runner, "brain")) &&
        programOf(neverRan) === NOT_RUNNING
    );

    const unresolvedFirst = writeField(attachment, dormant, "brain", brainLiteral(UNKNOWN_BRAIN_ID));
    const unresolvedAgain = writeField(attachment, dormant, "brain", brainLiteral(UNKNOWN_BRAIN_ID));
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
      readsNothing(readField(attachment, doomed, "position")) &&
        readsNothing(readField(attachment, doomed, "brain")) &&
        writeField(attachment, doomed, "position", wendoo.vector2Value(new wendoo.DirectionVector(5, 5))) &&
        writeField(attachment, doomed, "brain", brainLiteral(TWIN_IDS[0])) &&
        doomed.x === x
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
      pursues(flockA, flockB, DEFAULT_MOVE_SPEED) && pursues(flockB, flockA, DEFAULT_MOVE_SPEED)
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
      near(distanceBetween(pursuer, goal), 0, 0.5)
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
      jumper.x === landing.x && jumper.y === landing.y
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
      programOf(convert) === TICKER_ID && programOf(lone) === "convertOnBump001"
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
    check("comparing-y-accessors-moves-up-toward-a-sprite-above-and-not-below", rose && movesAt(riser, 0, 0));
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
   * {@link OUTPUT_PARENT_RULE}, its attachment a fresh attachment of
   * `sprite`; it runs under the parent until its rule funcId is changed.
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
    check("bump-rule-dresses-in-the-bumped-sprite", dressed.image === bumper.image);
    dressed.destroy();
    bumper.destroy();
    pause(FRAMES_MS);

    const wearer = solidSprite(8, 40, 60);
    const touched = solidSprite(8, 46, 60);
    wendoo.runBrain(wearer, wendooBrains.p_dresserBumpWear1);
    pause(FRAMES_MS);
    check(
      "bump-rule-wears-the-image-asset-it-is-given",
      wearer.image.equals(heroPicture()) && !touched.image.equals(heroPicture())
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
    check("child-rule-reads-its-parents-range-output", untouched && kin.image === visitor.image);
    game.popScene();
  }

  /**
   * The sprite `target` wears after one frame in which the sprites `first`
   * and `second`, both touching it and not each other, run the brand program
   * -- a bump rule setting the bumped sprite's image to its own sprite's --
   * `first` attached before `second`, so `first`'s program thinks first.
   */
  function brandedBoth(first: Sprite, second: Sprite, target: Sprite): Image {
    wendoo.runBrain(first, wendooBrains.p_brandOnBump00001);
    wendoo.runBrain(second, wendooBrains.p_brandOnBump00001);
    pause(FRAMES_MS);
    return target.image;
  }

  /**
   * In a scene of its own, check compiled programs writing a field of the
   * sprite a proximity sensor's output holds: a bump rule setting the bumped
   * sprite's brain starts that brain on the sprite it touches, which ran
   * none; an in-range rule setting the sprite in range's image to its own
   * sprite's dresses that sprite in it; and two programs writing one such
   * sprite's image in the same frame leave it the value of the program that
   * thinks later, in either attach order.
   */
  function checkOutputWrites(): void {
    game.pushScene();
    const activator = solidSprite(8, 40, 60);
    const dormant = solidSprite(8, 46, 60);
    const wasDormant = programOf(dormant) === NOT_RUNNING;
    wendoo.runBrain(activator, wendooBrains.p_activateOnBump01);
    pause(FRAMES_MS);
    check(
      "a-brain-assignment-through-the-bumped-sprite-output-starts-the-brain-on-the-sprite-it-touches",
      wasDormant && programOf(dormant) === TICKER_ID && programOf(activator) === "activateOnBump01"
    );
    activator.destroy();
    dormant.destroy();
    pause(FRAMES_MS);

    const painter = solidSprite(8, 40, 60);
    const canvas = heroSprite(60, 60);
    const canvasImage = canvas.image;
    wendoo.runBrain(painter, wendooBrains.p_paintInRange0001);
    pause(FRAMES_MS);
    check(
      "an-image-assignment-through-the-in-range-output-dresses-the-sprite-in-range",
      canvas.image === painter.image && canvas.image !== canvasImage
    );
    painter.destroy();
    canvas.destroy();
    pause(FRAMES_MS);

    const leftFirst = solidSprite(8, 54, 40);
    const rightSecond = solidSprite(8, 66, 40);
    const upper = solidSprite(8, 60, 40);
    const leftSecond = solidSprite(8, 54, 90);
    const rightFirst = solidSprite(8, 66, 90);
    const lower = solidSprite(8, 60, 90);
    const upperWears = brandedBoth(leftFirst, rightSecond, upper);
    const lowerWears = brandedBoth(rightFirst, leftSecond, lower);
    check(
      "two-programs-writing-one-output-read-sprites-image-in-a-frame-leave-the-later-thinkers-value",
      upperWears === rightSecond.image && lowerWears === leftSecond.image
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
    check("range-rule-given-above-pursues-only-a-sprite-above", ignoresBelow && pursues(climber, overhead, 100));
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
      pursues(pouncer, prey, 200) && pursues(pouncerFlipped, prey, 200)
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
      quietWithoutDpad && firstHeading && pursues(heeding, prey, 100) && flees(spurning, prey, 100)
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

  /** The attachment `sprite`'s program runs in, in the current scene. */
  function runningAttachment(sprite: Sprite): wendoo.SpriteAttachment {
    return hostedOf(sprite).attachment as wendoo.SpriteAttachment;
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
    const wander = runningAttachment(sprite).wander;
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
   * random source a sprite's attachment carries; a wander heading straight for
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

    const lowAttachment = new wendoo.SpriteAttachment(walker);
    const low = new PinnedRandom(false);
    lowAttachment.wander.random = low;
    lowAttachment.wander.bearing(walker, 1, 0, camera);
    const highAttachment = new wendoo.SpriteAttachment(walker);
    highAttachment.wander.random = new PinnedRandom(true);
    highAttachment.wander.bearing(walker, 1, 0, camera);
    camera.offsetX = 40;
    camera.offsetY = 30;
    const shiftedAttachment = new wendoo.SpriteAttachment(walker);
    shiftedAttachment.wander.random = new PinnedRandom(false);
    shiftedAttachment.wander.bearing(walker, 1, 0, camera);
    camera.offsetX = 0;
    camera.offsetY = 0;
    check(
      "wander-picks-its-destination-on-screen-inside-the-margin",
      low.asked.join(",") === [margin, screen.width - margin, margin, screen.height - margin].join(",") &&
        legAt(lowAttachment.wander.leg(1), margin, margin) &&
        legAt(highAttachment.wander.leg(1), screen.width - margin, screen.height - margin) &&
        legAt(shiftedAttachment.wander.leg(1), 40 + margin, 30 + margin)
    );

    const attachment = new wendoo.SpriteAttachment(walker);
    const queued = new QueuedRandom([120, 90, 30, 20, 140, 100]);
    attachment.wander.random = queued;
    const first = attachment.wander.bearing(walker, 4, 1000, camera);
    const firstUnit = unitBetween(40, 60, 120, 90);
    check(
      "wander-heads-straight-for-its-destination",
      pointsAt(first, firstUnit.x, firstUnit.y) && legAt(attachment.wander.leg(4), 120, 90)
    );

    walker.setPosition(100, 80);
    const kept = attachment.wander.bearing(walker, 4, 2000, camera);
    const keptUnit = unitBetween(100, 80, 120, 90);
    const keptFar = pointsAt(kept, keptUnit.x, keptUnit.y);
    walker.setPosition(120 - wendoo.WANDER_ARRIVAL_DISTANCE - 1, 90);
    attachment.wander.bearing(walker, 4, 2000, camera);
    check(
      "wander-keeps-its-destination-until-it-arrives",
      keptFar && queued.taken === 2 && legAt(attachment.wander.leg(4), 120, 90)
    );

    walker.setPosition(120 - wendoo.WANDER_ARRIVAL_DISTANCE, 90);
    const repicked = attachment.wander.bearing(walker, 4, 2000, camera);
    const repickedUnit = unitBetween(120 - wendoo.WANDER_ARRIVAL_DISTANCE, 90, 30, 20);
    check(
      "wander-picks-anew-on-arrival",
      queued.taken === 4 &&
        legAt(attachment.wander.leg(4), 30, 20) &&
        pointsAt(repicked, repickedUnit.x, repickedUnit.y)
    );

    walker.setPosition(100, 100);
    attachment.wander.bearing(walker, 4, 2000 + wendoo.WANDER_DEADLINE_MS - 1, camera);
    const keptBeforeDeadline = queued.taken === 4 && legAt(attachment.wander.leg(4), 30, 20);
    attachment.wander.bearing(walker, 4, 2000 + wendoo.WANDER_DEADLINE_MS, camera);
    check(
      "wander-picks-anew-once-its-deadline-passes",
      keptBeforeDeadline &&
        queued.taken === 6 &&
        legAt(attachment.wander.leg(4), 140, 100) &&
        attachment.wander.leg(4).deadline === 2000 + 2 * wendoo.WANDER_DEADLINE_MS
    );

    const pair = new wendoo.SpriteAttachment(walker);
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

    const bodyAttachment = new wendoo.SpriteAttachment(walker);
    bodyAttachment.wander.random = new QueuedRandom([120, 90]);
    walker.setPosition(40, 60);
    const ctx = contextIn(bodyAttachment);
    ctx.currentCallSiteId = 9;
    ctx.time = 1500;
    const args = moveBuffer();
    args[MOVE_WANDER] = PRESENT;
    moveNow(ctx, args);
    const bodyLeg = bodyAttachment.wander.leg(9);
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
    const closeAttachment = new wendoo.SpriteAttachment(walker);
    closeAttachment.wander.random = new QueuedRandom([43, 64]);
    placeAt(walker, 40, 60);
    const closeCtx = contextIn(closeAttachment);
    closeCtx.currentCallSiteId = 2;
    closeCtx.dt = STEP_MS;
    const brisk = moveBuffer();
    brisk[MOVE_WANDER] = PRESENT;
    brisk[MOVE_SPEED] = wendoo.mkNumber(400);
    moveNow(closeCtx, brisk);
    check(
      "wander-within-one-step-lands-on-its-destination",
      legAt(closeAttachment.wander.leg(2), 43, 64) && movesAlong(walker, 3, 4, speedToReach(400, 5, STEP_MS))
    );

    const restAttachment = new wendoo.SpriteAttachment(walker);
    restAttachment.wander.random = new QueuedRandom([40, 60]);
    const restCtx = contextIn(restAttachment);
    restCtx.currentCallSiteId = 2;
    restCtx.dt = STEP_MS;
    moveNow(restCtx, brisk);
    check("wander-arrived-holds-still", legAt(restAttachment.wander.leg(2), 40, 60) && movesAt(walker, 0, 0));

    const arrivals: number[] = [];
    for (let i = 0; i < FRAME_SCHEDULES.length; i++) {
      const roving = new wendoo.SpriteAttachment(walker);
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
    check("a-bare-wander-heads-for-an-on-screen-destination", headsForItsLeg(roamer, 100));
    check("wander-composes-with-slowly-and-quickly", headsForItsLeg(ambler, 50) && headsForItsLeg(darter, 200));
    roamer.destroy();
    ambler.destroy();
    darter.destroy();
    pause(FRAMES_MS);

    const lure = solidSprite(8, 80, 60);
    const drawn = solidSprite(8, 40, 60);
    wendoo.runBrain(drawn, wendooBrains.p_drawnTowardWndr1);
    pause(FRAMES_MS);
    const drawnWander = runningAttachment(drawn).wander;
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
    const doubledWander = runningAttachment(doubled).wander;
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
    check("two-wander-rules-on-one-sprite-keep-two-destinations", twoLegs && movesAt(doubled, blendX, blendY));
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
    applicator.apply(new wendoo.MotionVerdict(racer, 480, -640), 0);
    const held = movesAt(racer, 300, -400);
    applicator.apply(new wendoo.MotionVerdict(racer, -300, 400), 0);
    const atTop = movesAt(racer, -300, 400);
    applicator.apply(new wendoo.MotionVerdict(racer, 120, 0), 0);
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
   * moves at. Each check holds at every time constant.
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

      placeAt(glider, 20, 60);
      applicator.apply(new wendoo.MotionVerdict(glider, 100, 0), STEP_MS);
      const afterFirst = 100 * share;
      const firstEase = movesAt(glider, afterFirst, 0);
      applicator.apply(new wendoo.MotionVerdict(glider, 100, 0), 2 * STEP_MS);
      easesSpeedUps =
        easesSpeedUps &&
        firstEase &&
        movesAt(glider, afterFirst + (100 - afterFirst) * easedShare(2 * STEP_MS, smoothingMs), 0);

      glider.vx = 100;
      applicator.apply(new wendoo.MotionVerdict(glider, 40, 30), STEP_MS);
      const slowsAtOnce = glider.vx === 40 && glider.vy === 30;
      applicator.apply(new wendoo.MotionVerdict(glider, -30, 40), STEP_MS);
      const turnEases = movesAt(glider, 40 - 70 * share, 30 + 10 * share);
      applicator.release(glider);
      snapsSlowing = snapsSlowing && slowsAtOnce && turnEases && glider.vx === 0 && glider.vy === 0;

      wendoo.moveSmoothing = 0;
      applicator.apply(new wendoo.MotionVerdict(glider, 100, 0), STEP_MS);
      const offSetsAtOnce = glider.vx === 100 && glider.vy === 0;
      wendoo.moveSmoothing = smoothingMs;
      applicator.apply(new wendoo.MotionVerdict(glider, 100, 0), STEP_MS);
      const keptWhileOff = glider.vx === 100;
      applicator.apply(new wendoo.MotionVerdict(glider, 200, 0), STEP_MS);
      const easesOnceOn = movesAt(glider, 100 + 100 * share, 0);
      applicator.apply(new wendoo.MotionVerdict(glider, 300, 0), 0);
      const untimedSetsAtOnce = glider.vx === 300;
      wendoo.moveSmoothing = 0;
      applicator.apply(new wendoo.MotionVerdict(glider, 400, -100), STEP_MS);
      readsLive =
        readsLive &&
        offSetsAtOnce &&
        keptWhileOff &&
        easesOnceOn &&
        untimedSetsAtOnce &&
        glider.vx === 400 &&
        glider.vy === -100;

      wendoo.moveSmoothing = smoothingMs;
      const rightward = moveBuffer();
      rightward[MOVE_RIGHT] = PRESENT;
      const marks: number[][] = [];
      for (let i = 0; i < FRAME_SCHEDULES.length; i++) {
        placeAt(glider, 20, 60);
        const ctx = contextOn(glider);
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
          glider.vy === 0;
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
        const ctx = contextIn(new wendoo.SpriteAttachment(glider));
        let farthest = glider.x;
        stepMove(ctx, pursuit, FRAME_SCHEDULES[i], 90, (timeMs: number) => {
          farthest = Math.max(farthest, glider.x);
        });
        keepsGoals =
          keepsGoals && farthest <= 113 + 0.5 && distanceBetween(glider, quarry) < 0.5 && Math.abs(glider.vx) < 1;
      }
      const holdCtx = contextOn(glider);
      holdCtx.dt = STEP_MS;
      const holding = moveBuffer();
      holding[MOVE_TOWARD] = PRESENT;
      holding[MOVE_TARGET_POINT] = pointValue(60, 60);
      placeAt(glider, 60, 60);
      glider.vx = 250;
      moveNow(holdCtx, holding);
      keepsGoals = keepsGoals && glider.vx === 0 && glider.vy === 0;
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

  /** Positive infinity: what a program dividing a number by zero computes. */
  const INFINITE = 1 / 0;

  /** The number that is not a number: what a program dividing zero by zero computes. */
  const NOT_A_NUMBER = 0 / 0;

  /**
   * In a scene of its own, its frames stopped, check that no infinite or
   * not-a-number component reaches a sprite: a `Vector2` holding one reads
   * as no point, so a move toward or away from it moves as a move given no
   * target, and a write of it to a sprite's position moves nothing; and the
   * direct applicator sets a sprite given a verdict holding one still, as it
   * sets a released sprite, and the next verdict eases from the stop.
   */
  function checkNonFiniteMotion(): void {
    game.pushScene();
    stopFrames();
    check(
      "a-vector2-holding-an-infinity-or-a-nan-reads-as-no-point",
      wendoo.vector2Of(pointValue(INFINITE, 20)) === undefined &&
        wendoo.vector2Of(pointValue(20, -INFINITE)) === undefined &&
        wendoo.vector2Of(pointValue(NOT_A_NUMBER, 20)) === undefined &&
        holdsPoint(pointValue(20, 30), 20, 30)
    );

    const mover = solidSprite(8, 40, 60);
    const ctx = contextOn(mover);
    const headed = moveBuffer();
    headed[MOVE_TOWARD] = PRESENT;
    headed[MOVE_TARGET_POINT] = pointValue(INFINITE, 20);
    moveNow(ctx, headed);
    const towardFallsBack = movesAt(mover, 100, 0);
    headed[MOVE_UP] = PRESENT;
    moveNow(ctx, headed);
    const towardBends = movesAt(mover, 0, -100);
    const shunned = moveBuffer();
    shunned[MOVE_AWAY] = PRESENT;
    shunned[MOVE_AWAY_TARGET_POINT] = pointValue(NOT_A_NUMBER, NOT_A_NUMBER);
    moveNow(ctx, shunned);
    check(
      "a-move-toward-or-away-from-a-non-finite-point-moves-as-a-move-given-no-target",
      towardFallsBack && towardBends && movesAt(mover, 100, 0)
    );

    const walker = solidSprite(8, 80, 90);
    const attachment = new wendoo.SpriteAttachment(walker);
    const keptInfinite = writeField(attachment, walker, "position", pointValue(INFINITE, 20));
    const keptNan = writeField(attachment, walker, "position", pointValue(20, NOT_A_NUMBER));
    check(
      "position-write-of-a-non-finite-point-moves-nothing",
      keptInfinite && keptNan && walker.x === 80 && walker.y === 90
    );

    const applicator = new wendoo.DirectMotionApplicator();
    mover.vx = 250;
    applicator.apply(new wendoo.MotionVerdict(mover, NOT_A_NUMBER, 40), STEP_MS);
    const notANumberStops = mover.vx === 0 && mover.vy === 0;
    mover.vx = 250;
    applicator.apply(new wendoo.MotionVerdict(mover, INFINITE, 0), STEP_MS);
    const infinityStops = mover.vx === 0 && mover.vy === 0;
    wendoo.moveSmoothing = SMOOTHING_TIME_CONSTANTS[0];
    mover.vx = 250;
    applicator.apply(new wendoo.MotionVerdict(mover, 0, -INFINITE), STEP_MS);
    const smoothedStops = mover.vx === 0 && mover.vy === 0;
    applicator.apply(new wendoo.MotionVerdict(mover, 100, 0), STEP_MS);
    const easesAfresh = movesAt(mover, 100 * easedShare(STEP_MS, SMOOTHING_TIME_CONSTANTS[0]), 0);
    wendoo.moveSmoothing = 0;
    check(
      "the-direct-applicator-sets-a-non-finite-verdict-still-and-forgets-the-last-velocity",
      notANumberStops && infinityStops && smoothedStops && easesAfresh
    );
    mover.destroy();
    walker.destroy();
    resumeFrames();
    game.popScene();
  }

  /** A speed past the engine's top speed, in pixels per second, that a move's speed argument may carry. */
  const OVER_SPEED = 10000;

  /**
   * In a scene of its own, its frames stopped, check the speeds a move's
   * speed argument may carry that no finite speed of 0 or more names: an
   * infinite speed moves the sprite at the engine's top speed in the
   * direction asked, exactly as a finite speed past it does, on a straight
   * line as on a diagonal; and a not-a-number speed, a negative speed and a
   * negative infinite speed each read as 0, stopping the sprite.
   */
  function checkNonFiniteSpeed(): void {
    game.pushScene();
    stopFrames();
    const racer = solidSprite(8, 80, 60);
    const ctx = contextOn(racer);
    const dash = moveBuffer();
    dash[MOVE_RIGHT] = PRESENT;
    let likeOverSpeed = true;
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1) {
        dash[MOVE_UP] = PRESENT;
      }
      dash[MOVE_SPEED] = wendoo.mkNumber(OVER_SPEED);
      moveNow(ctx, dash);
      const overX = racer.vx;
      const overY = racer.vy;
      dash[MOVE_SPEED] = wendoo.mkNumber(INFINITE);
      moveNow(ctx, dash);
      likeOverSpeed = likeOverSpeed && movesAt(racer, overX, overY);
    }
    check(
      "an-infinite-speed-moves-at-the-top-speed-as-a-speed-past-it-does",
      wendoo.moveSpeed(wendoo.NIL_VALUE, wendoo.NIL_VALUE, wendoo.mkNumber(INFINITE)) === ENGINE_TOP_SPEED &&
        likeOverSpeed &&
        movesAlong(racer, 1, -1, ENGINE_TOP_SPEED)
    );

    const unreadable = [NOT_A_NUMBER, -50, -INFINITE];
    let stops = true;
    for (let i = 0; i < unreadable.length; i++) {
      dash[MOVE_SPEED] = wendoo.mkNumber(100);
      moveNow(ctx, dash);
      const moving = movesAlong(racer, 1, -1, 100);
      dash[MOVE_SPEED] = wendoo.mkNumber(unreadable[i]);
      moveNow(ctx, dash);
      stops =
        stops &&
        moving &&
        wendoo.moveSpeed(wendoo.NIL_VALUE, wendoo.NIL_VALUE, wendoo.mkNumber(unreadable[i])) === 0 &&
        movesAt(racer, 0, 0);
    }
    check("a-not-a-number-or-negative-speed-reads-as-zero-and-stops-the-sprite", stops);
    racer.destroy();
    resumeFrames();
    game.popScene();
  }

  /** The velocity `sprite`, set at rest, reaches when the direct applicator eases it toward 100 pixels per second rightward over one frame of {@link STEP_MS}. */
  function firstEasedStep(sprite: Sprite): number {
    sprite.vx = 0;
    sprite.vy = 0;
    new wendoo.DirectMotionApplicator().apply(new wendoo.MotionVerdict(sprite, 100, 0), STEP_MS);
    return sprite.vx;
  }

  /** Whether `sprite` eases from rest as a sprite smoothed with the time constant `smoothingMs` does, or, at 0, sets its velocity at once. */
  function easesWith(sprite: Sprite, smoothingMs: number): boolean {
    const expected = smoothingMs > 0 ? 100 * easedShare(STEP_MS, smoothingMs) : 100;
    return near(firstEasedStep(sprite), expected, VELOCITY_TOLERANCE);
  }

  /**
   * In a scene of its own, its frames stopped, check the smoothing a sprite
   * is given of its own, at each of {@link SMOOTHING_TIME_CONSTANTS}: a
   * sprite given its own eases with it while every other sprite eases with
   * the project's; its own 0 sets its moves at once while the project's is
   * on; a sprite given none follows the project's as it changes, while one
   * given its own keeps it; and given a negative or non-finite number the
   * sprite follows the project's again, and given no sprite nothing happens.
   */
  function checkSpriteMoveSmoothing(): void {
    game.pushScene();
    stopFrames();
    const light = SMOOTHING_TIME_CONSTANTS[0];
    const heavy = SMOOTHING_TIME_CONSTANTS[1];
    const own = solidSprite(8, 20, 40);
    const plain = solidSprite(8, 20, 80);

    wendoo.moveSmoothing = light;
    wendoo.setMoveSmoothing(own, heavy);
    check(
      "a-sprites-own-smoothing-eases-its-moves-in-place-of-the-projects",
      wendoo.moveSmoothingOf(own) === heavy && easesWith(own, heavy) && easesWith(plain, light)
    );

    wendoo.setMoveSmoothing(own, 0);
    check(
      "a-sprites-own-smoothing-of-0-sets-its-moves-at-once-while-the-projects-is-on",
      wendoo.moveSmoothingOf(own) === 0 && easesWith(own, 0) && easesWith(plain, light)
    );

    wendoo.setMoveSmoothing(own, heavy);
    const whileLight = easesWith(plain, light) && easesWith(own, heavy);
    wendoo.moveSmoothing = 0;
    const whileOff = easesWith(plain, 0) && easesWith(own, heavy);
    wendoo.moveSmoothing = heavy;
    check(
      "a-sprite-without-smoothing-of-its-own-follows-the-projects-as-it-changes-and-one-with-its-own-keeps-it",
      whileLight && whileOff && easesWith(plain, heavy) && easesWith(own, heavy)
    );

    wendoo.moveSmoothing = light;
    const unusable = [-1, NOT_A_NUMBER, INFINITE, -INFINITE];
    let followsAgain = true;
    for (let i = 0; i < unusable.length; i++) {
      wendoo.setMoveSmoothing(own, heavy);
      wendoo.setMoveSmoothing(own, unusable[i]);
      followsAgain = followsAgain && wendoo.moveSmoothingOf(own) === light && easesWith(own, light);
    }
    wendoo.setMoveSmoothing(undefined, heavy);
    wendoo.moveSmoothing = 0;
    check(
      "set-move-smoothing-given-a-negative-or-non-finite-number-follows-the-projects-again-and-given-no-sprite-does-nothing",
      followsAgain && wendoo.moveSmoothingOf(own) === 0
    );
    own.destroy();
    plain.destroy();
    resumeFrames();
    game.popScene();
  }

  /** Whether `value` is the number `n`, exactly. */
  function readsNumber(value: wendoo.Value, n: number): boolean {
    return value.t === wendoo.ValueTag.Number && value.num === n;
  }

  /**
   * In a scene of its own, check the `Sprite` type's `moveSmoothing` field
   * through the type's field hooks, and compiled programs writing it: a read
   * is the time constant the sprite eases with, in seconds -- its own, else
   * the project's -- and 0 while that is off; a write of a number of seconds
   * reads back the same and gives the sprite that smoothing, and a negative
   * number gives it 0, off; a write of an infinity reads back an infinity and
   * holds the sprite at the speed it has, no velocity it sets turning
   * non-finite; a write of not-a-number or of no number changes nothing; a
   * destroyed sprite reads nil and ignores writes. A program setting its own
   * sprite's smoothing eases that sprite while a sprite running a bare move
   * follows the project's; two programs setting different smoothing ease
   * their sprites differently in one scene; a bump rule setting the bumped
   * sprite's smoothing to 0 turns it off for the sprite touched, leaving its
   * own sprite's alone; and smoothing given before a sprite's brain starts
   * holds through the brain changing.
   */
  function checkMoveSmoothingField(): void {
    game.pushScene();
    const heavy = SMOOTHING_TIME_CONSTANTS[1];
    const reader = solidSprite(8, 20, 20);
    const attachment = hostedAttachment(reader);
    const smoothed = solidSprite(8, 40, 20);

    wendoo.moveSmoothing = 100;
    const readsProjects = readsNumber(readField(attachment, smoothed, "moveSmoothing"), 0.1);
    wendoo.setMoveSmoothing(smoothed, heavy);
    const readsOwn = readsNumber(readField(attachment, smoothed, "moveSmoothing"), 0.15);
    wendoo.setMoveSmoothing(smoothed, -1);
    wendoo.moveSmoothing = 0;
    const readsOff = readsNumber(readField(attachment, smoothed, "moveSmoothing"), 0);
    wendoo.moveSmoothing = -50;
    check(
      "move-smoothing-reads-in-seconds-the-smoothing-its-sprite-eases-with",
      readsProjects && readsOwn && readsOff && readsNumber(readField(attachment, smoothed, "moveSmoothing"), 0)
    );

    wendoo.moveSmoothing = 0;
    const wrote = writeField(attachment, smoothed, "moveSmoothing", wendoo.mkNumber(0.15));
    const roundTrips =
      wrote &&
      readsNumber(readField(attachment, smoothed, "moveSmoothing"), 0.15) &&
      wendoo.moveSmoothingOf(smoothed) === heavy &&
      easesWith(smoothed, heavy);
    wendoo.moveSmoothing = 100;
    writeField(attachment, smoothed, "moveSmoothing", wendoo.mkNumber(-2));
    check(
      "move-smoothing-write-round-trips-its-seconds-and-a-negative-number-turns-smoothing-off",
      roundTrips &&
        readsNumber(readField(attachment, smoothed, "moveSmoothing"), 0) &&
        wendoo.moveSmoothingOf(smoothed) === 0 &&
        easesWith(smoothed, 0)
    );

    writeField(attachment, smoothed, "moveSmoothing", wendoo.mkNumber(INFINITE));
    const applicator = new wendoo.DirectMotionApplicator();
    smoothed.vx = 0;
    applicator.apply(new wendoo.MotionVerdict(smoothed, 100, 0), STEP_MS);
    const heldAtRest = smoothed.vx === 0 && smoothed.vy === 0;
    smoothed.vx = 80;
    applicator.apply(new wendoo.MotionVerdict(smoothed, 100, 0), STEP_MS);
    const heldAtSpeed = smoothed.vx === 80 && smoothed.vy === 0;
    applicator.apply(new wendoo.MotionVerdict(smoothed, 40, 0), STEP_MS);
    check(
      "move-smoothing-write-of-an-infinity-holds-its-sprite-at-the-speed-it-has-and-sets-a-slow-down-at-once",
      readsNumber(readField(attachment, smoothed, "moveSmoothing"), INFINITE) &&
        heldAtRest &&
        heldAtSpeed &&
        smoothed.vx === 40 &&
        smoothed.vy === 0
    );
    smoothed.vx = 0;

    wendoo.setMoveSmoothing(smoothed, heavy);
    const unusable = [
      wendoo.mkNumber(NOT_A_NUMBER),
      wendoo.NIL_VALUE,
      wendoo.mkString("fast"),
      brainLiteral(TICKER_ID),
    ];
    let unchanged = true;
    for (let i = 0; i < unusable.length; i++) {
      unchanged =
        writeField(attachment, smoothed, "moveSmoothing", unusable[i]) &&
        unchanged &&
        wendoo.moveSmoothingOf(smoothed) === heavy;
    }
    check("move-smoothing-write-of-not-a-number-or-of-no-number-changes-nothing", unchanged);

    const doomed = solidSprite(8, 60, 20);
    wendoo.setMoveSmoothing(doomed, heavy);
    doomed.destroy();
    check(
      "move-smoothing-on-a-destroyed-sprite-reads-nil-and-ignores-writes",
      readsNothing(readField(attachment, doomed, "moveSmoothing")) &&
        writeField(attachment, doomed, "moveSmoothing", wendoo.mkNumber(0)) &&
        wendoo.moveSmoothingOf(doomed) === heavy
    );
    smoothed.destroy();
    wendoo.moveSmoothing = 0;
    pause(FRAMES_MS);

    const glider = solidSprite(8, 20, 50);
    const skimmer = solidSprite(8, 20, 80);
    const climber = solidSprite(8, 20, 110);
    wendoo.runBrain(glider, wendooBrains.p_glideSmoothing15);
    wendoo.runBrain(skimmer, wendooBrains.p_skimSmoothing005);
    wendoo.runBrain(climber, wendooBrains.p_climbMoveUp00001);
    pause(FRAMES_MS);
    check(
      "a-brain-setting-its-own-sprites-move-smoothing-eases-that-sprite-while-others-follow-the-projects",
      wendoo.moveSmoothingOf(glider) === heavy &&
        glider.vx > 0 &&
        glider.vx < 99 &&
        wendoo.moveSmoothingOf(climber) === 0 &&
        movesAt(climber, 0, -100)
    );
    check(
      "two-brains-setting-different-move-smoothing-ease-their-sprites-differently-in-one-scene",
      wendoo.moveSmoothingOf(skimmer) === 50 && skimmer.vx > glider.vx && skimmer.vx < 100
    );
    glider.destroy();
    skimmer.destroy();
    climber.destroy();
    pause(FRAMES_MS);

    const calmer = solidSprite(8, 40, 60);
    const touched = solidSprite(8, 46, 60);
    wendoo.setMoveSmoothing(touched, heavy);
    wendoo.runBrain(calmer, wendooBrains.p_calmBumpedSmooth);
    pause(FRAMES_MS);
    check(
      "a-move-smoothing-assignment-through-the-bumped-sprite-output-gives-the-sprite-it-touches-that-smoothing",
      wendoo.moveSmoothingOf(touched) === 0 &&
        readsNumber(readField(attachment, touched, "moveSmoothing"), 0) &&
        wendoo.moveSmoothingOf(calmer) === wendoo.moveSmoothing &&
        programOf(calmer) === "calmBumpedSmooth"
    );
    calmer.destroy();
    touched.destroy();
    pause(FRAMES_MS);

    const keeper = solidSprite(8, 20, 60);
    wendoo.setMoveSmoothing(keeper, heavy);
    wendoo.runBrain(keeper, wendooBrains.p_climbMoveUp00001);
    pause(FRAMES_MS);
    const easedFromTheStart = keeper.vy < 0 && keeper.vy > -99;
    wendoo.runBrain(keeper, wendooBrains.none);
    pause(FRAMES_MS);
    wendoo.runBrain(keeper, wendooBrains.p_climbMoveUp00001);
    pause(FRAMES_MS);
    check(
      "a-sprites-own-move-smoothing-holds-from-before-its-brain-starts-and-through-a-brain-change",
      easedFromTheStart &&
        programOf(keeper) === "climbMoveUp00001" &&
        wendoo.moveSmoothingOf(keeper) === heavy &&
        readsNumber(readField(attachment, keeper, "moveSmoothing"), 0.15) &&
        keeper.vy > -99
    );
    keeper.destroy();
    reader.destroy();
    pause(FRAMES_MS);
    game.popScene();
  }

  /** Document id of the program moving its sprite right. */
  const ADVANCE_ID = "advanceMoveRight";

  /** Document id of the program whose move, its WHEN reading a number, moves its sprite in the default direction: right. */
  const COUNTED_ID = "countedWhenMove1";

  /** How many frames of {@link STEP_MS} the brain-change easing checks let a smoothed sprite ease before its brain changes. */
  const CRUISE_FRAMES = 30;

  /**
   * The velocity, in pixels per second, a sprite smoothed with the time
   * constant `smoothingMs` reaches after `frames` frames of {@link STEP_MS}
   * eased without a break from rest toward 100 pixels per second.
   */
  function easedFromRest(frames: number, smoothingMs: number): number {
    return 100 * easedShare(frames * STEP_MS, smoothingMs);
  }

  /**
   * Run frame `frame` of the current scene, its frames stopped, the way its
   * frame loop runs one of {@link STEP_MS}: drain its program host at the
   * frame's time, then resolve its move arbitration.
   */
  function stepFrame(frame: number): void {
    wendoo.sceneProgramHost(game.currentScene()).drain(frame * STEP_MS);
    wendoo.sceneMotionArbiter(game.currentScene()).resolve(STEP_MS);
  }

  /**
   * In a scene of its own, its frames stopped and stepped by hand, check
   * that a smoothed sprite eases from the velocity it has whichever brain
   * moves it: cruising under one brain and given another moving it alike --
   * by the block, then through its `brain` field -- it moves on each frame
   * at the velocity its ease would have reached had its brain not changed,
   * while a sprite given its first brain on the same frame eases from rest;
   * given no brain, it stops on the next frame, as a released sprite does,
   * and a brain given after that eases from rest; and given no brain and a
   * new brain on one frame, it eases on from the velocity it has.
   */
  function checkEasingAcrossBrainChanges(): void {
    game.pushScene();
    stopFrames();
    const heavy = SMOOTHING_TIME_CONSTANTS[1];
    const attachment = hostedAttachment(solidSprite(8, 20, 20));
    const cruiser = solidSprite(8, 20, 60);
    const starter = solidSprite(8, 20, 100);
    wendoo.setMoveSmoothing(cruiser, heavy);
    wendoo.setMoveSmoothing(starter, heavy);
    let frame = 0;

    wendoo.runBrain(cruiser, wendooBrains.p_advanceMoveRight);
    while (frame < CRUISE_FRAMES) {
      stepFrame(++frame);
    }
    const cruising = movesAt(cruiser, easedFromRest(CRUISE_FRAMES, heavy), 0);
    wendoo.runBrain(cruiser, wendooBrains.p_countedWhenMove1);
    wendoo.runBrain(starter, wendooBrains.p_countedWhenMove1);
    stepFrame(++frame);
    const byBlock =
      programOf(cruiser) === COUNTED_ID &&
      movesAt(cruiser, easedFromRest(CRUISE_FRAMES + 1, heavy), 0) &&
      movesAt(starter, easedFromRest(1, heavy), 0);
    writeField(attachment, cruiser, "brain", brainLiteral(ADVANCE_ID));
    stepFrame(++frame);
    check(
      "a-smoothed-sprite-eases-on-from-the-velocity-it-has-through-a-brain-change",
      cruising &&
        byBlock &&
        programOf(cruiser) === ADVANCE_ID &&
        movesAt(cruiser, easedFromRest(CRUISE_FRAMES + 2, heavy), 0) &&
        movesAt(starter, easedFromRest(2, heavy), 0)
    );

    wendoo.runBrain(cruiser, wendooBrains.none);
    stepFrame(++frame);
    const released = programOf(cruiser) === wendooBrains.none.id && movesAt(cruiser, 0, 0);
    wendoo.runBrain(cruiser, wendooBrains.p_advanceMoveRight);
    stepFrame(++frame);
    check(
      "a-smoothed-sprite-given-no-brain-stops-and-eases-its-next-brain-from-rest",
      released && movesAt(cruiser, easedFromRest(1, heavy), 0)
    );

    for (let i = 1; i < CRUISE_FRAMES; i++) {
      stepFrame(++frame);
    }
    const recruising = movesAt(cruiser, easedFromRest(CRUISE_FRAMES, heavy), 0);
    writeField(attachment, cruiser, "brain", wendoo.NIL_VALUE);
    writeField(attachment, cruiser, "brain", brainLiteral(COUNTED_ID));
    stepFrame(++frame);
    check(
      "a-smoothed-sprite-given-no-brain-and-a-new-one-on-one-frame-eases-on-from-the-velocity-it-has",
      recruising && programOf(cruiser) === COUNTED_ID && movesAt(cruiser, easedFromRest(CRUISE_FRAMES + 1, heavy), 0)
    );

    cruiser.destroy();
    starter.destroy();
    attachment.sprite.destroy();
    resumeFrames();
    game.popScene();
  }

  /** Width, in tiles of 16 pixels, of the tilemap the wall-stop check builds. */
  const WALLED_MAP_COLUMNS = 10;

  /** Height, in tiles of 16 pixels, of the tilemap the wall-stop check builds. */
  const WALLED_MAP_ROWS = 8;

  /** The tilemap column, its left edge at x 80, the wall-stop check walls off and opens again. */
  const WALL_COLUMN = 5;

  /** Wall `column` of the current scene's tilemap off, every row of it, or open it again. */
  function wallColumn(column: number, on: boolean): void {
    for (let row = 0; row < WALLED_MAP_ROWS; row++) {
      game.currentScene().tileMap.setWallAt(column, row, on);
    }
  }

  /**
   * Run frame `frame` of the current scene, its frames stopped, the way its
   * frame loop runs one of {@link STEP_MS}, physics included: the scene's
   * physics moves its sprites over the frame, then its program host drains
   * at the frame's time and its move arbitration resolves.
   */
  function stepFrameMoving(frame: number): void {
    game.currentScene().physicsEngine.move(STEP_MS / 1000);
    stepFrame(frame);
  }

  /** A smoothing time constant, in milliseconds, so long that a slow move's ease over one frame falls below the 1/256 step of a sprite's velocity well before the move closes on its speed. */
  const GLACIAL_SMOOTHING_MS = 3000;

  /** The speed, in pixels per second, of the slow move the glacial smoothing check eases. */
  const DRIFT_SPEED = 10;

  /** How many frames of {@link STEP_MS} the glacial smoothing check eases for: five of its time constants. */
  const DRIFT_FRAMES = (5 * GLACIAL_SMOOTHING_MS) / STEP_MS;

  /**
   * In a scene of its own, its frames stopped and stepped by hand, check
   * that a smoothed sprite eases from the velocity it actually has: given
   * its first brain while moving at a velocity game code set, it eases on
   * from that velocity, and set at once to a slower one its brain asks for;
   * cruising under a brain into a tilemap wall, which stops it, it eases
   * back up from the stop, frame on frame, once the way opens; and a slow
   * move eased with smoothing so long that its later frames' eases are finer
   * than the step a sprite's velocity takes still closes on its speed.
   */
  function checkEasingFromActualVelocity(): void {
    game.pushScene();
    stopFrames();
    const heavy = SMOOTHING_TIME_CONSTANTS[1];
    const share = easedShare(STEP_MS, heavy);
    const coaster = solidSprite(8, 20, 20);
    const racer = solidSprite(8, 20, 40);
    const cruiser = solidSprite(8, 20, 72);
    wendoo.setMoveSmoothing(coaster, heavy);
    wendoo.setMoveSmoothing(racer, heavy);
    wendoo.setMoveSmoothing(cruiser, heavy);
    const layout = control.createBuffer(4 + WALLED_MAP_COLUMNS * WALLED_MAP_ROWS);
    layout.setNumber(NumberFormat.UInt16LE, 0, WALLED_MAP_COLUMNS);
    layout.setNumber(NumberFormat.UInt16LE, 2, WALLED_MAP_ROWS);
    tiles.setCurrentTilemap(
      tiles.createTilemap(
        layout,
        image.create(WALLED_MAP_COLUMNS, WALLED_MAP_ROWS),
        [image.create(16, 16)],
        TileScale.Sixteen
      )
    );
    let frame = 0;

    coaster.vx = 80;
    racer.vx = 160;
    wendoo.runBrain(coaster, wendooBrains.p_advanceMoveRight);
    wendoo.runBrain(racer, wendooBrains.p_advanceMoveRight);
    stepFrame(++frame);
    check(
      "a-smoothed-sprite-given-its-first-brain-eases-on-from-the-velocity-game-code-set",
      programOf(coaster) === ADVANCE_ID && movesAt(coaster, 80 + 20 * share, 0) && movesAt(racer, 100, 0)
    );

    wendoo.runBrain(cruiser, wendooBrains.p_advanceMoveRight);
    for (let i = 0; i < CRUISE_FRAMES; i++) {
      stepFrame(++frame);
    }
    const cruising = movesAt(cruiser, easedFromRest(CRUISE_FRAMES, heavy), 0);
    wallColumn(WALL_COLUMN, true);
    cruiser.setPosition(74, 72);
    stepFrameMoving(++frame);
    const easesFromTheStop = cruiser.right <= 80 && movesAt(cruiser, easedFromRest(1, heavy), 0);
    wallColumn(WALL_COLUMN, false);
    stepFrameMoving(++frame);
    check(
      "a-smoothed-sprite-a-wall-stops-eases-back-up-from-the-stop",
      cruising && easesFromTheStop && movesAt(cruiser, easedFromRest(2, heavy), 0)
    );

    const drifter = solidSprite(8, 20, 100);
    wendoo.setMoveSmoothing(drifter, GLACIAL_SMOOTHING_MS);
    const applicator = new wendoo.DirectMotionApplicator();
    for (let i = 0; i < DRIFT_FRAMES; i++) {
      applicator.apply(new wendoo.MotionVerdict(drifter, DRIFT_SPEED, 0), STEP_MS);
    }
    check(
      "a-slow-move-smoothed-finer-than-a-velocity-step-still-closes-on-its-speed",
      movesAt(drifter, DRIFT_SPEED * easedShare(DRIFT_FRAMES * STEP_MS, GLACIAL_SMOOTHING_MS), 0)
    );

    coaster.destroy();
    racer.destroy();
    cruiser.destroy();
    drifter.destroy();
    resumeFrames();
    game.popScene();
  }

  /**
   * The body of the overload the arcade base pack adds to the core operator
   * `operatorId` over operands of the types `operands`, in operand order,
   * bound under the id the project's ids module allocates its name;
   * `undefined` when none is bound.
   */
  function overloadBody(operatorId: string, operands: string[]): wendoo.HostFunction {
    const name = wendoo.operatorOverloadName(operatorId, operands);
    return wendoo.hostRegistries().functions.getById(wendoo.projectIds().operatorId(name));
  }

  /**
   * Whether the overload the arcade base pack adds to the core operator
   * `operatorId` over two operands of the type `type` answers `expected`
   * given `lhs` and `rhs`, called on `sprite`'s behalf.
   */
  function compares(
    operatorId: string,
    type: string,
    sprite: Sprite,
    lhs: wendoo.Value,
    rhs: wendoo.Value,
    expected: boolean
  ): boolean {
    const body = overloadBody(operatorId, [type, type]);
    if (!body) {
      return false;
    }
    const result = body.exec(contextOn(sprite), [lhs, rhs]);
    return result.t === wendoo.ValueTag.Boolean && result.b === expected;
  }

  /** Whether the equality overload over `type` answers `same` and the inequality overload its opposite, given `lhs` and `rhs`. */
  function comparesBoth(type: string, sprite: Sprite, lhs: wendoo.Value, rhs: wendoo.Value, same: boolean): boolean {
    return (
      compares(wendoo.OPERATOR_EQUAL_TO, type, sprite, lhs, rhs, same) &&
      compares(wendoo.OPERATOR_NOT_EQUAL_TO, type, sprite, lhs, rhs, !same)
    );
  }

  /**
   * In a scene of its own, check the overloads the arcade base pack adds to
   * the core equality and inequality operators: each is bound under the id
   * the project's ids module allocates its name; two images are equal when
   * they have the same pixels, an image a sprite wears or one an asset names,
   * and an image standing for no image equals nothing; two sprites when they
   * are one sprite, not destroyed; two brains when they name one document id,
   * whether or not a compiled brain holds it; inequality answers the
   * opposite. Then check compiled programs placing the core `=` and `!=`
   * tiles on those values: an image comparison fires while its sprite wears
   * a look-alike of the image asset and an inequality while it wears another;
   * a sprite comparison fires while the sprite in range is the bumped sprite;
   * and a brain comparison through the brain accessor fires while the bumped
   * sprite runs its own sprite's brain.
   */
  function checkEqualityOperators(): void {
    game.pushScene();
    const types = [IMAGE_TYPE, "Sprite", BRAIN_TYPE];
    let bound = true;
    for (let i = 0; i < types.length; i++) {
      const operands = [types[i], types[i]];
      if (!overloadBody(wendoo.OPERATOR_EQUAL_TO, operands) || !overloadBody(wendoo.OPERATOR_NOT_EQUAL_TO, operands)) {
        bound = false;
      }
    }
    check("equality-overloads-take-their-ids-from-the-manifest", bound);

    const nil = wendoo.NIL_VALUE;
    const hero = heroSprite(30, 30);
    const twin = heroSprite(60, 30);
    const plain = solidSprite(8, 90, 30);
    const attachment = hostedAttachment(plain);
    const worn = (sprite: Sprite) => readField(attachment, sprite, "image");
    check(
      "image-equality-reads-pixels-whether-a-sprite-wears-the-image-or-an-asset-names-it",
      comparesBoth(IMAGE_TYPE, plain, worn(hero), imageLiteral(HERO_ASSET_ID), true) &&
        comparesBoth(IMAGE_TYPE, plain, imageLiteral(HERO_ASSET_ID), imageLiteral(HERO_DISPLAY_NAME), true) &&
        comparesBoth(IMAGE_TYPE, plain, worn(hero), worn(twin), true) &&
        comparesBoth(IMAGE_TYPE, plain, worn(hero), worn(plain), false) &&
        comparesBoth(IMAGE_TYPE, plain, imageLiteral(HERO_ASSET_ID), worn(plain), false)
    );
    check(
      "an-image-standing-for-no-image-equals-nothing-not-even-another",
      comparesBoth(IMAGE_TYPE, plain, imageLiteral(DELETED_ASSET_ID), imageLiteral(DELETED_ASSET_ID), false) &&
        comparesBoth(IMAGE_TYPE, plain, imageLiteral(DELETED_ASSET_ID), worn(hero), false) &&
        comparesBoth(IMAGE_TYPE, plain, nil, nil, false) &&
        comparesBoth(IMAGE_TYPE, plain, worn(hero), nil, false)
    );

    const doomed = solidSprite(8, 120, 30);
    const doomedValue = wendoo.spriteValue(doomed);
    const liveSame = comparesBoth("Sprite", plain, wendoo.spriteValue(hero), wendoo.spriteValue(hero), true);
    const liveOther = comparesBoth("Sprite", plain, wendoo.spriteValue(hero), wendoo.spriteValue(twin), false);
    doomed.destroy();
    check(
      "sprite-equality-is-identity-and-a-destroyed-or-missing-sprite-equals-nothing",
      liveSame &&
        liveOther &&
        comparesBoth("Sprite", plain, doomedValue, doomedValue, false) &&
        comparesBoth("Sprite", plain, nil, nil, false) &&
        comparesBoth("Sprite", plain, wendoo.spriteValue(hero), nil, false)
    );
    check(
      "brain-equality-compares-document-ids-whether-or-not-a-brain-holds-them",
      comparesBoth(BRAIN_TYPE, plain, brainLiteral(TICKER_ID), brainLiteral(TICKER_ID), true) &&
        comparesBoth(BRAIN_TYPE, plain, brainLiteral(UNKNOWN_BRAIN_ID), brainLiteral(UNKNOWN_BRAIN_ID), true) &&
        comparesBoth(BRAIN_TYPE, plain, brainLiteral(TICKER_ID), brainLiteral(TWIN_IDS[0]), false) &&
        comparesBoth(BRAIN_TYPE, plain, nil, nil, false) &&
        comparesBoth(BRAIN_TYPE, plain, brainLiteral(TICKER_ID), nil, false)
    );
    hero.destroy();
    twin.destroy();
    plain.destroy();
    pause(FRAMES_MS);

    const lookAlike = heroSprite(30, 60);
    const unlike = solidSprite(8, 90, 60);
    const lookAlikeUnlike = heroSprite(30, 100);
    const unlikeUnlike = solidSprite(8, 90, 100);
    wendoo.runBrain(lookAlike, wendooBrains.p_mirrorImageEq001);
    wendoo.runBrain(unlike, wendooBrains.p_mirrorImageEq001);
    wendoo.runBrain(lookAlikeUnlike, wendooBrains.p_unlikeImageNe001);
    wendoo.runBrain(unlikeUnlike, wendooBrains.p_unlikeImageNe001);
    pause(FRAMES_MS);
    check(
      "an-image-comparison-rule-fires-while-its-sprite-wears-a-look-alike-of-the-asset",
      movesAt(lookAlike, 100, 0) && movesAt(unlike, 0, 0)
    );
    check(
      "an-image-inequality-rule-fires-while-its-sprite-wears-another-image",
      movesAt(lookAlikeUnlike, 0, 0) && movesAt(unlikeUnlike, 100, 0)
    );
    lookAlike.destroy();
    unlike.destroy();
    lookAlikeUnlike.destroy();
    unlikeUnlike.destroy();
    pause(FRAMES_MS);

    const loyal = solidSprite(8, 40, 60);
    solidSprite(8, 46, 60);
    wendoo.runBrain(loyal, wendooBrains.p_loyalSpriteEq001);
    pause(FRAMES_MS);
    const firesOnOne = movesAt(loyal, 100, 0);
    clearScene();
    const torn = solidSprite(8, 40, 100);
    solidSprite(8, 46, 100);
    solidSprite(2, 40, 95);
    wendoo.runBrain(torn, wendooBrains.p_loyalSpriteEq001);
    pause(FRAMES_MS);
    check(
      "a-sprite-comparison-rule-fires-while-the-sprite-in-range-is-the-bumped-sprite",
      firesOnOne && movesAt(torn, 0, 0)
    );
    clearScene();

    const kindred = solidSprite(8, 40, 60);
    const kin = solidSprite(8, 46, 60);
    wendoo.runBrain(kindred, wendooBrains.p_kindredBrainEq01);
    wendoo.runBrain(kin, wendooBrains.p_kindredBrainEq01);
    pause(FRAMES_MS);
    const firesOnKin = movesAt(kindred, 100, 0) && movesAt(kin, 100, 0);
    clearScene();
    const stranger = solidSprite(8, 40, 100);
    const ticking = solidSprite(8, 46, 100);
    wendoo.runBrain(stranger, wendooBrains.p_kindredBrainEq01);
    wendoo.runBrain(ticking, wendooBrains.p_akBQz0nySKaYx37w);
    const loner = solidSprite(8, 120, 100);
    solidSprite(8, 126, 100);
    wendoo.runBrain(loner, wendooBrains.p_kindredBrainEq01);
    pause(FRAMES_MS);
    check(
      "a-brain-comparison-rule-fires-while-the-bumped-sprite-runs-its-own-sprites-brain",
      firesOnKin && movesAt(stranger, 0, 0) && movesAt(loner, 0, 0)
    );
    game.popScene();
  }

  /** Wendoo type name of the arcade base pack's point type. */
  const VECTOR2_TYPE = "Vector2";

  /** Wendoo type name of a number. */
  const NUMBER_TYPE = "number";

  /** The operand types of the overloads over two points. */
  const TWO_POINTS = [VECTOR2_TYPE, VECTOR2_TYPE];

  /** The operand types of the overload over a point and a number on its right. */
  const POINT_AND_NUMBER = [VECTOR2_TYPE, NUMBER_TYPE];

  /**
   * What the overload the arcade base pack adds to the core operator
   * `operatorId` over operands of the types `operands` evaluates to given
   * `lhs` and `rhs`, called on `sprite`'s behalf; nil when none is bound.
   */
  function computes(
    operatorId: string,
    operands: string[],
    sprite: Sprite,
    lhs: wendoo.Value,
    rhs: wendoo.Value
  ): wendoo.Value {
    const body = overloadBody(operatorId, operands);
    return body ? body.exec(contextOn(sprite), [lhs, rhs]) : wendoo.NIL_VALUE;
  }

  /** The number the `Vector2` value `value` holds in its field `field`, read as stored, or `undefined` when it holds none. */
  function pointComponent(value: wendoo.Value, field: string): number {
    if (value.t !== wendoo.ValueTag.Struct || value.typeId !== wendoo.structTypeId(VECTOR2_TYPE)) {
      return undefined;
    }
    const component = value.fields[wendoo.projectIds().fieldId(VECTOR2_TYPE, field)];
    return component && component.t === wendoo.ValueTag.Number ? component.num : undefined;
  }

  /**
   * In a scene of its own, check the overloads the arcade base pack adds to
   * the core operators over `Vector2`s: each is bound under the id the
   * project's ids module allocates its name, and multiplication takes no
   * number on its left and division no point at all; two points are equal
   * when both components are, and a value holding no point -- nil, or a
   * `Vector2` holding an infinity or a not-a-number -- equals nothing;
   * addition and subtraction work component by component and multiplication
   * scales both components by the number on its right, each into a fresh
   * value, leaving the operands as they were; arithmetic over no point or no
   * number is nil; and arithmetic that overflows holds an infinity, which
   * reads as no point to the pack, so equality over it answers false and a
   * position write of it leaves the sprite where it is. Then check compiled programs placing the core `+`, `-` and `=` tiles
   * on positions: a shove rule pushes the bumped sprite away by the distance
   * between their centers, and a position comparison fires while its sprite
   * shares the bumped sprite's center.
   */
  function checkVector2Operators(): void {
    game.pushScene();
    check(
      "vector2-operator-overloads-take-their-ids-from-the-manifest",
      !!overloadBody(wendoo.OPERATOR_EQUAL_TO, TWO_POINTS) &&
        !!overloadBody(wendoo.OPERATOR_NOT_EQUAL_TO, TWO_POINTS) &&
        !!overloadBody(wendoo.OPERATOR_ADD, TWO_POINTS) &&
        !!overloadBody(wendoo.OPERATOR_SUBTRACT, TWO_POINTS) &&
        !!overloadBody(wendoo.OPERATOR_MULTIPLY, POINT_AND_NUMBER)
    );
    check(
      "multiplication-takes-no-number-before-a-point-nor-two-points-and-division-no-point",
      !overloadBody(wendoo.OPERATOR_MULTIPLY, [NUMBER_TYPE, VECTOR2_TYPE]) &&
        !overloadBody(wendoo.OPERATOR_MULTIPLY, TWO_POINTS) &&
        !overloadBody(wendoo.OPERATOR_DIVIDE, POINT_AND_NUMBER)
    );

    const nil = wendoo.NIL_VALUE;
    const plain = solidSprite(8, 90, 30);
    const attachment = hostedAttachment(plain);
    const here = solidSprite(8, 30, 30);
    const alsoHere = solidSprite(8, 30, 30);
    const there = solidSprite(8, 30, 31);
    const at = (sprite: Sprite) => readField(attachment, sprite, "position");
    check(
      "vector2-equality-holds-exactly-when-both-components-are-equal",
      comparesBoth(VECTOR2_TYPE, plain, pointValue(20, 30), pointValue(20, 30), true) &&
        comparesBoth(VECTOR2_TYPE, plain, pointValue(20, 30), pointValue(20, 31), false) &&
        comparesBoth(VECTOR2_TYPE, plain, pointValue(20, 30), pointValue(21, 30), false) &&
        comparesBoth(VECTOR2_TYPE, plain, at(here), at(alsoHere), true) &&
        comparesBoth(VECTOR2_TYPE, plain, at(here), at(there), false)
    );
    const infinite = pointValue(INFINITE, 20);
    const notANumber = pointValue(NOT_A_NUMBER, 20);
    check(
      "a-value-holding-no-point-equals-nothing-not-even-itself",
      comparesBoth(VECTOR2_TYPE, plain, nil, nil, false) &&
        comparesBoth(VECTOR2_TYPE, plain, pointValue(20, 30), nil, false) &&
        comparesBoth(VECTOR2_TYPE, plain, infinite, infinite, false) &&
        comparesBoth(VECTOR2_TYPE, plain, notANumber, notANumber, false)
    );

    const left = pointValue(1.5, -2);
    const right = pointValue(3, 4.25);
    const sum = computes(wendoo.OPERATOR_ADD, TWO_POINTS, plain, left, right);
    const difference = computes(wendoo.OPERATOR_SUBTRACT, TWO_POINTS, plain, left, right);
    check(
      "vector2-sum-and-difference-work-component-by-component-into-fresh-values",
      holdsPoint(sum, 4.5, 2.25) &&
        holdsPoint(difference, -1.5, -6.25) &&
        sum !== left &&
        sum !== right &&
        difference !== left &&
        holdsPoint(left, 1.5, -2) &&
        holdsPoint(right, 3, 4.25)
    );
    const scaled = pointValue(3, -4);
    const product = computes(wendoo.OPERATOR_MULTIPLY, POINT_AND_NUMBER, plain, scaled, wendoo.mkNumber(2.5));
    check(
      "vector2-product-scales-both-components-by-the-number-on-its-right-into-a-fresh-value",
      holdsPoint(product, 7.5, -10) &&
        holdsPoint(computes(wendoo.OPERATOR_MULTIPLY, POINT_AND_NUMBER, plain, scaled, wendoo.mkNumber(-1)), -3, 4) &&
        product !== scaled &&
        holdsPoint(scaled, 3, -4)
    );
    check(
      "vector2-arithmetic-over-no-point-or-no-number-is-nil",
      readsNothing(computes(wendoo.OPERATOR_ADD, TWO_POINTS, plain, nil, right)) &&
        readsNothing(computes(wendoo.OPERATOR_SUBTRACT, TWO_POINTS, plain, left, infinite)) &&
        readsNothing(computes(wendoo.OPERATOR_MULTIPLY, POINT_AND_NUMBER, plain, notANumber, wendoo.mkNumber(2))) &&
        readsNothing(computes(wendoo.OPERATOR_MULTIPLY, POINT_AND_NUMBER, plain, scaled, nil))
    );

    const huge = pointValue(1e308, 1);
    const overflowed = computes(wendoo.OPERATOR_MULTIPLY, POINT_AND_NUMBER, plain, huge, wendoo.mkNumber(10));
    const walker = solidSprite(8, 80, 90);
    const kept = writeField(hostedAttachment(walker), walker, "position", overflowed);
    check(
      "overflowing-vector2-arithmetic-holds-an-infinity-that-reads-as-no-point",
      pointComponent(overflowed, "x") === INFINITE &&
        pointComponent(overflowed, "y") === 10 &&
        wendoo.vector2Of(overflowed) === undefined &&
        comparesBoth(VECTOR2_TYPE, plain, overflowed, overflowed, false) &&
        readsNothing(computes(wendoo.OPERATOR_ADD, TWO_POINTS, plain, overflowed, left)) &&
        kept &&
        walker.x === 80 &&
        walker.y === 90
    );
    clearScene();

    const shoverRight = solidSprite(8, 40, 60);
    const shovedRight = solidSprite(8, 46, 62);
    const shoverLeft = solidSprite(8, 100, 100);
    const shovedLeft = solidSprite(8, 94, 100);
    wendoo.runBrain(shoverRight, wendooBrains.p_shoveBumpedAway1);
    wendoo.runBrain(shoverLeft, wendooBrains.p_shoveBumpedAway1);
    pause(FRAMES_MS);
    check(
      "a-shove-rule-pushes-the-bumped-sprite-away-by-the-distance-between-their-centers",
      shovedRight.x === 52 &&
        shovedRight.y === 64 &&
        shoverRight.x === 40 &&
        shoverRight.y === 60 &&
        shovedLeft.x === 88 &&
        shovedLeft.y === 100 &&
        shoverLeft.x === 100 &&
        shoverLeft.y === 100
    );
    clearScene();

    const matched = solidSprite(8, 40, 60);
    solidSprite(8, 40, 60);
    const offset = solidSprite(8, 40, 100);
    solidSprite(8, 46, 100);
    wendoo.runBrain(matched, wendooBrains.p_matchPositionEq1);
    wendoo.runBrain(offset, wendooBrains.p_matchPositionEq1);
    pause(FRAMES_MS);
    check(
      "a-position-comparison-rule-fires-while-its-sprite-shares-the-bumped-sprites-center",
      matched.image.equals(heroPicture()) && !offset.image.equals(heroPicture())
    );
    game.popScene();
  }

  /** Milliseconds a move at the default speed takes to close a 60-pixel gap, with frames to spare. */
  const CLOSING_MS = 1000;

  /**
   * In a scene of its own, check compiled programs holding `Vector2` and
   * `Sprite` variables: a position variable remembers the point written to
   * it, so a sprite moved away heads back to where it stood and lands there;
   * two position variables swapped through a third each hold the other's
   * point, the third keeping the first's after the first is overwritten; and
   * a sprite variable reads nil until written, gating its rule off and
   * skipping a write through it, then holds the very sprite written to it --
   * a write through it reaching that sprite, a move toward it following it
   * where it goes -- until that sprite is destroyed, when its fields read nil
   * again and its rule gates off, its program running on. Then a move toward a
   * sprite variable with nothing gating its rule: never written, the variable
   * is nil and gates the move off, so the sprite holds still; written a live
   * sprite, the move pursues it; once that sprite is destroyed, the variable
   * still holds a sprite value, standing for no sprite, which reads as
   * nothing, so it gates the move off and the sprite holds still. And a range
   * pair filtered on a sprite variable never written fires neither rule while
   * another sprite is in range. And a rule whose WHEN is a sprite variable
   * alone fires while the sprite written to it lives, and stops firing for
   * good once that sprite is destroyed.
   */
  function checkVariables(): void {
    game.pushScene();
    const homer = solidSprite(8, 40, 60);
    wendoo.runBrain(homer, wendooBrains.p_rememberHome0001);
    pause(FRAMES_MS);
    const stayed = homer.x === 40 && homer.y === 60 && movesAt(homer, 0, 0);
    homer.setPosition(100, 60);
    pause(FRAMES_MS);
    const headedHome = movesAt(homer, -DEFAULT_MOVE_SPEED, 0);
    pause(CLOSING_MS);
    check(
      "a-position-variable-remembers-the-point-written-to-it-after-its-sprite-moves",
      stayed && headedHome && near(homer.x, 40, 0.5) && near(homer.y, 60, 0.5) && movesAt(homer, 0, 0)
    );
    clearScene();

    const swapper = solidSprite(8, 40, 60);
    wendoo.runBrain(swapper, wendooBrains.p_swapThroughTemp1);
    pause(FRAMES_MS);
    const swapped = movesAlong(swapper, -40, -60, DEFAULT_MOVE_SPEED);
    pause(CLOSING_MS);
    check(
      "position-variables-swapped-through-a-third-each-hold-the-others-point",
      swapped && near(swapper.x, 40, 0.5) && near(swapper.y, 60, 0.5) && movesAt(swapper, 0, 0)
    );
    clearScene();

    const mover = solidSprite(8, 40, 60);
    const target = heroSprite(100, 60);
    wendoo.runBrain(mover, wendooBrains.p_heldTargetBump01);
    pause(FRAMES_MS);
    check(
      "a-sprite-variable-never-written-reads-nil-gating-its-rule-off-and-skipping-writes-through-it",
      movesAt(mover, 0, 0) && mover.x === 40 && !target.image.equals(mover.image)
    );
    target.setPosition(46, 60);
    pause(FRAMES_MS);
    check("a-write-through-a-sprite-variable-reaches-the-sprite-written-to-it", target.image.equals(mover.image));
    target.setPosition(130, 60);
    pause(FRAMES_MS);
    check("a-sprite-variable-reads-its-sprite-where-it-is-now", pursues(mover, target, DEFAULT_MOVE_SPEED));
    target.destroy();
    pause(FRAMES_MS);
    check(
      "a-sprite-variable-whose-sprite-is-destroyed-reads-nil-and-gates-its-rule-off",
      movesAt(mover, 0, 0) && programOf(mover) === "heldTargetBump01"
    );
    clearScene();

    const seeker = solidSprite(8, 40, 60);
    const quarry = solidSprite(8, 100, 60);
    wendoo.runBrain(seeker, wendooBrains.p_towardHeldVar001);
    pause(FRAMES_MS);
    check(
      "a-move-toward-a-sprite-variable-never-written-holds-still",
      movesAt(seeker, 0, 0) && seeker.x === 40 && seeker.y === 60
    );
    quarry.setPosition(46, 60);
    pause(FRAMES_MS);
    quarry.setPosition(130, 60);
    pause(FRAMES_MS);
    check(
      "a-move-toward-a-sprite-variable-written-a-live-sprite-pursues-it",
      pursues(seeker, quarry, DEFAULT_MOVE_SPEED)
    );
    quarry.destroy();
    pause(FRAMES_MS);
    check(
      "a-move-toward-a-sprite-variable-whose-sprite-is-destroyed-holds-still",
      movesAt(seeker, 0, 0) && programOf(seeker) === "towardHeldVar001"
    );
    clearScene();

    const sifter = solidSprite(8, 40, 60);
    solidSprite(8, 70, 60);
    wendoo.runBrain(sifter, wendooBrains.p_filterUnsetVar01);
    pause(FRAMES_MS);
    check(
      "a-range-pair-filtered-on-a-sprite-variable-never-written-fires-neither-rule",
      movesAt(sifter, 0, 0) && sifter.x === 40 && sifter.y === 60
    );
    clearScene();

    const keeper = solidSprite(8, 40, 60);
    const kept = solidSprite(8, 100, 60);
    wendoo.runBrain(keeper, wendooBrains.p_heldWhenGate0001);
    pause(FRAMES_MS);
    const idleUntilWritten = movesAt(keeper, 0, 0) && keeper.x === 40;
    kept.setPosition(46, 60);
    pause(FRAMES_MS);
    kept.setPosition(130, 60);
    pause(FRAMES_MS);
    check(
      "a-rule-whose-when-is-a-sprite-variable-fires-while-its-sprite-lives",
      idleUntilWritten && movesAt(keeper, DEFAULT_MOVE_SPEED, 0)
    );
    kept.destroy();
    pause(FRAMES_MS);
    const stoppedAt = keeper.x;
    pause(FRAMES_MS);
    check(
      "a-rule-whose-when-is-a-sprite-variable-stops-for-good-once-its-sprite-is-destroyed",
      movesAt(keeper, 0, 0) && keeper.x === stoppedAt && programOf(keeper) === "heldWhenGate0001"
    );
    game.popScene();
  }

  /**
   * In a scene of its own, check compiled programs writing one number of a
   * position: a position variable given its sprite's position, then an `x` of
   * 5, holds the changed point for every later rule, so a move toward it
   * heads for it and lands there; a program writing its own sprite's
   * position's `x`, then its `y`, moves the sprite along each axis in turn,
   * the second write keeping the first; a program writing the bumped
   * sprite's position's `y` moves that sprite alone, along that axis alone;
   * a position variable nothing wrote holds `origin` from the program's
   * start, so a rule whose WHEN is that variable fires from the first frame;
   * a move toward the `origin` literal heads for the screen's top-left
   * corner, (0, 0), and lands there; a position variable given `origin`,
   * then an `x` of 80 and a `y` of 30, holds (80, 30), so a move toward it
   * heads there and lands there; a position variable nothing wrote, given an
   * `x` of 5 alone, holds (5, 0), so a move toward it lands there; and two
   * sprites running one program that adds 40 to its position variable's `x`
   * once each start from `origin` alike, the second started after the first
   * has written its own, so both land at (40, 0).
   */
  function checkComponentWrites(): void {
    game.pushScene();
    const walker = solidSprite(8, 40, 60);
    wendoo.runBrain(walker, wendooBrains.p_spotComponentX01);
    pause(FRAMES_MS);
    const headed = movesAt(walker, -DEFAULT_MOVE_SPEED, 0);
    pause(CLOSING_MS);
    check(
      "a-position-variables-x-written-holds-the-changed-point-for-every-later-rule",
      headed && near(walker.x, 5, 0.5) && near(walker.y, 60, 0.5) && movesAt(walker, 0, 0)
    );
    clearScene();

    const shifter = solidSprite(8, 40, 60);
    wendoo.runBrain(shifter, wendooBrains.p_shiftMyselfXY001);
    pause(FRAMES_MS);
    check(
      "writes-of-its-own-sprites-position-x-then-y-move-the-sprite-along-each-axis",
      shifter.x === 100 && shifter.y === 30 && movesAt(shifter, 0, 0)
    );
    clearScene();

    const lifter = solidSprite(8, 40, 60);
    const lifted = solidSprite(8, 46, 62);
    wendoo.runBrain(lifter, wendooBrains.p_liftBumpedY00001);
    pause(FRAMES_MS);
    check(
      "a-write-of-the-bumped-sprites-position-y-moves-that-sprite-alone-along-that-axis",
      lifted.x === 46 && lifted.y === 10 && lifter.x === 40 && lifter.y === 60
    );
    clearScene();

    const newborn = solidSprite(8, 40, 60);
    wendoo.runBrain(newborn, wendooBrains.p_spotBirthWhen001);
    pause(FRAMES_MS);
    check(
      "a-rule-whose-when-is-a-position-variable-nothing-wrote-fires-from-the-start",
      movesAt(newborn, DEFAULT_MOVE_SPEED, 0) && programOf(newborn) === "spotBirthWhen001"
    );
    clearScene();

    const homer = solidSprite(8, 40, 30);
    wendoo.runBrain(homer, wendooBrains.p_originToward0001);
    pause(FRAMES_MS);
    const cornered = movesAt(homer, -80, -60);
    pause(CLOSING_MS);
    check(
      "a-move-toward-origin-heads-for-the-top-left-corner-and-lands-there",
      cornered && near(homer.x, 0, 0.5) && near(homer.y, 0, 0.5) && movesAt(homer, 0, 0)
    );
    clearScene();

    const seeder = solidSprite(8, 40, 60);
    wendoo.runBrain(seeder, wendooBrains.p_originHomeSeed01);
    pause(FRAMES_MS);
    const bound = movesAt(seeder, 80, -60);
    pause(CLOSING_MS);
    check(
      "a-position-variable-given-origin-then-an-x-and-a-y-holds-that-point",
      bound && near(seeder.x, 80, 0.5) && near(seeder.y, 30, 0.5) && movesAt(seeder, 0, 0)
    );
    clearScene();

    const fresh = solidSprite(8, 40, 30);
    wendoo.runBrain(fresh, wendooBrains.p_freshTowardX0001);
    pause(CLOSING_MS);
    check(
      "a-position-variable-nothing-wrote-given-an-x-alone-holds-that-x-at-the-top",
      near(fresh.x, 5, 0.5) && near(fresh.y, 0, 0.5) && movesAt(fresh, 0, 0)
    );
    clearScene();

    const firstStepper = solidSprite(8, 40, 30);
    wendoo.runBrain(firstStepper, wendooBrains.p_freshStepShared1);
    pause(FRAMES_MS);
    const secondStepper = solidSprite(8, 60, 30);
    wendoo.runBrain(secondStepper, wendooBrains.p_freshStepShared1);
    pause(CLOSING_MS);
    check(
      "two-sprites-running-one-program-each-start-its-position-variable-at-origin",
      near(firstStepper.x, 40, 0.5) &&
        near(firstStepper.y, 0, 0.5) &&
        near(secondStepper.x, 40, 0.5) &&
        near(secondStepper.y, 0, 0.5)
    );
    game.popScene();
  }

  /** Destroy every sprite in the current scene, and let the game run until the scene's programs have ended. */
  function clearScene(): void {
    const placed = game.currentScene().allSprites;
    const doomed: Sprite[] = [];
    for (let i = 0; i < placed.length; i++) {
      if (placed[i] instanceof Sprite) {
        doomed.push(placed[i] as Sprite);
      }
    }
    for (let i = 0; i < doomed.length; i++) {
      doomed[i].destroy();
    }
    pause(FRAMES_MS);
  }

  /** Wendoo type name of the `Player` type. */
  const PLAYER_TYPE = "Player";

  /** The type-atom id the arcade selftest's ids module allocates the `Player` type. */
  const PLAYER_ATOM = 1028;

  /** The `Player` value naming the player numbered `player`, as the literal of that player compiles. */
  function playerLiteral(player: number): wendoo.Value {
    const fieldId = wendoo.projectIds().fieldId(PLAYER_TYPE, "number");
    const slots: wendoo.Value[] = [];
    for (let i = 0; i <= fieldId; i++) {
      slots.push(wendoo.NIL_VALUE);
    }
    slots[fieldId] = wendoo.mkNumber(player);
    return wendoo.mkStruct(wendoo.structTypeId(PLAYER_TYPE), slots);
  }

  /** What the `Player` type's field getter reads from the `score` field of `player`, in `ctx`; nil when it reads nothing. */
  function readScore(ctx: wendoo.ExecutionContext, player: wendoo.Value): wendoo.Value {
    const read = wendoo.playerBinding.fieldGetter(player, wendoo.projectIds().fieldId(PLAYER_TYPE, "score"), ctx);
    return read ? read : wendoo.NIL_VALUE;
  }

  /**
   * Whether the `Player` type's field setter accepts writing `value` into the
   * `score` field of `player`, in `ctx`, as the VM dispatches it; a refusal
   * would fault the program.
   */
  function writeScore(ctx: wendoo.ExecutionContext, player: wendoo.Value, value: wendoo.Value): boolean {
    return wendoo.playerBinding.fieldSetter(player, wendoo.projectIds().fieldId(PLAYER_TYPE, "score"), value, ctx);
  }

  /**
   * Whether Arcade's head-up display drew anything in the screen's top-right
   * corner on the last frame: where it shows player one's score, and player
   * two's in its multiplayer display. Nothing else a player check places
   * reaches the corner.
   */
  function hudCornerDrawn(): boolean {
    return screen.getPixel(screen.width - 1, 0) !== 0;
  }

  /**
   * In a scene of its own, check the `Player` type through its field hooks
   * and the add-score tile's body called directly, player one alone: the
   * type takes its atom and fields from the project's ids module; a value
   * names its player by number, and an empty player slot names player one; a
   * read of player one's score is 0 and leaves the corner of the screen
   * empty until a write sets the score, which reads back through Arcade and
   * shows there; a write takes Arcade's whole-number truncation toward zero;
   * a write of no finite number changes nothing and is never refused; a read
   * follows the score game code sets; and add score adds 1 given nothing, a
   * negative number taking points away, and given no finite number changes
   * nothing. Then, the display switched by a third player's score, add
   * score given a player changes that player's score alone.
   */
  function checkPlayerScores(): void {
    game.pushScene();
    const holder = solidSprite(4, 80, 60);
    const ctx = contextOn(holder);
    const nil = wendoo.NIL_VALUE;
    const ids = wendoo.projectIds();
    check(
      "player-type-takes-its-atom-and-fields-from-the-manifest",
      wendoo.playerBinding.atomId === PLAYER_ATOM &&
        wendoo.playerBinding.typeId === wendoo.structTypeId(PLAYER_TYPE) &&
        wendoo.playerBinding.fieldIds.length === 2 &&
        wendoo.playerBinding.fieldIds[0] === ids.fieldId(PLAYER_TYPE, "number") &&
        wendoo.playerBinding.fieldIds[1] === ids.fieldId(PLAYER_TYPE, "score")
    );
    check(
      "a-player-value-names-its-player-and-an-empty-player-slot-names-player-one",
      wendoo.playerNumberOf(playerLiteral(3)) === 3 &&
        wendoo.playerNumberOf(nil) === 0 &&
        wendoo.playerNumberOf(wendoo.mkNumber(2)) === 0 &&
        wendoo.slotPlayerNumber(nil) === 1 &&
        wendoo.slotPlayerNumber(undefined) === 1 &&
        wendoo.slotPlayerNumber(playerLiteral(4)) === 4
    );

    const one = playerLiteral(1);
    const firstRead = readScore(ctx, one);
    pause(FRAMES_MS);
    const silent = !hudCornerDrawn();
    const wrote = writeScore(ctx, one, wendoo.mkNumber(7));
    pause(FRAMES_MS);
    check(
      "a-read-of-player-ones-score-shows-nothing-until-a-write-sets-it-through-arcade",
      readsNumber(firstRead, 0) &&
        silent &&
        wrote &&
        info.score() === 7 &&
        readsNumber(readScore(ctx, one), 7) &&
        hudCornerDrawn()
    );

    writeScore(ctx, one, wendoo.mkNumber(2.5));
    const raised = info.score();
    writeScore(ctx, one, wendoo.mkNumber(-2.5));
    check("a-score-write-takes-arcades-whole-number-truncation", raised === 2 && info.score() === -2);

    info.setScore(4);
    const unusable = [
      wendoo.mkNumber(NOT_A_NUMBER),
      wendoo.mkNumber(INFINITE),
      wendoo.mkNumber(-INFINITE),
      nil,
      wendoo.mkString("ten"),
    ];
    let kept = true;
    for (let i = 0; i < unusable.length; i++) {
      kept = writeScore(ctx, one, unusable[i]) && kept && info.score() === 4;
    }
    check("a-score-write-of-no-finite-number-changes-nothing", kept);

    info.changeScoreBy(8);
    check("a-score-read-follows-the-score-game-code-sets", readsNumber(readScore(ctx, one), 12));

    const addScore = tileBody(wendoo.ADD_SCORE_TILE);
    info.setScore(0);
    act(addScore, holder, [nil, nil]);
    const bare = info.score() === 1;
    act(addScore, holder, [wendoo.mkNumber(-3), nil]);
    check(
      "add-score-adds-one-to-player-one-given-nothing-and-a-negative-number-takes-away",
      bare && info.score() === -2
    );
    act(addScore, holder, [wendoo.mkNumber(INFINITE), nil]);
    act(addScore, holder, [wendoo.mkNumber(NOT_A_NUMBER), one]);
    check("add-score-given-no-finite-number-changes-nothing", info.score() === -2);

    act(addScore, holder, [wendoo.mkNumber(5), playerLiteral(3)]);
    check(
      "add-score-given-a-player-changes-that-players-score-alone",
      info.player3.impl.score() === 5 && info.score() === -2 && info.player2.impl.score() === 0
    );
    game.popScene();
  }

  /**
   * In scenes of their own, check compiled programs adding to and reading
   * scores: a bare add score adds 1 to player one, one given a negative
   * number takes that many away, and one given an amount that reads nothing
   * adds nothing; a program reading player one's score moves once game code
   * sets it past the program's mark; programs given a number and a
   * player, in either order, change that player's score; and a program
   * writing player one's score through its literal sets that score alone.
   * Then, in a fresh scene, a program reading player two's score switches
   * the game to Arcade's multiplayer display, its corner drawn though no
   * score was ever set.
   */
  function checkScorePrograms(): void {
    game.pushScene();
    spriteRunning(wendooBrains.p_scoreBonusBare01);
    pause(FRAMES_MS);
    const afterBonus = info.score() === 1;
    spriteRunning(wendooBrains.p_scorePenalty0001);
    pause(FRAMES_MS);
    const afterPenalty = info.score() === -2;
    spriteRunning(wendooBrains.p_scoreUnsetAmount);
    pause(FRAMES_MS);
    check("a-program-adding-score-adds-one-or-the-number-it-is-given-to-player-one", afterBonus && afterPenalty);
    check("a-program-adding-an-amount-that-reads-nothing-adds-nothing", info.score() === -2);

    const watcher = spriteRunning(wendooBrains.p_scoreWatchOne001);
    pause(FRAMES_MS);
    const still = movesAt(watcher, 0, 0);
    info.setScore(10);
    pause(FRAMES_MS);
    check("a-program-reads-player-ones-score-as-game-code-sets-it", still && movesAt(watcher, 100, 0));

    spriteRunning(wendooBrains.p_scoreAwardTwo001);
    spriteRunning(wendooBrains.p_scoreAwardFlip01);
    pause(FRAMES_MS);
    check(
      "a-program-adding-score-given-a-number-and-a-player-in-either-order-changes-that-players-score",
      info.player2.impl.score() === 5 && info.player3.impl.score() === 2 && info.score() === 10
    );

    spriteRunning(wendooBrains.p_scoreSetLiteral1);
    pause(FRAMES_MS);
    check(
      "a-program-writing-player-ones-score-sets-it-through-arcade",
      info.score() === 3 && info.player2.impl.score() === 5
    );
    game.popScene();

    game.pushScene();
    pause(FRAMES_MS);
    const quiet = !hudCornerDrawn();
    const twoWatcher = spriteRunning(wendooBrains.p_scoreWatchTwo001);
    pause(FRAMES_MS);
    check(
      "a-program-reading-player-twos-score-switches-the-game-to-arcades-multiplayer-display",
      quiet && hudCornerDrawn() && movesAt(twoWatcher, 0, 0) && !info.player1.impl.hasScore()
    );
    game.popScene();
  }

  /**
   * In a scene of its own, check the dpad's player: a program placing the
   * dpad given player two follows player two's controller and not player
   * one's, while a program placing the bare dpad follows player one's and not
   * player two's; and the dpad's body, given the four-slot argument buffer
   * of a program compiled before the dpad took a player, reads player one's
   * dpad as an empty player slot does, and given a player reads that
   * player's.
   */
  function checkPlayerDpad(): void {
    game.pushScene();
    const one = spriteRunning(wendooBrains.p_followDpadMove01);
    const two = spriteRunning(wendooBrains.p_dpadPlayerTwo001);
    controller.player2.right.setPressed(true);
    pause(FRAMES_MS);
    const twoOnly = movesAt(two, 100, 0) && movesAt(one, 0, 0);
    controller.player2.right.setPressed(false);
    controller.right.setPressed(true);
    pause(FRAMES_MS);
    const oneOnly = movesAt(one, 100, 0) && movesAt(two, 0, 0);
    controller.right.setPressed(false);
    check("a-dpad-given-player-two-follows-player-twos-controller-and-a-bare-dpad-player-ones", twoOnly && oneOnly);

    const nil = wendoo.NIL_VALUE;
    const dpad = tileBody(wendoo.DPAD_TILE);
    controller.up.setPressed(true);
    controller.player2.down.setPressed(true);
    const earlier = act(dpad, one, [nil, nil, nil, nil]);
    const empty = act(dpad, one, [nil, nil, nil, nil, nil]);
    const second = act(dpad, one, [nil, nil, nil, nil, playerLiteral(2)]);
    const fourth = act(dpad, one, [nil, nil, nil, nil, playerLiteral(4)]);
    controller.up.setPressed(false);
    controller.player2.down.setPressed(false);
    check(
      "a-dpad-given-the-argument-buffer-of-a-program-compiled-before-its-player-slot-reads-player-one",
      holdsPoint(earlier, 0, -1) && holdsPoint(empty, 0, -1) && holdsPoint(second, 0, 1) && readsNothing(fourth)
    );
    pause(FRAMES_MS);
    game.popScene();
  }

  /**
   * In a scene of its own, check the A and B button sensors through three
   * programs, each moving under the bare A button, the bare B button, or the
   * A button given player two: none moves while no button is held; the bare
   * A and B rules each move rightward while their button is held and stop
   * once it is released; holding one button leaves the other's rule off,
   * and holding both fires both; the A button given player two answers
   * player two's A and not player one's, while the bare A button answers
   * player one's A and not player two's. Then call the bodies directly: the
   * A button's reads `true` while the A button of the player its argument
   * buffer names, else player one's, is held, and nil otherwise, and the B
   * button's reads nil while only A is held.
   */
  function checkButtonSensors(): void {
    game.pushScene();
    const a = spriteRunning(wendooBrains.p_pressButtonA0001);
    const b = spriteRunning(wendooBrains.p_pressButtonB0001);
    const aTwo = spriteRunning(wendooBrains.p_pressAPlayerTwo1);
    pause(FRAMES_MS);
    const untouched = movesAt(a, 0, 0) && movesAt(b, 0, 0) && movesAt(aTwo, 0, 0);

    controller.A.setPressed(true);
    pause(FRAMES_MS);
    const aHeld = movesAt(a, 100, 0);
    const bOffUnderA = movesAt(b, 0, 0);
    const twoOffUnderOnesA = movesAt(aTwo, 0, 0);
    controller.A.setPressed(false);
    pause(FRAMES_MS);
    check(
      "an-a-button-rule-moves-rightward-while-a-is-held-and-stops-on-release",
      untouched && aHeld && movesAt(a, 0, 0)
    );

    controller.B.setPressed(true);
    pause(FRAMES_MS);
    const bHeld = movesAt(b, 100, 0);
    const aOffUnderB = movesAt(a, 0, 0) && movesAt(aTwo, 0, 0);
    controller.B.setPressed(false);
    pause(FRAMES_MS);
    check("a-b-button-rule-moves-rightward-while-b-is-held-and-stops-on-release", bHeld && movesAt(b, 0, 0));
    check("a-held-leaves-the-b-rule-off-and-b-held-leaves-the-a-rule-off", bOffUnderA && aOffUnderB);

    controller.A.setPressed(true);
    controller.B.setPressed(true);
    pause(FRAMES_MS);
    check("a-and-b-held-together-fire-both-rules", movesAt(a, 100, 0) && movesAt(b, 100, 0));
    controller.A.setPressed(false);
    controller.B.setPressed(false);
    pause(FRAMES_MS);

    controller.player2.A.setPressed(true);
    pause(FRAMES_MS);
    check(
      "an-a-button-given-player-two-fires-on-player-twos-a-and-not-on-player-ones",
      twoOffUnderOnesA && movesAt(aTwo, 100, 0)
    );
    check("a-bare-a-button-ignores-player-twos-a", movesAt(a, 0, 0) && movesAt(b, 0, 0));
    controller.player2.A.setPressed(false);
    pause(FRAMES_MS);

    const nil = wendoo.NIL_VALUE;
    const buttonA = tileBody(wendoo.BUTTON_A_TILE);
    const buttonB = tileBody(wendoo.BUTTON_B_TILE);
    const released = act(buttonA, a, []);
    controller.A.setPressed(true);
    const bare = act(buttonA, a, []);
    const empty = act(buttonA, a, [nil]);
    const first = act(buttonA, a, [playerLiteral(1)]);
    const secondUnheld = act(buttonA, a, [playerLiteral(2)]);
    const bUnderA = act(buttonB, a, []);
    controller.A.setPressed(false);
    controller.player2.A.setPressed(true);
    const second = act(buttonA, a, [playerLiteral(2)]);
    const firstUnheld = act(buttonA, a, []);
    controller.player2.A.setPressed(false);
    check(
      "a-button-sensor-reads-true-while-its-players-button-is-held-and-nil-otherwise",
      readsNothing(released) &&
        readsTrue(bare) &&
        readsTrue(empty) &&
        readsTrue(first) &&
        readsNothing(secondUnheld) &&
        readsNothing(bUnderA) &&
        readsTrue(second) &&
        readsNothing(firstUnheld)
    );
    pause(FRAMES_MS);
    game.popScene();
  }

  /** Document id of the keeper program: it moves while its number variable `lives` holds more than 2, and copies `lives` into its number variable `copy` at every think. */
  const KEEPER_ID = "brainVarKeeper01";

  /**
   * In a scene of its own, check game code reading and writing the variables
   * of the brains sprites run, through the arcade extension's block
   * functions, around the keeper program:
   *
   * - a number written right after the sprite is given its brain is held,
   *   the brain's variable not read before it starts, and the brain's first
   *   think reads it; a later request to run a brain on the same sprite
   *   drops the writes held for the earlier one;
   * - a sprite running no brain, or the empty program, reads every type's
   *   empty value and takes no write;
   * - a write on a variable's name reaches the variable the brain shows by
   *   that name, read at the brain's next think and not before;
   * - a name matches exactly: ` lives ` and `Lives` never reach `lives`,
   *   each reaching a variable of its own;
   * - one brain whose dpad reads its `player` variable, run on three
   *   sprites, follows player one's dpad on the sprite given player one at
   *   once, player two's on the sprite given player two a frame later, and
   *   nothing on the sprite given no player;
   * - a variable holding nothing reads the empty value, one holding another
   *   type reads the empty value too, and text and booleans make the round
   *   trip;
   * - the equality overload over two players is bound under its manifest
   *   id, the player a block writes equals that player's literal, and nil
   *   equals nothing, as compiled rules comparing a `player` variable with
   *   player one read it.
   */
  function checkBrainVariables(): void {
    game.pushScene();
    const early = solidSprite(8, 20, 10);
    wendoo.runBrain(early, wendooBrains.p_brainVarKeeper01);
    wendoo.setBrainNumber(early, "lives", 3);
    const unstartedReadsNothing = wendoo.readBrainNumber(early, "lives") === 0;
    let firstThinkCopy = -1;
    game.onUpdate(() => {
      if (firstThinkCopy < 0 && ticksOf(early) === 1) {
        firstThinkCopy = wendoo.readBrainNumber(early, "copy");
      }
    });
    const dropped = solidSprite(8, 20, 25);
    wendoo.runBrain(dropped, wendooBrains.p_brainVarKeeper01);
    wendoo.setBrainNumber(dropped, "lives", 3);
    wendoo.runBrain(dropped, wendooBrains.p_brainVarKeeper01);
    const idle = solidSprite(8, 20, 40);
    wendoo.runBrain(idle, wendooBrains.none);
    wendoo.setBrainNumber(idle, "lives", 3);
    const bare = solidSprite(8, 20, 55);
    wendoo.setBrainNumber(bare, "lives", 3);
    pause(FRAMES_MS);
    check(
      "a-brain-variable-written-before-its-brain-starts-is-held-and-read-by-the-first-think",
      unstartedReadsNothing && firstThinkCopy === 3 && movesAt(early, DEFAULT_MOVE_SPEED, 0)
    );
    check(
      "a-held-brain-variable-write-dies-with-the-run-request-it-rode",
      programOf(dropped) === KEEPER_ID && movesAt(dropped, 0, 0) && wendoo.readBrainNumber(dropped, "lives") === 0
    );
    wendoo.setBrainNumber(idle, "lives", 3);
    const idleHosted = hostedOf(idle);
    check(
      "a-sprite-running-no-brain-reads-empty-and-takes-no-write",
      wendoo.readBrainNumber(bare, "lives") === 0 &&
        wendoo.readBrainString(bare, "lives") === "" &&
        !wendoo.readBrainBoolean(bare, "lives") &&
        programOf(idle) === wendooBrains.none.id &&
        wendoo.readBrainNumber(idle, "lives") === 0 &&
        idleHosted !== undefined &&
        idleHosted.runtime.getVariable("lives").t === wendoo.ValueTag.Nil
    );

    const late = solidSprite(8, 20, 70);
    wendoo.runBrain(late, wendooBrains.p_brainVarKeeper01);
    pause(FRAMES_MS);
    const stillUnwritten = movesAt(late, 0, 0) && wendoo.readBrainNumber(late, "copy") === 0;
    wendoo.setBrainNumber(late, "lives", 3);
    const peeked = wendoo.readBrainNumber(late, "lives") === 3;
    const notYetThought = wendoo.readBrainNumber(late, "copy") === 0 && movesAt(late, 0, 0);
    pause(FRAMES_MS);
    check(
      "a-game-write-on-a-brain-variables-name-reaches-the-variable-the-brain-shows-by-that-name",
      stillUnwritten && movesAt(late, DEFAULT_MOVE_SPEED, 0)
    );
    check(
      "a-brain-variable-written-between-thinks-is-read-at-the-next-think-and-not-before",
      peeked && notYetThought && wendoo.readBrainNumber(late, "copy") === 3
    );

    const exact = solidSprite(8, 20, 85);
    wendoo.runBrain(exact, wendooBrains.p_brainVarKeeper01);
    pause(FRAMES_MS);
    wendoo.setBrainNumber(exact, " lives ", 5);
    wendoo.setBrainNumber(exact, " lives ", 5);
    wendoo.setBrainNumber(exact, "Lives", 5);
    pause(FRAMES_MS);
    check(
      "a-brain-variable-name-matches-exactly-and-an-unknown-name-gets-a-slot-of-its-own",
      movesAt(exact, 0, 0) &&
        wendoo.readBrainNumber(exact, "lives") === 0 &&
        wendoo.readBrainNumber(exact, " lives ") === 5 &&
        wendoo.readBrainNumber(exact, "Lives") === 5
    );

    const first = solidSprite(8, 100, 20);
    const second = solidSprite(8, 100, 50);
    const unset = solidSprite(8, 100, 80);
    wendoo.runBrain(first, wendooBrains.p_brainVarPaddle01);
    wendoo.setBrainPlayer(first, "player", BrainPlayer.One);
    wendoo.runBrain(second, wendooBrains.p_brainVarPaddle01);
    wendoo.runBrain(unset, wendooBrains.p_brainVarPaddle01);
    pause(FRAMES_MS);
    wendoo.setBrainPlayer(second, "player", BrainPlayer.Two);
    pause(FRAMES_MS);
    const untouched = movesAt(first, 0, 0) && movesAt(second, 0, 0) && movesAt(unset, 0, 0);
    controller.player2.right.setPressed(true);
    pause(FRAMES_MS);
    const twoOnly = movesAt(second, DEFAULT_MOVE_SPEED, 0) && movesAt(first, 0, 0) && movesAt(unset, 0, 0);
    controller.player2.right.setPressed(false);
    controller.right.setPressed(true);
    pause(FRAMES_MS);
    const oneOnly = movesAt(first, DEFAULT_MOVE_SPEED, 0) && movesAt(second, 0, 0) && movesAt(unset, 0, 0);
    controller.right.setPressed(false);
    pause(FRAMES_MS);
    check(
      "one-brain-follows-the-dpad-of-the-player-game-code-gives-each-sprite-and-none-on-a-sprite-given-none",
      untouched && twoOnly && oneOnly
    );

    const nilReadsEmpty =
      wendoo.readBrainNumber(unset, "player") === 0 && wendoo.readBrainString(unset, "player") === "";
    const mismatchedText = wendoo.readBrainString(late, "lives");
    const mismatchedBoolean = wendoo.readBrainBoolean(late, "lives");
    const mismatchedPlayer = wendoo.readBrainNumber(first, "player");
    wendoo.setBrainString(late, "motto", "go");
    wendoo.setBrainBoolean(late, "ready", true);
    check(
      "a-brain-variable-holding-nothing-or-another-type-reads-the-empty-value",
      nilReadsEmpty &&
        mismatchedText === "" &&
        !mismatchedBoolean &&
        mismatchedPlayer === 0 &&
        wendoo.readBrainNumber(late, "lives") === 3
    );
    check(
      "text-and-boolean-brain-variables-read-back-what-game-code-wrote",
      wendoo.readBrainString(late, "motto") === "go" &&
        wendoo.readBrainBoolean(late, "ready") &&
        wendoo.readBrainNumber(late, "motto") === 0
    );

    const nil = wendoo.NIL_VALUE;
    const operands = [PLAYER_TYPE, PLAYER_TYPE];
    check(
      "player-equality-overloads-take-their-ids-from-the-manifest",
      !!overloadBody(wendoo.OPERATOR_EQUAL_TO, operands) && !!overloadBody(wendoo.OPERATOR_NOT_EQUAL_TO, operands)
    );
    check(
      "player-equality-compares-player-numbers-the-block-written-player-equals-its-literal-and-nil-equals-nothing",
      comparesBoth(PLAYER_TYPE, first, wendoo.playerValue(1), playerLiteral(1), true) &&
        comparesBoth(PLAYER_TYPE, first, playerLiteral(2), playerLiteral(2), true) &&
        comparesBoth(PLAYER_TYPE, first, playerLiteral(1), playerLiteral(2), false) &&
        comparesBoth(PLAYER_TYPE, first, nil, nil, false) &&
        comparesBoth(PLAYER_TYPE, first, playerLiteral(1), nil, false)
    );
    const pickNone = solidSprite(8, 60, 20);
    const pickOne = solidSprite(8, 60, 50);
    const pickTwo = solidSprite(8, 60, 80);
    wendoo.runBrain(pickNone, wendooBrains.p_playerEqualPick1);
    wendoo.runBrain(pickOne, wendooBrains.p_playerEqualPick1);
    wendoo.setBrainPlayer(pickOne, "player", BrainPlayer.One);
    wendoo.runBrain(pickTwo, wendooBrains.p_playerEqualPick1);
    wendoo.setBrainPlayer(pickTwo, "player", BrainPlayer.Two);
    pause(FRAMES_MS);
    check(
      "a-rule-comparing-a-player-variable-with-player-one-is-equal-only-while-it-holds-player-one",
      movesAt(pickOne, 0, -DEFAULT_MOVE_SPEED) &&
        movesAt(pickTwo, 0, DEFAULT_MOVE_SPEED) &&
        movesAt(pickNone, 0, DEFAULT_MOVE_SPEED)
    );
    game.popScene();
  }

  /** Whether the program `sprite` runs reads nil for its variable named `name`. */
  function holdsNothing(sprite: Sprite, name: string): boolean {
    return hostedOf(sprite).runtime.getVariable(name).t === wendoo.ValueTag.Nil;
  }

  /**
   * In a scene of its own, check that a brain updated while the game runs
   * keeps its variables, by name, through updates of the paddle program to
   * the counted paddle program -- the paddle's dpad rule, and a rule adding 1
   * to its number variable `count` at every think -- and to the bonus paddle
   * program, which adds 1 to its number variable `bonus` at every think too:
   *
   * - an update restart keeps the player game code gave each sprite, and the
   *   value the brain gave its own variable;
   * - a variable new to an update starts at its starting value;
   * - a slot a game write gave a name the brain declares no variable by
   *   carries into an update declaring that name, and is dropped by an
   *   update declaring none;
   * - a variable an update drops is gone, and a later update declaring it
   *   again starts it at its starting value;
   * - running another brain on a sprite, a brain's first start, and a start
   *   after the empty program each start every variable fresh.
   */
  function checkBrainVariableCarry(): void {
    game.pushScene();
    const paddle = wendooBrains.p_brainVarPaddle01;
    const counted = wendooBrains.p_paddleCounted001;
    const bonused = wendooBrains.p_paddleBonus00001;
    const one = solidSprite(8, 40, 30);
    const two = solidSprite(8, 40, 70);
    wendoo.runBrain(one, paddle);
    wendoo.setBrainPlayer(one, "player", BrainPlayer.One);
    wendoo.runBrain(two, paddle);
    wendoo.setBrainPlayer(two, "player", BrainPlayer.Two);
    pause(FRAMES_MS);
    const original = hostedOf(two).runtime;

    postUpdate(paddle, counted.bytecode, "00000014");
    pause(FRAMES_MS);
    const restarted = hostedOf(two).runtime !== original && hostedOf(two).loaded.registration === paddle;
    controller.player2.right.setPressed(true);
    pause(FRAMES_MS);
    const twoFollowsTwo = movesAt(two, DEFAULT_MOVE_SPEED, 0) && movesAt(one, 0, 0);
    controller.player2.right.setPressed(false);
    controller.right.setPressed(true);
    pause(FRAMES_MS);
    const oneFollowsOne = movesAt(one, DEFAULT_MOVE_SPEED, 0) && movesAt(two, 0, 0);
    controller.right.setPressed(false);
    check("an-update-restart-keeps-the-player-game-code-gave-each-sprite", restarted && twoFollowsTwo && oneFollowsOne);

    wendoo.setBrainNumber(one, "bonus", 500);
    wendoo.setBrainNumber(one, "extra", 9);
    const mintedHeld = wendoo.readBrainNumber(one, "bonus") === 500 && wendoo.readBrainNumber(one, "extra") === 9;
    const bonusUndeclared = holdsNothing(two, "bonus");
    const countOne = wendoo.readBrainNumber(one, "count");
    const countTwo = wendoo.readBrainNumber(two, "count");
    postUpdate(paddle, bonused.bytecode, "00000015");
    pause(FRAMES_MS);
    const bonusTwo = wendoo.readBrainNumber(two, "bonus");
    check(
      "an-update-restart-keeps-the-values-a-brain-gave-its-own-variables",
      countTwo > 0 && wendoo.readBrainNumber(two, "count") > countTwo && wendoo.readBrainNumber(one, "count") > countOne
    );
    check(
      "a-variable-new-to-an-update-starts-at-its-starting-value",
      bonusUndeclared && bonusTwo > 0 && wendoo.readBrainNumber(two, "count") === countTwo + bonusTwo
    );
    check(
      "a-slot-a-game-write-gave-carries-into-an-update-declaring-its-name",
      mintedHeld &&
        wendoo.readBrainNumber(one, "count") > countOne &&
        wendoo.readBrainNumber(one, "bonus") - 500 === wendoo.readBrainNumber(one, "count") - countOne
    );
    check(
      "a-slot-a-game-write-gave-is-dropped-by-an-update-declaring-no-variable-by-its-name",
      mintedHeld && holdsNothing(one, "extra") && wendoo.readBrainNumber(one, "extra") === 0
    );

    postUpdate(paddle, counted.bytecode, "00000016");
    pause(FRAMES_MS);
    const bonusGone = holdsNothing(two, "bonus") && wendoo.readBrainNumber(two, "bonus") === 0;
    const countBeforeReturn = wendoo.readBrainNumber(two, "count");
    postUpdate(paddle, bonused.bytecode, "00000017");
    pause(FRAMES_MS);
    const bonusReturned = wendoo.readBrainNumber(two, "bonus");
    check(
      "a-variable-an-update-drops-is-gone-and-a-later-update-declaring-it-starts-it-fresh",
      bonusGone && bonusReturned > 0 && wendoo.readBrainNumber(two, "count") === countBeforeReturn + bonusReturned
    );

    const countBeforeSwitch = wendoo.readBrainNumber(two, "count");
    wendoo.runBrain(two, counted);
    pause(FRAMES_MS);
    check(
      "running-another-brain-on-a-sprite-starts-its-variables-fresh",
      countBeforeSwitch > 0 &&
        programOf(two) === counted.id &&
        wendoo.readBrainNumber(two, "count") === ticksOf(two) &&
        holdsNothing(two, "player")
    );

    const fresh = solidSprite(8, 120, 30);
    wendoo.runBrain(fresh, paddle);
    wendoo.runBrain(one, wendooBrains.none);
    pause(FRAMES_MS);
    const emptied = programOf(one) === wendooBrains.none.id;
    wendoo.runBrain(one, paddle);
    pause(FRAMES_MS);
    check(
      "a-brains-first-start-and-a-start-after-the-empty-program-carry-nothing",
      emptied &&
        ticksOf(fresh) > 0 &&
        wendoo.readBrainNumber(fresh, "count") === ticksOf(fresh) &&
        wendoo.readBrainNumber(fresh, "bonus") === ticksOf(fresh) &&
        holdsNothing(fresh, "player") &&
        ticksOf(one) > 0 &&
        wendoo.readBrainNumber(one, "count") === ticksOf(one) &&
        wendoo.readBrainNumber(one, "bonus") === ticksOf(one) &&
        holdsNothing(one, "player") &&
        holdsNothing(one, "extra")
    );
    game.popScene();
  }

  /** Whether `value` is the boolean `true`. */
  function readsTrue(value: wendoo.Value): boolean {
    return value.t === wendoo.ValueTag.Boolean && value.b;
  }

  /** Wendoo type name of the `Effect` type. */
  const EFFECT_TYPE = "Effect";

  /** Wendoo type name of the `Sound` type. */
  const SOUND_TYPE = "Sound";

  /** The type-atom id the arcade selftest's ids module allocates the `Effect` type. */
  const EFFECT_ATOM = 1029;

  /** The type-atom id the arcade selftest's ids module allocates the `Sound` type. */
  const SOUND_ATOM = 1030;

  /** The names Arcade's API gives the screen effects its game-over blocks offer, in the order they offer them. */
  const ARCADE_EFFECT_NAMES = [
    "confetti",
    "hearts",
    "smiles",
    "blizzard",
    "bubbles",
    "starField",
    "clouds",
    "none",
    "dissolve",
    "melt",
    "slash",
    "splatter",
  ];

  /** Arcade's screen effect each name in {@link ARCADE_EFFECT_NAMES} names, at its position. */
  function arcadeEffects(): effects.BackgroundEffect[] {
    return [
      effects.confetti,
      effects.hearts,
      effects.smiles,
      effects.blizzard,
      effects.bubbles,
      effects.starField,
      effects.clouds,
      effects.none,
      effects.dissolve,
      effects.melt,
      effects.slash,
      effects.splatter,
    ];
  }

  /** The names Arcade's API gives the built-in melodies its sound blocks offer, in the order they offer them. */
  const ARCADE_MELODY_NAMES = [
    "baDing",
    "wawawawaa",
    "jumpUp",
    "jumpDown",
    "powerUp",
    "powerDown",
    "magicWand",
    "siren",
    "pewPew",
    "knock",
    "footstep",
    "thump",
    "smallCrash",
    "bigCrash",
    "zapped",
    "buzzer",
    "sonar",
    "spooky",
    "beamUp",
  ];

  /** Arcade's built-in melody each name in {@link ARCADE_MELODY_NAMES} names, at its position. */
  function arcadeMelodies(): music.Melody[] {
    return [
      music.baDing,
      music.wawawawaa,
      music.jumpUp,
      music.jumpDown,
      music.powerUp,
      music.powerDown,
      music.magicWand,
      music.siren,
      music.pewPew,
      music.knock,
      music.footstep,
      music.thump,
      music.smallCrash,
      music.bigCrash,
      music.zapped,
      music.buzzer,
      music.sonar,
      music.spooky,
      music.beamUp,
    ];
  }

  /** The value of the type `type` a program compiled with the literal `literal` holds: its field values at the ids the project's ids module gives them. */
  function literalValue(type: string, literal: wendoo.TypeLiteral): wendoo.Value {
    const slots: wendoo.Value[] = [];
    for (let i = 0; i < literal.fields.length; i++) {
      const fieldId = wendoo.projectIds().fieldId(type, literal.fields[i].name);
      while (slots.length <= fieldId) {
        slots.push(wendoo.NIL_VALUE);
      }
      slots[fieldId] = literal.fields[i].value;
    }
    return wendoo.mkStruct(wendoo.structTypeId(type), slots);
  }

  /** Whether `literals` are keyed by `names`, in order, and each holds its key in its `name` field alone. */
  function keyedByName(literals: wendoo.TypeLiteral[], names: string[]): boolean {
    if (literals.length !== names.length) {
      return false;
    }
    for (let i = 0; i < literals.length; i++) {
      const fields = literals[i].fields;
      const holds = fields.length === 1 && fields[0].name === "name" && fields[0].value.str === names[i];
      if (literals[i].key !== names[i] || !holds) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check the `Effect` and `Sound` types through their bindings: each takes
   * its atom and its one field from the project's ids module; the `Effect`
   * type declares one literal per screen effect Arcade's game-over blocks
   * offer and the `Sound` type one per melody its sound blocks offer, each
   * keyed by the name Arcade's API gives it and holding that name; each
   * literal's value names the Arcade object of that name; and an empty slot
   * names nothing. None of it logs a value naming nothing.
   */
  function checkEndingChoices(): void {
    const ids = wendoo.projectIds();
    check(
      "effect-and-sound-types-take-their-atoms-and-fields-from-the-manifest",
      wendoo.effectBinding.atomId === EFFECT_ATOM &&
        wendoo.effectBinding.typeId === wendoo.structTypeId(EFFECT_TYPE) &&
        wendoo.effectBinding.fieldIds.length === 1 &&
        wendoo.effectBinding.fieldIds[0] === ids.fieldId(EFFECT_TYPE, "name") &&
        wendoo.soundBinding.atomId === SOUND_ATOM &&
        wendoo.soundBinding.typeId === wendoo.structTypeId(SOUND_TYPE) &&
        wendoo.soundBinding.fieldIds.length === 1 &&
        wendoo.soundBinding.fieldIds[0] === ids.fieldId(SOUND_TYPE, "name")
    );

    const effectLiterals = wendoo.effectLiterals();
    const expectedEffects = arcadeEffects();
    let effectsNamed = keyedByName(effectLiterals, ARCADE_EFFECT_NAMES);
    for (let i = 0; effectsNamed && i < effectLiterals.length; i++) {
      effectsNamed = wendoo.effectBinding.effectOf(literalValue(EFFECT_TYPE, effectLiterals[i])) === expectedEffects[i];
    }
    check(
      "each-effect-literal-names-the-arcade-effect-of-its-key-and-an-empty-effect-slot-names-none",
      effectsNamed &&
        wendoo.effectBinding.effectOf(wendoo.NIL_VALUE) === undefined &&
        wendoo.effectBinding.effectOf(undefined) === undefined
    );

    const soundLiterals = wendoo.soundLiterals();
    const expectedMelodies = arcadeMelodies();
    let soundsNamed = keyedByName(soundLiterals, ARCADE_MELODY_NAMES);
    for (let i = 0; soundsNamed && i < soundLiterals.length; i++) {
      soundsNamed = wendoo.soundBinding.melodyOf(literalValue(SOUND_TYPE, soundLiterals[i])) === expectedMelodies[i];
    }
    check(
      "each-sound-literal-names-the-arcade-melody-of-its-key-and-an-empty-sound-slot-names-none",
      soundsNamed &&
        wendoo.soundBinding.melodyOf(wendoo.NIL_VALUE) === undefined &&
        wendoo.soundBinding.melodyOf(undefined) === undefined
    );
  }

  /**
   * In a scene of its own, with game code handling game over, check that a
   * program whose game-over rules each place a player, an effect or a sound
   * that reads nothing -- a variable never written -- runs, and ends no
   * game and sets no effect or sound: placing a value that reads nothing
   * leaves the action undone.
   */
  function checkGameOverGates(): void {
    game.pushScene();
    let endings = 0;
    game.onGameOver((win: boolean) => {
      endings++;
    });
    const unset = spriteRunning(wendooBrains.p_gameOverUnset001);
    pause(FRAMES_MS);
    const config = game.gameOverConfig();
    check(
      "a-game-over-given-a-player-effect-or-sound-that-reads-nothing-does-not-run",
      ticksOf(unset) > 0 && endings === 0 && !config.effectSetByUser && !config.soundSetByUser
    );
    game.popScene();
  }

  /** Wendoo type name of the `ParticleEffect` type. */
  const PARTICLE_EFFECT_TYPE = "ParticleEffect";

  /** The type-atom id the arcade selftest's ids module allocates the `ParticleEffect` type. */
  const PARTICLE_EFFECT_ATOM = 1031;

  /** The action id the arcade selftest's ids module allocates the destroy actuator. */
  const DESTROY_ACTION = 1035;

  /** The action id the arcade selftest's ids module allocates the destroyed sensor. */
  const DESTROYED_ACTION = 1036;

  /** The names Arcade's API gives the particle effects its destroy block offers: the particle-only effects, then the screen effects. */
  const ARCADE_PARTICLE_EFFECT_NAMES = [
    "spray",
    "trail",
    "fountain",
    "rings",
    "fire",
    "warmRadial",
    "coolRadial",
    "halo",
    "ashes",
    "disintegrate",
    "confetti",
    "hearts",
    "smiles",
    "blizzard",
    "bubbles",
    "starField",
    "clouds",
    "none",
  ];

  /** Arcade's particle effect each name in {@link ARCADE_PARTICLE_EFFECT_NAMES} names, at its position. */
  function arcadeParticleEffects(): effects.ParticleEffect[] {
    return [
      effects.spray,
      effects.trail,
      effects.fountain,
      effects.rings,
      effects.fire,
      effects.warmRadial,
      effects.coolRadial,
      effects.halo,
      effects.ashes,
      effects.disintegrate,
      effects.confetti,
      effects.hearts,
      effects.smiles,
      effects.blizzard,
      effects.bubbles,
      effects.starField,
      effects.clouds,
      effects.none,
    ];
  }

  /** The `ParticleEffect` value naming `name`, as a program compiled with a literal holding that name holds it. */
  function particleEffectValue(name: string): wendoo.Value {
    return literalValue(PARTICLE_EFFECT_TYPE, wendoo.namedChoiceLiterals([name], [name])[0]);
  }

  /** Whether `sprite` is among the current scene's sprites. */
  function inScene(sprite: Sprite): boolean {
    return game.currentScene().allSprites.indexOf(sprite) >= 0;
  }

  /** Whether `sprite` is flagged a ghost, as Arcade flags a sprite vanishing in an effect. */
  function isGhost(sprite: Sprite): boolean {
    return (sprite.flags & SpriteFlag.Ghost) !== 0;
  }

  /**
   * Check the `ParticleEffect` type and the destroy tiles' registrations:
   * the type takes its atom and its one field, and the destroy actuator and
   * destroyed sensor their action ids, from the project's ids module; the
   * type declares one literal per particle effect Arcade's destroy block
   * offers, keyed by the name Arcade's API gives it and holding that name,
   * each naming the Arcade effect of that name; and an empty slot names
   * nothing. None of it logs a value naming nothing.
   */
  function checkParticleEffectType(): void {
    const ids = wendoo.projectIds();
    check(
      "particle-effect-type-and-destroy-tiles-take-their-ids-from-the-manifest",
      wendoo.particleEffectBinding.atomId === PARTICLE_EFFECT_ATOM &&
        wendoo.particleEffectBinding.typeId === wendoo.structTypeId(PARTICLE_EFFECT_TYPE) &&
        wendoo.particleEffectBinding.fieldIds.length === 1 &&
        wendoo.particleEffectBinding.fieldIds[0] === ids.fieldId(PARTICLE_EFFECT_TYPE, "name") &&
        ids.actionId(wendoo.DESTROY_TILE) === DESTROY_ACTION &&
        ids.actionId(wendoo.DESTROYED_TILE) === DESTROYED_ACTION &&
        tileBody(wendoo.DESTROY_TILE) !== undefined &&
        tileBody(wendoo.DESTROYED_TILE) !== undefined
    );

    const literals = wendoo.particleEffectLiterals();
    const expected = arcadeParticleEffects();
    let named = keyedByName(literals, ARCADE_PARTICLE_EFFECT_NAMES);
    for (let i = 0; named && i < literals.length; i++) {
      named =
        wendoo.particleEffectBinding.particleEffectOf(literalValue(PARTICLE_EFFECT_TYPE, literals[i])) === expected[i];
    }
    check(
      "each-particle-effect-literal-names-the-arcade-effect-of-its-key-and-an-empty-slot-names-none",
      named &&
        wendoo.particleEffectBinding.particleEffectOf(wendoo.NIL_VALUE) === undefined &&
        wendoo.particleEffectBinding.particleEffectOf(undefined) === undefined
    );
  }

  /**
   * In a scene of its own, check the destroy actuator's and destroyed
   * sensor's bodies, called directly: a bare destroy destroys its own sprite
   * at once, and one given a sprite destroys that sprite alone; given an
   * effect and a duration of half a second, the sprite is destroyed at once
   * but stays in the scene as a ghost for 500 milliseconds, then is gone;
   * given a duration and no effect, or an effect naming nothing Arcade
   * holds, it is gone at once; given an effect and a duration of 0, below 0
   * or none, the ghost stays for the effect's own length, a quarter of its
   * default lifespan; a destroy of a sprite already destroyed changes
   * nothing; and destroyed reads true on behalf of a destroyed sprite and nil
   * on behalf of one that is not.
   */
  function checkDestroyTile(): void {
    game.pushScene();
    const destroy = tileBody(wendoo.DESTROY_TILE);
    const nil = wendoo.NIL_VALUE;
    const confetti = particleEffectValue("confetti");
    const half = wendoo.mkNumber(0.5);

    const own = newSprite(SpriteKind.Player);
    act(destroy, own, []);
    const bystander = newSprite(SpriteKind.Player);
    const target = newSprite(SpriteKind.Player);
    act(destroy, bystander, [wendoo.spriteValue(target)]);
    check(
      "a-bare-destroy-destroys-its-own-sprite-at-once-and-one-given-a-sprite-that-sprite-alone",
      wendoo.isDestroyed(own) &&
        !inScene(own) &&
        wendoo.isDestroyed(target) &&
        !inScene(target) &&
        !wendoo.isDestroyed(bystander) &&
        inScene(bystander)
    );

    const ghost = newSprite(SpriteKind.Player);
    act(destroy, ghost, [nil, confetti, half]);
    const ghostly = wendoo.isDestroyed(ghost) && isGhost(ghost) && inScene(ghost) && ghost.lifespan === 500;

    const plain = newSprite(SpriteKind.Player);
    act(destroy, plain, [nil, nil, half]);
    check(
      "a-destroy-given-a-duration-and-no-effect-removes-its-sprite-at-once",
      wendoo.isDestroyed(plain) && !inScene(plain) && !isGhost(plain)
    );

    const unheld = newSprite(SpriteKind.Player);
    const unheldAgain = newSprite(SpriteKind.Player);
    act(destroy, unheld, [nil, particleEffectValue("sparkle"), half]);
    act(destroy, unheldAgain, [nil, particleEffectValue("sparkle"), nil]);
    check(
      "a-destroy-given-a-particle-effect-naming-nothing-removes-its-sprite-at-once",
      wendoo.isDestroyed(unheld) &&
        !inScene(unheld) &&
        !isGhost(unheld) &&
        wendoo.isDestroyed(unheldAgain) &&
        !inScene(unheldAgain) &&
        !isGhost(unheldAgain)
    );

    const zero = newSprite(SpriteKind.Player);
    const negative = newSprite(SpriteKind.Player);
    const unset = newSprite(SpriteKind.Player);
    act(destroy, zero, [nil, confetti, wendoo.mkNumber(0)]);
    act(destroy, negative, [nil, confetti, wendoo.mkNumber(-2)]);
    act(destroy, unset, [nil, confetti, nil]);
    check(
      "a-destroy-given-an-effect-and-a-duration-of-0-below-0-or-none-keeps-the-ghost-for-the-effects-own-length",
      isGhost(zero) &&
        zero.lifespan === 1000 &&
        isGhost(negative) &&
        negative.lifespan === 1000 &&
        isGhost(unset) &&
        unset.lifespan === 1000
    );

    const twice = newSprite(SpriteKind.Player);
    act(destroy, twice, [nil, confetti, wendoo.mkNumber(2)]);
    act(destroy, twice, []);
    act(destroy, bystander, [wendoo.spriteValue(twice), particleEffectValue("fire"), half]);
    check(
      "destroying-a-destroyed-sprite-again-changes-nothing",
      inScene(twice) && isGhost(twice) && twice.lifespan === 2000
    );

    const destroyed = tileBody(wendoo.DESTROYED_TILE);
    check(
      "destroyed-reads-true-on-behalf-of-a-destroyed-sprite-and-nil-otherwise",
      readsNothing(act(destroyed, bystander, [])) &&
        readsTrue(act(destroyed, own, [])) &&
        readsTrue(act(destroyed, ghost, []))
    );

    pause(6 * FRAMES_MS);
    check(
      "a-destroy-given-an-effect-and-half-a-second-leaves-a-ghost-for-half-a-second-then-removes-it",
      ghostly && !inScene(ghost) && wendoo.isDestroyed(ghost)
    );
    game.popScene();
  }

  /**
   * Check, on a program host the check drains by hand, a program's final
   * think: a program whose bare destroy destroys its own sprite has that
   * sprite destroyed in the think it runs in and stays on the host; the next
   * drain thinks it once more, its destroyed rule firing, then ends it; and
   * later drains think it no more.
   */
  function checkFinalThink(): void {
    game.pushScene();
    const host = new wendoo.ProgramHost(new wendoo.VmObserver());
    const sprite = newSprite(SpriteKind.Player);
    host.attach(new wendoo.SpriteAttachment(sprite), wendooBrains.p_vanishDestroy001);
    const before = info.score();
    host.drain(20);
    const program = host.hostedPrograms()[0];
    check(
      "a-bare-destroy-in-a-brain-destroys-its-sprite-in-that-think-and-the-brain-stays-for-the-next-drain",
      wendoo.isDestroyed(sprite) && host.hostedPrograms().length === 1 && info.score() === before
    );
    host.drain(40);
    const ended = host.hostedPrograms().length === 0 && info.score() === before + 1;
    host.drain(60);
    check(
      "the-next-drain-thinks-the-brain-once-more-its-destroyed-rule-firing-then-ends-it",
      ended && info.score() === before + 1 && program !== undefined && program.runtime.tickCount() === 2
    );
    game.popScene();
  }

  /**
   * In a scene of its own, check programs placing the destroy and destroyed
   * tiles: a destroyed rule never fires while its sprite lives, and fires
   * once when game code destroys the sprite, with an effect or without, the
   * brain ending after it; a brain asked for, or an update restart due, on a
   * sprite destroyed before the next frame never starts, the brain it ran
   * thinking its final think; a destroy placing a sprite or a particle
   * effect that reads nothing does not run; an eat rule destroys the sprite
   * it bumps, whose brain thinks its final think, and runs on; an eat rule
   * given confetti and half a second leaves a ghost that is gone after it;
   * and a sprite variable holding the sprite its brain destroyed reads
   * nothing from that moment on.
   */
  function checkDestroyPrograms(): void {
    game.pushScene();
    const mourn = wendooBrains.p_mournDestroyed01;
    const start = info.score();
    const mourner = spriteRunning(mourn);
    const ghostMourner = spriteRunning(mourn);
    pause(FRAMES_MS);
    check("a-sprite-never-destroyed-never-fires-its-destroyed-rule", ticksOf(mourner) > 0 && info.score() === start);

    sprites.destroy(mourner);
    sprites.destroy(ghostMourner, effects.fire, 2000);
    pause(FRAMES_MS);
    const afterDeaths = info.score();
    pause(FRAMES_MS);
    check(
      "a-sprite-game-code-destroys-fires-its-brains-destroyed-rule-once-with-or-without-an-effect-and-the-brain-ends",
      afterDeaths === start + 2 &&
        info.score() === start + 2 &&
        programOf(mourner) === NOT_RUNNING &&
        programOf(ghostMourner) === NOT_RUNNING
    );

    const switched = spriteRunning(mourn);
    pause(FRAMES_MS);
    const beforeSwitch = info.score();
    wendoo.runBrain(switched, wendooBrains.p_mournFiveScore01);
    sprites.destroy(switched);
    pause(FRAMES_MS);
    check(
      "a-brain-asked-for-on-a-sprite-destroyed-before-it-starts-never-starts-and-the-old-brain-thinks-its-final-think",
      info.score() === beforeSwitch + 1 && programOf(switched) === NOT_RUNNING
    );

    const lament = wendooBrains.p_lamentDestroyed1;
    const lamenter = spriteRunning(lament);
    pause(FRAMES_MS);
    const beforeUpdate = info.score();
    postUpdate(lament, wendooBrains.p_mournFiveScore01.bytecode, "00000018");
    sprites.destroy(lamenter);
    pause(FRAMES_MS);
    check(
      "an-update-restart-due-on-a-sprite-destroyed-before-it-starts-never-starts-and-the-old-brain-thinks-its-final-think",
      info.score() === beforeUpdate + 1 && programOf(lamenter) === NOT_RUNNING
    );

    const unset = spriteRunning(wendooBrains.p_destroyUnsetPrey);
    pause(FRAMES_MS);
    check(
      "a-destroy-given-a-sprite-or-particle-effect-that-reads-nothing-does-not-run",
      ticksOf(unset) > 0 && !wendoo.isDestroyed(unset)
    );

    const eater = solidSprite(8, 40, 40);
    wendoo.runBrain(eater, wendooBrains.p_eatBumpedSprite1);
    const prey = solidSprite(8, 44, 40);
    wendoo.runBrain(prey, mourn);
    const beforeEat = info.score();
    pause(FRAMES_MS);
    const eaterTicks = ticksOf(eater);
    pause(FRAMES_MS);
    check(
      "an-eat-rule-destroys-the-sprite-it-bumps-whose-brain-thinks-its-final-think-and-runs-on",
      wendoo.isDestroyed(prey) &&
        !inScene(prey) &&
        programOf(prey) === NOT_RUNNING &&
        info.score() === beforeEat + 1 &&
        !wendoo.isDestroyed(eater) &&
        ticksOf(eater) > eaterTicks
    );

    const feaster = solidSprite(8, 120, 40);
    wendoo.runBrain(feaster, wendooBrains.p_feastConfetti001);
    const morsel = solidSprite(8, 124, 40);
    pause(FRAMES_MS);
    const ghostly =
      wendoo.isDestroyed(morsel) && isGhost(morsel) && inScene(morsel) && morsel.lifespan > 0 && morsel.lifespan <= 500;
    pause(5 * FRAMES_MS);
    check(
      "an-eat-rule-given-confetti-and-half-a-second-leaves-a-ghost-that-is-gone-after-half-a-second",
      ghostly && !inScene(morsel) && !wendoo.isDestroyed(feaster)
    );

    const grudger = solidSprite(8, 40, 100);
    wendoo.runBrain(grudger, wendooBrains.p_grudgeHeldPrey01);
    const quarry = solidSprite(8, 44, 100);
    const beforeGrudge = info.score();
    pause(FRAMES_MS);
    pause(FRAMES_MS);
    check(
      "a-sprite-variable-holding-the-sprite-its-brain-destroyed-reads-nothing-from-that-moment-on",
      wendoo.isDestroyed(quarry) && info.score() === beforeGrudge + 1 && ticksOf(grudger) > 0
    );
    game.popScene();
  }

  /**
   * In a scene of its own, check that a sprite destroyed with an effect,
   * still in the scene as a ghost while the effect plays, is read as nothing
   * by another sprite's brain: the range rules of a brain watching it, on
   * while it lived, stop, and bump, in range and out of range read nothing
   * on that brain's behalf.
   */
  function checkDestroyedSpriteWatch(): void {
    game.pushScene();
    const nil = wendoo.NIL_VALUE;
    const watcher = newSprite(SpriteKind.Player);
    watcher.setPosition(80, 60);
    wendoo.runBrain(watcher, wendooBrains.p_eitherInUpOutDn1);
    const watched = newSprite(SpriteKind.Player);
    watched.setPosition(100, 60);
    pause(FRAMES_MS);
    const climbing = movesAt(watcher, 0, -100);
    act(tileBody(wendoo.DESTROY_TILE), watcher, [
      wendoo.spriteValue(watched),
      particleEffectValue("fire"),
      wendoo.mkNumber(2),
    ]);
    pause(FRAMES_MS);
    check(
      "another-brain-reads-a-sprite-destroyed-with-an-effect-as-nothing-and-its-range-rules-stop",
      climbing &&
        inScene(watched) &&
        isGhost(watched) &&
        movesAt(watcher, 0, 0) &&
        readsNothing(sense(wendoo.IN_RANGE_TILE, watcher, nil, nil, nil)) &&
        readsNothing(sense(wendoo.OUT_OF_RANGE_TILE, watcher, nil, nil, nil)) &&
        readsNothing(sense(wendoo.BUMP_TILE, watcher, nil, nil, nil))
    );
    game.popScene();
  }

  /** The action id the arcade selftest's ids module allocates the say actuator. */
  const SAY_ACTION = 1037;

  /** A scene time far past any the selftest's scenes reach, at which its direct says are made. */
  const SAY_TIME = 1000000;

  /** A speech voice recording every bubble it shows or clears, in order, then showing or clearing it through Arcade's own `sayText`. */
  class RecordingVoice extends wendoo.SpeechVoice {
    /** The sprite of each call, in call order. */
    speakers: Sprite[];
    /** The text of each call, in call order; `""` for a clear. */
    texts: string[];

    constructor() {
      super();
      this.speakers = [];
      this.texts = [];
    }

    say(sprite: Sprite, text: string): void {
      this.speakers.push(sprite);
      this.texts.push(text);
      super.say(sprite, text);
    }

    /** The text of each call made for `sprite`, in call order, joined by `|`. */
    saidBy(sprite: Sprite): string {
      const said: string[] = [];
      for (let i = 0; i < this.speakers.length; i++) {
        if (this.speakers[i] === sprite) {
          said.push(this.texts[i]);
        }
      }
      return said.join("|");
    }
  }

  /** A recording voice in place of the current scene's own. */
  function recordSpeech(): RecordingVoice {
    const voice = new RecordingVoice();
    wendoo.sceneSpeech(game.currentScene()).voice = voice;
    return voice;
  }

  /** Call the say tile's body on `sprite`'s behalf at the scene time `time`, given `args`. */
  function sayAt(sprite: Sprite, time: number, args: wendoo.Value[]): void {
    const ctx = contextOn(sprite);
    ctx.time = time;
    tileBody(wendoo.SAY_TILE).execSync(ctx, args);
  }

  /**
   * In a scene of its own, check the say tile, its body called directly at
   * scripted scene times and its scene's bubbles cleared at scripted times:
   * the tile takes its action id from the project's ids module; a number, a
   * text and a switch are said as Arcade prints them and any other value is
   * not; a text said again and again is shown once and its bubble kept up,
   * and another text is shown at once in its place; the bubble clears 5
   * seconds after the last say given no duration, the duration's seconds
   * after given one, and at the first time after the last say given 0 or a
   * duration below 0; empty text clears it at once; a say given no text
   * under no WHEN says nothing; and a destroyed sprite says nothing, its
   * bubble forgotten without a clear.
   */
  function checkSayTile(): void {
    game.pushScene();
    const voice = recordSpeech();
    const speech = wendoo.sceneSpeech(game.currentScene());
    const nil = wendoo.NIL_VALUE;
    check(
      "say-tile-takes-its-action-id-from-the-manifest",
      wendoo.projectIds().actionId(wendoo.SAY_TILE) === SAY_ACTION && tileBody(wendoo.SAY_TILE) !== undefined
    );

    const point = wendoo.vector2Value(new wendoo.DirectionVector(1, 2));
    check(
      "say-prints-a-number-a-text-and-a-switch-as-arcade-does-and-nothing-else",
      wendoo.spokenText(wendoo.mkNumber(3)) === "3" &&
        wendoo.spokenText(wendoo.mkNumber(2.5)) === "2.5" &&
        wendoo.spokenText(wendoo.mkNumber(-1)) === "-1" &&
        wendoo.spokenText(wendoo.mkString("hello")) === "hello" &&
        wendoo.spokenText(wendoo.mkString("")) === "" &&
        wendoo.spokenText(wendoo.TRUE_VALUE) === "true" &&
        wendoo.spokenText(wendoo.FALSE_VALUE) === "false" &&
        wendoo.spokenText(point) === undefined &&
        wendoo.spokenText(wendoo.spriteValue(newSprite(SpriteKind.Player))) === undefined &&
        wendoo.spokenText(nil) === undefined
    );

    const talker = newSprite(SpriteKind.Player);
    for (let i = 0; i < 10; i++) {
      sayAt(talker, SAY_TIME + i * 20, [wendoo.mkString("hello")]);
    }
    check("a-text-said-again-and-again-is-shown-once", voice.saidBy(talker) === "hello");
    sayAt(talker, SAY_TIME + 200, [wendoo.mkString("bye")]);
    sayAt(talker, SAY_TIME + 220, [wendoo.mkString("bye"), nil]);
    check("another-text-is-shown-at-once-in-its-place", voice.saidBy(talker) === "hello|bye");
    speech.expire(SAY_TIME + 5220);
    const upAtFive = voice.saidBy(talker) === "hello|bye";
    speech.expire(SAY_TIME + 5221);
    check(
      "a-bubble-given-no-duration-clears-five-seconds-after-the-last-say",
      upAtFive && voice.saidBy(talker) === "hello|bye|"
    );

    const half = newSprite(SpriteKind.Player);
    sayAt(half, SAY_TIME, [wendoo.mkString("hi"), wendoo.mkNumber(0.5)]);
    sayAt(half, SAY_TIME + 100, [wendoo.mkString("hi"), wendoo.mkNumber(0.5)]);
    speech.expire(SAY_TIME + 600);
    const upAtHalf = voice.saidBy(half) === "hi";
    speech.expire(SAY_TIME + 601);
    check(
      "a-bubble-given-a-duration-clears-that-many-seconds-after-the-last-say",
      upAtHalf && voice.saidBy(half) === "hi|"
    );

    const zero = newSprite(SpriteKind.Player);
    const negative = newSprite(SpriteKind.Player);
    sayAt(zero, SAY_TIME, [wendoo.mkString("now"), wendoo.mkNumber(0)]);
    sayAt(negative, SAY_TIME, [wendoo.mkNumber(-3), wendoo.mkNumber(-2)]);
    speech.expire(SAY_TIME);
    const upWhileSaid = voice.saidBy(zero) === "now" && voice.saidBy(negative) === "-3";
    speech.expire(SAY_TIME + 1);
    check(
      "a-bubble-given-0-or-a-duration-below-0-clears-at-the-first-time-after-the-last-say",
      upWhileSaid && voice.saidBy(zero) === "now|" && voice.saidBy(negative) === "-3|"
    );

    const hushed = newSprite(SpriteKind.Player);
    sayAt(hushed, SAY_TIME, [wendoo.mkString("shh")]);
    sayAt(hushed, SAY_TIME + 20, [wendoo.mkString("")]);
    speech.expire(SAY_TIME + 100000);
    check("empty-text-clears-the-bubble-at-once", voice.saidBy(hushed) === "shh|");

    const mute = newSprite(SpriteKind.Player);
    sayAt(mute, SAY_TIME, []);
    check("a-say-given-no-text-under-no-when-says-nothing", voice.saidBy(mute) === "");

    const gone = newSprite(SpriteKind.Player);
    sayAt(gone, SAY_TIME, [wendoo.mkString("hi")]);
    sprites.destroy(gone);
    sayAt(gone, SAY_TIME + 20, [wendoo.mkString("bye")]);
    speech.expire(SAY_TIME + 100000);
    check("a-destroyed-sprite-says-nothing-and-its-bubble-is-forgotten", voice.saidBy(gone) === "hi");
    game.popScene();
  }

  /**
   * In a scene of its own, check programs placing the say tile: a rule held
   * for many frames shows its text once and keeps the bubble up; a rule
   * saying another text replaces it at once; a bubble given half a second
   * clears half a second after its rule stops; a say given no text says its
   * WHEN result -- the score, a text variable, `true` under the A button --
   * and says nothing under a bump, whose WHEN result is a sprite; the walk's
   * ouch rule says ouch while its sprite touches another; and a say in the
   * final think of a destroyed sprite says nothing.
   */
  function checkSayPrograms(): void {
    game.pushScene();
    const voice = recordSpeech();
    const chatter = spriteRunning(wendooBrains.p_sayChatterHiBye1);
    const shout = spriteRunning(wendooBrains.p_sayButtonBare001);
    pause(FRAMES_MS);
    const quiet = voice.saidBy(chatter) === "" && voice.saidBy(shout) === "";
    controller.A.setPressed(true);
    pause(FRAMES_MS);
    const ticksHeld = ticksOf(chatter);
    pause(2 * FRAMES_MS);
    check(
      "a-say-rule-held-for-many-frames-shows-its-text-once",
      quiet && ticksOf(chatter) > ticksHeld + 2 && voice.saidBy(chatter) === "hi"
    );
    check("a-bare-say-under-the-a-button-says-true", voice.saidBy(shout) === "true");
    controller.A.setPressed(false);
    controller.B.setPressed(true);
    pause(FRAMES_MS);
    controller.B.setPressed(false);
    check("a-say-rule-saying-another-text-replaces-the-bubble-at-once", voice.saidBy(chatter) === "hi|bye");
    pause(250);
    const upAfterRelease = voice.saidBy(chatter) === "hi|bye";
    pause(500);
    check(
      "a-bubble-given-half-a-second-clears-half-a-second-after-its-rule-stops",
      upAfterRelease && voice.saidBy(chatter) === "hi|bye|"
    );

    const announcer = spriteRunning(wendooBrains.p_sayScoreBare0001);
    info.setScore(42);
    pause(FRAMES_MS);
    const saidFortyTwo = voice.saidBy(announcer) === "42";
    info.setScore(43);
    pause(FRAMES_MS);
    check(
      "a-bare-say-under-a-score-says-the-score-and-each-new-score-at-once",
      saidFortyTwo && voice.saidBy(announcer) === "42|43"
    );

    const motto = spriteRunning(wendooBrains.p_sayMottoBare0001);
    pause(FRAMES_MS);
    const silent = voice.saidBy(motto) === "";
    wendoo.setBrainString(motto, "motto", "onward");
    pause(FRAMES_MS);
    check(
      "a-bare-say-under-a-text-variable-says-its-text-once-it-holds-some",
      silent && voice.saidBy(motto) === "onward"
    );

    const ouch = solidSprite(8, 40, 100);
    wendoo.runBrain(ouch, wendooBrains.p_sayOuchBump00001);
    const mumble = solidSprite(8, 44, 100);
    wendoo.runBrain(mumble, wendooBrains.p_sayBumpedBare001);
    pause(2 * FRAMES_MS);
    check(
      "an-ouch-rule-says-ouch-once-while-its-sprite-touches-another",
      ticksOf(ouch) > 2 && voice.saidBy(ouch) === "ouch"
    );
    check(
      "a-bare-say-under-a-bump-whose-when-result-is-a-sprite-says-nothing",
      ticksOf(mumble) > 2 && voice.saidBy(mumble) === ""
    );

    const farewell = spriteRunning(wendooBrains.p_sayFarewell00001);
    pause(FRAMES_MS);
    sprites.destroy(farewell);
    pause(FRAMES_MS);
    check(
      "a-say-in-the-final-think-of-a-destroyed-sprite-says-nothing",
      programOf(farewell) === NOT_RUNNING && voice.saidBy(farewell) === ""
    );
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
      wendoo.dpadIcon(),
      wendoo.imageTypeIcon(),
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
      if ((hosted[i].attachment as wendoo.SpriteAttachment).sprite === sprite) {
        return hosted[i].runtime;
      }
    }
    return undefined;
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
    check("update-ends-the-old-instances-cleanly", !oldStillHosted && hosted.length === hostedCount);
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
        movesAt(spawned, 0, 0)
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
   * the move's toward and away carry, the move's wander, its speed limit,
   * move smoothing, non-finite motion, the equality operators, the operators
   * over `Vector2`s, programs holding variables, players' scores and dpads,
   * the A and B buttons, the brain variables game code reads and writes, the
   * variables an update restart carries, the effects and sounds a game over
   * takes, the game over's gate on a placed value reading nothing, and the
   * arcade icon encoder.
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
    check(
      "destroyed-sprite-program-ends",
      programOf(ticker) === NOT_RUNNING && wendoo.sceneProgramHost(game.currentScene()).hostedPrograms().length === 3
    );

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
    checkOutputWrites();
    checkPositionalModifiers();
    checkMoveTargets();
    checkWander();
    checkSpeedLimit();
    checkMoveSmoothing();
    checkNonFiniteMotion();
    checkNonFiniteSpeed();
    checkSpriteMoveSmoothing();
    checkMoveSmoothingField();
    checkEasingAcrossBrainChanges();
    checkEasingFromActualVelocity();
    checkEqualityOperators();
    checkVector2Operators();
    checkVariables();
    checkComponentWrites();
    checkPlayerScores();
    checkScorePrograms();
    checkPlayerDpad();
    checkButtonSensors();
    checkBrainVariables();
    checkBrainVariableCarry();
    checkEndingChoices();
    checkGameOverGates();
    checkParticleEffectType();
    checkDestroyTile();
    checkFinalThink();
    checkDestroyPrograms();
    checkDestroyedSpriteWatch();
    checkSayTile();
    checkSayPrograms();
    checkIconEncoder();

    console.log(`CHECKS failed ${failedChecks}`);
    console.log(`SIMCAP PASS ${SELFTEST_CASE_ID}`);
  }
}
