/**
 * The core host surface: the host functions and host actions core owns. Core
 * ids run below 1024; a target registers its own at and above that base.
 */
namespace wendoo {
  /** Stable funcIds of the core host functions. */
  export enum CoreFuncId {
    /** `not` over a boolean. */
    OpNotBoolean = 2,
    /** Number `+` number. */
    OpAddNumber = 3,
    /** Number `-` number. */
    OpSubtractNumber = 4,
    /** Number `*` number. */
    OpMultiplyNumber = 5,
    /** Number `/` number. */
    OpDivideNumber = 6,
    /** `negative` of a number. */
    OpNegateNumber = 9,
    /** Boolean `==` boolean. */
    OpEqualToBoolean = 16,
    /** Boolean `!=` boolean. */
    OpNotEqualToBoolean = 17,
    /** Number `==` number. */
    OpEqualToNumber = 18,
    /** Number `!=` number. */
    OpNotEqualToNumber = 19,
    /** Number `<` number. */
    OpLessThanNumber = 20,
    /** Number `<=` number. */
    OpLessThanOrEqualToNumber = 21,
    /** Number `>` number. */
    OpGreaterThanNumber = 22,
    /** Number `>=` number. */
    OpGreaterThanOrEqualToNumber = 23,
    /** String `+` string: concatenation. */
    OpAddString = 24,
    /** String `==` string. */
    OpEqualToString = 25,
    /** String `!=` string. */
    OpNotEqualToString = 26,
    /** Nil `==` nil. */
    OpEqualToNil = 27,
    /** Nil `!=` nil. */
    OpNotEqualToNil = 28,
    /** `not` over nil. */
    OpNotNil = 29,
    /** Number `==` nil. */
    OpEqualToNumberNil = 30,
    /** Nil `==` number. */
    OpEqualToNilNumber = 31,
    /** Number `!=` nil. */
    OpNotEqualToNumberNil = 32,
    /** Nil `!=` number. */
    OpNotEqualToNilNumber = 33,
    /** Boolean `==` nil. */
    OpEqualToBooleanNil = 34,
    /** Nil `==` boolean. */
    OpEqualToNilBoolean = 35,
    /** Boolean `!=` nil. */
    OpNotEqualToBooleanNil = 36,
    /** Nil `!=` boolean. */
    OpNotEqualToNilBoolean = 37,
    /** String `==` nil. */
    OpEqualToStringNil = 38,
    /** Nil `==` string. */
    OpEqualToNilString = 39,
    /** String `!=` nil. */
    OpNotEqualToStringNil = 40,
    /** Nil `!=` string. */
    OpNotEqualToNilString = 41,
  }

  /** Stable action ids of the core host actions. */
  export enum CoreActionId {
    /** The `otherwise` chain sensor. */
    Otherwise = 8,
    /** The THEN trigger's arming read. */
    RuleTrigger = 9,
  }

  /** Which arithmetic a {@link NumberArithmetic} binding computes. */
  enum NumberArithmeticKind {
    Add = 0,
    Subtract = 1,
    Multiply = 2,
    Divide = 3,
  }

  /** Which comparison a {@link NumberComparison} binding computes. */
  enum NumberComparisonKind {
    EqualTo = 0,
    NotEqualTo = 1,
    LessThan = 2,
    LessThanOrEqualTo = 3,
    GreaterThan = 4,
    GreaterThanOrEqualTo = 5,
  }

  /** Which operator a {@link BooleanLogic} binding computes. */
  enum BooleanLogicKind {
    Not = 0,
    EqualTo = 1,
    NotEqualTo = 2,
  }

  /** Which comparison a {@link StringComparison} binding computes. */
  enum StringComparisonKind {
    EqualTo = 0,
    NotEqualTo = 1,
  }

  /** What a {@link NilEquality} binding answers. */
  enum NilEqualityKind {
    /** True, whatever the operands carry. */
    Always = 0,
    /** False, whatever the operands carry. */
    Never = 1,
    /** Whether slot 0 carries nil. */
    LeftIsNil = 2,
    /** Whether slot 1 carries nil. */
    RightIsNil = 3,
    /** Whether slot 0 carries anything other than nil. */
    LeftIsNotNil = 4,
    /** Whether slot 1 carries anything other than nil. */
    RightIsNotNil = 5,
  }

  /**
   * The value in `args[slot]`, or nil for a slot past the end of the buffer.
   *
   * @param args - Positional argument buffer.
   * @param slot - Slot index to read.
   */
  function argAt(args: Value[], slot: number): Value {
    if (slot < 0 || slot >= args.length) {
      return NIL_VALUE;
    }
    return args[slot];
  }

  /**
   * Whether `args[slot]` carries a number that is not a NaN. A slot past the
   * end of the buffer, a slot of another kind, and a NaN all read false.
   *
   * @param args - Positional argument buffer.
   * @param slot - Slot index to test.
   */
  function isValidNumberArg(args: Value[], slot: number): boolean {
    const v = argAt(args, slot);
    return v.t === ValueTag.Number && !isNotANumber(v.num);
  }

  /**
   * Whether `args[slot]` carries a string. A slot past the end of the buffer
   * and a slot of another kind both read false.
   *
   * @param args - Positional argument buffer.
   * @param slot - Slot index to test.
   */
  function isValidStringArg(args: Value[], slot: number): boolean {
    return argAt(args, slot).t === ValueTag.String;
  }

  /**
   * Binary arithmetic over two number operands: `+`, `-`, `*` and `/`. A bad
   * operand evaluates nil, as does a result that is not a number, which
   * includes every division by zero.
   */
  class NumberArithmetic extends HostFunction {
    private kind: NumberArithmeticKind;

    constructor(fnId: number, kind: NumberArithmeticKind) {
      super(fnId);
      this.kind = kind;
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      if (!isValidNumberArg(args, 0) || !isValidNumberArg(args, 1)) {
        return NIL_VALUE;
      }
      const a = args[0].num;
      const b = args[1].num;
      if (this.kind === NumberArithmeticKind.Divide && b === 0) {
        return NIL_VALUE;
      }
      const result = this.apply(a, b);
      return isNotANumber(result) ? NIL_VALUE : mkNumber(result);
    }

    private apply(a: number, b: number): number {
      switch (this.kind) {
        case NumberArithmeticKind.Add:
          return a + b;
        case NumberArithmeticKind.Subtract:
          return a - b;
        case NumberArithmeticKind.Multiply:
          return a * b;
        default:
          return a / b;
      }
    }
  }

  /** `negative` of a number operand. A bad operand and a result that is not a number both evaluate nil. */
  class OpNegateNumber extends HostFunction {
    constructor() {
      super(CoreFuncId.OpNegateNumber);
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      if (!isValidNumberArg(args, 0)) {
        return NIL_VALUE;
      }
      const result = -args[0].num;
      return isNotANumber(result) ? NIL_VALUE : mkNumber(result);
    }
  }

  /** Ordering or equality over two number operands. A bad operand compares false. */
  class NumberComparison extends HostFunction {
    private kind: NumberComparisonKind;

    constructor(fnId: number, kind: NumberComparisonKind) {
      super(fnId);
      this.kind = kind;
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      if (!isValidNumberArg(args, 0) || !isValidNumberArg(args, 1)) {
        return FALSE_VALUE;
      }
      return mkBoolean(this.holds(args[0].num, args[1].num));
    }

    private holds(a: number, b: number): boolean {
      switch (this.kind) {
        case NumberComparisonKind.EqualTo:
          return a === b;
        case NumberComparisonKind.NotEqualTo:
          return a !== b;
        case NumberComparisonKind.LessThan:
          return a < b;
        case NumberComparisonKind.LessThanOrEqualTo:
          return a <= b;
        case NumberComparisonKind.GreaterThan:
          return a > b;
        default:
          return a >= b;
      }
    }
  }

  /**
   * `not`, `==` or `!=` over boolean operands. Each operand's truth payload is
   * read unchecked, so an operand of another kind reads false.
   */
  class BooleanLogic extends HostFunction {
    private kind: BooleanLogicKind;

    constructor(fnId: number, kind: BooleanLogicKind) {
      super(fnId);
      this.kind = kind;
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      const a = argAt(args, 0).b;
      switch (this.kind) {
        case BooleanLogicKind.Not:
          return mkBoolean(!a);
        case BooleanLogicKind.EqualTo:
          return mkBoolean(a === argAt(args, 1).b);
        default:
          return mkBoolean(a !== argAt(args, 1).b);
      }
    }
  }

  /** `+` over two string operands: concatenation. A bad operand evaluates nil. */
  class OpAddString extends HostFunction {
    constructor() {
      super(CoreFuncId.OpAddString);
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      if (!isValidStringArg(args, 0) || !isValidStringArg(args, 1)) {
        return NIL_VALUE;
      }
      return mkString(args[0].str + args[1].str);
    }
  }

  /** Equality over two string operands. A bad operand compares false. */
  class StringComparison extends HostFunction {
    private kind: StringComparisonKind;

    constructor(fnId: number, kind: StringComparisonKind) {
      super(fnId);
      this.kind = kind;
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      if (!isValidStringArg(args, 0) || !isValidStringArg(args, 1)) {
        return FALSE_VALUE;
      }
      const equal = args[0].str === args[1].str;
      return mkBoolean(this.kind === StringComparisonKind.EqualTo ? equal : !equal);
    }
  }

  /**
   * An equality overload with a nil operand. Nil compares equal to nil and
   * unequal to nothing, so each overload either answers a constant or tests
   * the one operand whose static type admits a value other than nil.
   */
  class NilEquality extends HostFunction {
    private kind: NilEqualityKind;

    constructor(fnId: number, kind: NilEqualityKind) {
      super(fnId);
      this.kind = kind;
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      switch (this.kind) {
        case NilEqualityKind.Always:
          return TRUE_VALUE;
        case NilEqualityKind.Never:
          return FALSE_VALUE;
        case NilEqualityKind.LeftIsNil:
          return mkBoolean(argAt(args, 0).t === ValueTag.Nil);
        case NilEqualityKind.RightIsNil:
          return mkBoolean(argAt(args, 1).t === ValueTag.Nil);
        case NilEqualityKind.LeftIsNotNil:
          return mkBoolean(argAt(args, 0).t !== ValueTag.Nil);
        default:
          return mkBoolean(argAt(args, 1).t !== ValueTag.Nil);
      }
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
    registry.register(new NumberArithmetic(CoreFuncId.OpAddNumber, NumberArithmeticKind.Add));
    registry.register(new NumberArithmetic(CoreFuncId.OpSubtractNumber, NumberArithmeticKind.Subtract));
    registry.register(new NumberArithmetic(CoreFuncId.OpMultiplyNumber, NumberArithmeticKind.Multiply));
    registry.register(new NumberArithmetic(CoreFuncId.OpDivideNumber, NumberArithmeticKind.Divide));
    registry.register(new OpNegateNumber());

    registry.register(new NumberComparison(CoreFuncId.OpEqualToNumber, NumberComparisonKind.EqualTo));
    registry.register(new NumberComparison(CoreFuncId.OpNotEqualToNumber, NumberComparisonKind.NotEqualTo));
    registry.register(new NumberComparison(CoreFuncId.OpLessThanNumber, NumberComparisonKind.LessThan));
    registry.register(
      new NumberComparison(CoreFuncId.OpLessThanOrEqualToNumber, NumberComparisonKind.LessThanOrEqualTo)
    );
    registry.register(new NumberComparison(CoreFuncId.OpGreaterThanNumber, NumberComparisonKind.GreaterThan));
    registry.register(
      new NumberComparison(CoreFuncId.OpGreaterThanOrEqualToNumber, NumberComparisonKind.GreaterThanOrEqualTo)
    );

    registry.register(new BooleanLogic(CoreFuncId.OpNotBoolean, BooleanLogicKind.Not));
    registry.register(new BooleanLogic(CoreFuncId.OpEqualToBoolean, BooleanLogicKind.EqualTo));
    registry.register(new BooleanLogic(CoreFuncId.OpNotEqualToBoolean, BooleanLogicKind.NotEqualTo));

    registry.register(new OpAddString());
    registry.register(new StringComparison(CoreFuncId.OpEqualToString, StringComparisonKind.EqualTo));
    registry.register(new StringComparison(CoreFuncId.OpNotEqualToString, StringComparisonKind.NotEqualTo));

    registry.register(new NilEquality(CoreFuncId.OpEqualToNil, NilEqualityKind.Always));
    registry.register(new NilEquality(CoreFuncId.OpNotEqualToNil, NilEqualityKind.Never));
    registry.register(new NilEquality(CoreFuncId.OpNotNil, NilEqualityKind.Always));
    registry.register(new NilEquality(CoreFuncId.OpEqualToNumberNil, NilEqualityKind.LeftIsNil));
    registry.register(new NilEquality(CoreFuncId.OpEqualToNilNumber, NilEqualityKind.RightIsNil));
    registry.register(new NilEquality(CoreFuncId.OpNotEqualToNumberNil, NilEqualityKind.LeftIsNotNil));
    registry.register(new NilEquality(CoreFuncId.OpNotEqualToNilNumber, NilEqualityKind.RightIsNotNil));
    registry.register(new NilEquality(CoreFuncId.OpEqualToBooleanNil, NilEqualityKind.LeftIsNil));
    registry.register(new NilEquality(CoreFuncId.OpEqualToNilBoolean, NilEqualityKind.RightIsNil));
    registry.register(new NilEquality(CoreFuncId.OpNotEqualToBooleanNil, NilEqualityKind.LeftIsNotNil));
    registry.register(new NilEquality(CoreFuncId.OpNotEqualToNilBoolean, NilEqualityKind.RightIsNotNil));
    registry.register(new NilEquality(CoreFuncId.OpEqualToStringNil, NilEqualityKind.LeftIsNil));
    registry.register(new NilEquality(CoreFuncId.OpEqualToNilString, NilEqualityKind.RightIsNil));
    registry.register(new NilEquality(CoreFuncId.OpNotEqualToStringNil, NilEqualityKind.LeftIsNotNil));
    registry.register(new NilEquality(CoreFuncId.OpNotEqualToNilString, NilEqualityKind.RightIsNotNil));
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
