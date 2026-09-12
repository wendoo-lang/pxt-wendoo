/**
 * The core host surface: the host functions and host actions core owns. Core
 * ids run below 1024; a target registers its own at and above that base.
 */
namespace wendoo {
  /** Stable funcIds of the core host functions. */
  export enum CoreFuncId {
    /** Number `+` number. */
    OpAddNumber = 3,
  }

  /** Stable action ids of the core host actions. */
  export enum CoreActionId {
    /** The `otherwise` chain sensor. */
    Otherwise = 8,
    /** The THEN trigger's arming read. */
    RuleTrigger = 9,
  }

  /**
   * Whether `args[slot]` carries a number that is not a NaN. A slot past the
   * end of the buffer, a slot of another kind, and a NaN all read false.
   *
   * @param args - Positional argument buffer.
   * @param slot - Slot index to test.
   */
  function isValidNumberArg(args: Value[], slot: number): boolean {
    if (slot < 0 || slot >= args.length) {
      return false;
    }
    const v = args[slot];
    return v.t === ValueTag.Number && !isNotANumber(v.num);
  }

  /** `+` over two number operands. Bad operands and a NaN result evaluate nil. */
  class OpAddNumber extends HostFunction {
    constructor() {
      super(CoreFuncId.OpAddNumber);
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      if (!isValidNumberArg(args, 0) || !isValidNumberArg(args, 1)) {
        return NIL_VALUE;
      }
      const result = args[0].num + args[1].num;
      return isNotANumber(result) ? NIL_VALUE : mkNumber(result);
    }
  }

  /**
   * Arming read behind the ELSE (`otherwise`) rule trigger: true when the
   * rule immediately above this one at its own nesting level evaluated its
   * WHEN and did not fire. A subject that fired, one still evaluating, and
   * a rule with no preceding sibling all read false.
   */
  class OtherwiseTrigger extends HostActionBinding {
    constructor() {
      super(CoreActionId.Otherwise, "otherwise", false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const ruleFuncId = ctx.currentRuleFuncId;
      if (ruleFuncId === NO_RULE) {
        return FALSE_VALUE;
      }
      const subjectFuncId = ctx.services.program.precedingSiblingRuleFuncId(ruleFuncId);
      if (subjectFuncId === NO_RULE) {
        return FALSE_VALUE;
      }
      return mkBoolean(ctx.services.ruleFiring.get(subjectFuncId) === RuleFiringState.DidNotFire);
    }
  }

  /**
   * Arming read behind the THEN rule trigger: answers whether the calling
   * rule's subject -- the rule immediately above it at its own nesting
   * level -- has fired and completed. The caller consumes the handle with an
   * ordinary `AWAIT`, so an immediate answer falls through without suspending
   * and a pending one parks the rule.
   *
   * - The subject's cluster is in flight: the handle is left pending in the
   *   subject's watcher slot and the calling rule's own record is written
   *   `DidNotFire`. The settle walk resolves the handle once that cluster
   *   empties.
   * - The subject fired and its cluster has emptied with no fault or
   *   cancellation in it: resolves true.
   * - The subject is settled without a firing, its firing was abandoned, or
   *   the calling rule has no subject: resolves false.
   */
  class RuleTrigger extends HostActionBinding {
    constructor() {
      super(CoreActionId.RuleTrigger, "rule-trigger", true);
      this.uncappedHandles = true;
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const services = ctx.services;
      const ruleFuncId = ctx.currentRuleFuncId;
      const subjectFuncId = ruleFuncId === NO_RULE ? NO_RULE : services.program.precedingSiblingRuleFuncId(ruleFuncId);
      if (subjectFuncId === NO_RULE) {
        handle.resolve(FALSE_VALUE);
        return;
      }

      if (services.ruleCompletion.hasLiveSubtree(subjectFuncId)) {
        services.ruleFiring.set(ruleFuncId, RuleFiringState.DidNotFire);
        services.ruleCompletion.setWatcher(subjectFuncId, handle.id);
        return;
      }

      const completed =
        services.ruleFiring.get(subjectFuncId) === RuleFiringState.DidFire &&
        !services.ruleCompletion.isAbandoned(subjectFuncId);
      handle.resolve(completed ? TRUE_VALUE : FALSE_VALUE);
    }
  }

  /**
   * Register the core host functions into `registry`.
   *
   * @param registry - Host-function registry the program's `HOST_CALL`
   *   operands resolve against.
   */
  export function registerCoreHostFunctions(registry: HostFunctionRegistry): void {
    registry.register(new OpAddNumber());
  }

  /**
   * Register the core host actions into `registry`.
   *
   * @param registry - Host-action registry the program's `HOST_ACTION_CALL`
   *   operands resolve against.
   */
  export function registerCoreHostActions(registry: HostActionRegistry): void {
    registry.register(new OtherwiseTrigger());
    registry.register(new RuleTrigger());
  }
}
