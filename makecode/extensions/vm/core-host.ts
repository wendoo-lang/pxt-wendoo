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
    /** Implicit conversion of a number to its decimal string form. */
    ConvNumberToString = 42,
    /** Implicit conversion of a decimal string to a number; unparseable text converts to 0. */
    ConvStringToNumber = 43,
    /** Implicit conversion of a number to a boolean: nonzero converts true. */
    ConvNumberToBoolean = 44,
    /** Implicit conversion of a boolean to a number: 1 for true, 0 for false. */
    ConvBooleanToNumber = 45,
    /** Implicit conversion of a string to a boolean: true unless the string trims to empty. */
    ConvStringToBoolean = 46,
    /** Implicit conversion of a boolean to the string `true` or `false`. */
    ConvBooleanToString = 47,
    /** Read a brain variable by name. */
    BrainContextGetVariable = 48,
    /** Write a brain variable by name. */
    BrainContextSetVariable = 49,
    /** Read a rule variable by name, on the running rule or the nearest rule above it. */
    RuleContextGetVariable = 50,
    /** Write a rule variable by name, on the running rule. */
    RuleContextSetVariable = 51,
  }

  /** Argument-buffer position of a context variable function's variable name, after its method receiver. */
  const CONTEXT_VARIABLE_NAME_SLOT = 1;

  /** Argument-buffer position of a context variable write's value, after the variable name. */
  const CONTEXT_VARIABLE_VALUE_SLOT = 2;

  /** Which variables a {@link ContextVariableRead} or {@link ContextVariableWrite} reaches. */
  enum ContextVariableScope {
    /** The brain's variables, by name. */
    Brain = 0,
    /** The running rule's variables, by name. */
    Rule = 1,
  }

  /**
   * `BrainContext.getVariable` and `RuleContext.getVariable`: the variable
   * named by the name slot -- a brain variable, or a rule variable on the
   * running rule or the nearest rule above it -- or nil when none holds it.
   */
  class ContextVariableRead extends HostFunction {
    private scope: ContextVariableScope;

    constructor(scope: ContextVariableScope) {
      super();
      this.scope = scope;
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      const name = args[CONTEXT_VARIABLE_NAME_SLOT].str;
      if (this.scope === ContextVariableScope.Brain) {
        return ctx.variables.getByName(name);
      }
      return ctx.services.ruleVars.getByName(ctx.currentRuleFuncId, name);
    }
  }

  /**
   * `BrainContext.setVariable` and `RuleContext.setVariable`: write the value
   * slot to the variable named by the name slot -- a brain variable, or a
   * rule variable on the running rule, written nowhere while no rule runs --
   * and evaluate to nil.
   */
  class ContextVariableWrite extends HostFunction {
    private scope: ContextVariableScope;

    constructor(scope: ContextVariableScope) {
      super();
      this.scope = scope;
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      const name = args[CONTEXT_VARIABLE_NAME_SLOT].str;
      const value = args[CONTEXT_VARIABLE_VALUE_SLOT];
      if (this.scope === ContextVariableScope.Brain) {
        ctx.variables.setByName(name, value);
      } else {
        ctx.services.ruleVars.setByName(ctx.currentRuleFuncId, name, value);
      }
      return NIL_VALUE;
    }
  }

  /** Stable action ids of the core host actions. */
  export enum CoreActionId {
    /** The page-change actuator. */
    SwitchPage = 0,
    /** The page-restart actuator. */
    RestartPage = 1,
    /** The random-number sensor. */
    Random = 3,
    /** The page-activation edge sensor. */
    OnPageEntered = 4,
    /** The timer sensor. */
    Timeout = 5,
    /** The active page's identity sensor. */
    CurrentPage = 6,
    /** The most recently deactivated page's identity sensor. */
    PreviousPage = 7,
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

  /** Which conversion a {@link TypeConversion} binding computes. */
  enum ConversionKind {
    NumberToString = 0,
    StringToNumber = 1,
    NumberToBoolean = 2,
    BooleanToNumber = 3,
    StringToBoolean = 4,
    BooleanToString = 5,
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
    private numerics: F64Numerics;

    constructor(kind: NumberArithmeticKind, numerics: F64Numerics) {
      super();
      this.kind = kind;
      this.numerics = numerics;
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
          return this.numerics.round(a + b);
        case NumberArithmeticKind.Subtract:
          return this.numerics.round(a - b);
        case NumberArithmeticKind.Multiply:
          return this.numerics.round(a * b);
        default:
          return this.numerics.round(a / b);
      }
    }
  }

  /** `negative` of a number operand. A bad operand and a result that is not a number both evaluate nil. */
  class OpNegateNumber extends HostFunction {
    private numerics: F64Numerics;

    constructor(numerics: F64Numerics) {
      super();
      this.numerics = numerics;
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      if (!isValidNumberArg(args, 0)) {
        return NIL_VALUE;
      }
      const result = this.numerics.round(-args[0].num);
      return isNotANumber(result) ? NIL_VALUE : mkNumber(result);
    }
  }

  /** Ordering or equality over two number operands. A bad operand compares false. */
  class NumberComparison extends HostFunction {
    private kind: NumberComparisonKind;

    constructor(kind: NumberComparisonKind) {
      super();
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

    constructor(kind: BooleanLogicKind) {
      super();
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
      super();
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

    constructor(kind: StringComparisonKind) {
      super();
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

    constructor(kind: NilEqualityKind) {
      super();
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
   * An implicit conversion between two core primitive types, compiled in
   * where a value's static type mismatches the slot, operand, or assignment
   * target consuming it. The operand's source-typed payload is read
   * unchecked, so an operand of another kind converts its payload field's
   * default.
   */
  class TypeConversion extends HostFunction {
    private kind: ConversionKind;
    private numerics: F64Numerics;

    constructor(kind: ConversionKind, numerics: F64Numerics) {
      super();
      this.kind = kind;
      this.numerics = numerics;
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      const operand = argAt(args, 0);
      switch (this.kind) {
        case ConversionKind.NumberToString:
          return mkString(this.numerics.formatNumber(operand.num));
        case ConversionKind.StringToNumber:
          return mkNumber(this.numerics.parseNumber(operand.str));
        case ConversionKind.NumberToBoolean:
          return mkBoolean(operand.num !== 0);
        case ConversionKind.BooleanToNumber:
          return mkNumber(operand.b ? 1 : 0);
        case ConversionKind.StringToBoolean:
          return mkBoolean(operand.str.trim().length > 0);
        default:
          return mkString(operand.b ? "true" : "false");
      }
    }
  }

  /** Argument slot of the 1-based page number `switch page` accepts. */
  const SWITCH_PAGE_NUMBER_SLOT = 0;

  /** Argument slot of the stable page id `switch page` accepts. */
  const SWITCH_PAGE_STRING_SLOT = 1;

  /**
   * `switch page`: makes another page the active one from the next think. A
   * number argument names the page by its 1-based page number, a string
   * argument by its stable page id, and an argument buffer carrying neither
   * restarts the active page.
   */
  class SwitchPageActuator extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const pages = ctx.services.pages;
      const numberArg = argAt(args, SWITCH_PAGE_NUMBER_SLOT);
      if (numberArg.t === ValueTag.Number) {
        pages.requestPageChange(numberArg.num - 1);
        return VOID_VALUE;
      }
      const stringArg = argAt(args, SWITCH_PAGE_STRING_SLOT);
      if (stringArg.t === ValueTag.String) {
        pages.requestPageChangeByPageId(stringArg.str);
        return VOID_VALUE;
      }
      pages.requestPageRestart();
      return VOID_VALUE;
    }
  }

  /**
   * `restart page`: cancels the active page's fibers so its root rules
   * respawn at the next think. The page is not deactivated, so no activation
   * hook runs again and every call site keeps the state it holds.
   */
  class RestartPageActuator extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      ctx.services.pages.requestPageRestart();
      return VOID_VALUE;
    }
  }

  /**
   * `random number`: the next number of the random-number stream, from 0 up
   * to but not including 1, rounded through the numerics.
   */
  class RandomSensor extends HostActionBinding {
    private numerics: F64Numerics;
    private rng: RngServices;

    constructor(numerics: F64Numerics, rng: RngServices) {
      super(false);
      this.numerics = numerics;
      this.rng = rng;
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return mkNumber(this.numerics.round(this.rng.next()));
    }
  }

  /** Seconds a timer runs when its delay slot is empty. */
  const TIMEOUT_DEFAULT_DELAY_SECONDS = 1;

  /** Argument slot of the timer's optional anonymous delay, in seconds. */
  const TIMEOUT_DELAY_SLOT = 0;

  /** Field of a timer's call-site state holding the scheduled time it fires at, in milliseconds. */
  const TIMEOUT_FIRE_TIME_FIELD = 0;

  /** Field of a timer's call-site state holding the tick it was last read on. */
  const TIMEOUT_LAST_TICK_FIELD = 1;

  /**
   * Last-read tick of a timer not yet read: no tick follows it, so the first
   * read arms the timer and does not fire it.
   */
  const TIMEOUT_UNREAD_TICK = -2;

  /** The call-site state of a timer not yet read: a list of its fire time and its last-read tick. */
  function unreadTimeoutState(): Value {
    return mkList("", [mkNumber(0), mkNumber(TIMEOUT_UNREAD_TICK)]);
  }

  /**
   * `timeout`: a timer, one per call site, reading true once its delay -- an
   * optional anonymous number of seconds, one when the slot is empty -- has
   * passed, then running the delay again from that read.
   *
   * A read arms the timer to fire the delay after the read's time, and reads
   * false, when the call site was not read on the tick before: on its first
   * read, after its page is entered again, and after any tick its rule did
   * not run. Entering the site's page also returns it to unread. A delay
   * slot holding a not-a-number or a value that is no number reads false and
   * leaves the timer as it was.
   */
  class TimeoutSensor extends HostActionBinding {
    constructor() {
      super(false);
    }

    onPageEntered(ctx: ExecutionContext): void {
      ctx.services.callsite.setHostState(ctx.currentCallSiteId, unreadTimeoutState());
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      let delay = TIMEOUT_DEFAULT_DELAY_SECONDS;
      const delayArg = argAt(args, TIMEOUT_DELAY_SLOT);
      if (delayArg.t !== ValueTag.Nil) {
        if (delayArg.t !== ValueTag.Number || isNotANumber(delayArg.num)) {
          return FALSE_VALUE;
        }
        delay = delayArg.num;
      }

      const callsite = ctx.services.callsite;
      let state = callsite.getHostState(ctx.currentCallSiteId);
      if (!state) {
        state = unreadTimeoutState();
        callsite.setHostState(ctx.currentCallSiteId, state);
      }

      let fireTime = state.fields[TIMEOUT_FIRE_TIME_FIELD].num;
      const lastTick = state.fields[TIMEOUT_LAST_TICK_FIELD].num;
      let fired = false;
      if (ctx.currentTick !== lastTick + 1) {
        fireTime = ctx.time + delay * 1000;
      }
      if (ctx.time >= fireTime) {
        fired = true;
        fireTime = ctx.time + delay * 1000;
      }
      state.fields[TIMEOUT_FIRE_TIME_FIELD] = mkNumber(fireTime);
      state.fields[TIMEOUT_LAST_TICK_FIELD] = mkNumber(ctx.currentTick);
      return fired ? TRUE_VALUE : FALSE_VALUE;
    }
  }

  /** `current page`: the stable page id of the active page. */
  class CurrentPageSensor extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return mkString(ctx.services.pages.getCurrentPageId());
    }
  }

  /**
   * `previous page`: the stable page id of the most recently deactivated
   * page, which reads the active page's id while no page has been deactivated
   * yet.
   */
  class PreviousPageSensor extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return mkString(ctx.services.pages.getPreviousPageId());
    }
  }

  /**
   * `on page entered`: true on the first read at its call site after the
   * site's page was activated, and false on every read after that. A page
   * restart does not re-arm it.
   */
  class OnPageEnteredSensor extends HostActionBinding {
    constructor() {
      super(false);
    }

    onPageEntered(ctx: ExecutionContext): void {
      ctx.services.callsite.setHostState(ctx.currentCallSiteId, FALSE_VALUE);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const state = ctx.services.callsite.getHostState(ctx.currentCallSiteId);
      if (state && state.t === ValueTag.Boolean && !state.b) {
        ctx.services.callsite.setHostState(ctx.currentCallSiteId, TRUE_VALUE);
        return TRUE_VALUE;
      }
      return FALSE_VALUE;
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
      super(false);
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
      super(true);
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
   * @param numerics - Numeric semantics the arithmetic and the number/text
   *   conversions compute their results through.
   */
  export function registerCoreHostFunctions(registry: HostFunctionRegistry, numerics: F64Numerics): void {
    registry.register(CoreFuncId.OpAddNumber, new NumberArithmetic(NumberArithmeticKind.Add, numerics));
    registry.register(CoreFuncId.OpSubtractNumber, new NumberArithmetic(NumberArithmeticKind.Subtract, numerics));
    registry.register(CoreFuncId.OpMultiplyNumber, new NumberArithmetic(NumberArithmeticKind.Multiply, numerics));
    registry.register(CoreFuncId.OpDivideNumber, new NumberArithmetic(NumberArithmeticKind.Divide, numerics));
    registry.register(CoreFuncId.OpNegateNumber, new OpNegateNumber(numerics));

    registry.register(CoreFuncId.OpEqualToNumber, new NumberComparison(NumberComparisonKind.EqualTo));
    registry.register(CoreFuncId.OpNotEqualToNumber, new NumberComparison(NumberComparisonKind.NotEqualTo));
    registry.register(CoreFuncId.OpLessThanNumber, new NumberComparison(NumberComparisonKind.LessThan));
    registry.register(
      CoreFuncId.OpLessThanOrEqualToNumber,
      new NumberComparison(NumberComparisonKind.LessThanOrEqualTo)
    );
    registry.register(CoreFuncId.OpGreaterThanNumber, new NumberComparison(NumberComparisonKind.GreaterThan));
    registry.register(
      CoreFuncId.OpGreaterThanOrEqualToNumber,
      new NumberComparison(NumberComparisonKind.GreaterThanOrEqualTo)
    );

    registry.register(CoreFuncId.OpNotBoolean, new BooleanLogic(BooleanLogicKind.Not));
    registry.register(CoreFuncId.OpEqualToBoolean, new BooleanLogic(BooleanLogicKind.EqualTo));
    registry.register(CoreFuncId.OpNotEqualToBoolean, new BooleanLogic(BooleanLogicKind.NotEqualTo));

    registry.register(CoreFuncId.OpAddString, new OpAddString());
    registry.register(CoreFuncId.OpEqualToString, new StringComparison(StringComparisonKind.EqualTo));
    registry.register(CoreFuncId.OpNotEqualToString, new StringComparison(StringComparisonKind.NotEqualTo));

    registry.register(CoreFuncId.OpEqualToNil, new NilEquality(NilEqualityKind.Always));
    registry.register(CoreFuncId.OpNotEqualToNil, new NilEquality(NilEqualityKind.Never));
    registry.register(CoreFuncId.OpNotNil, new NilEquality(NilEqualityKind.Always));
    registry.register(CoreFuncId.OpEqualToNumberNil, new NilEquality(NilEqualityKind.LeftIsNil));
    registry.register(CoreFuncId.OpEqualToNilNumber, new NilEquality(NilEqualityKind.RightIsNil));
    registry.register(CoreFuncId.OpNotEqualToNumberNil, new NilEquality(NilEqualityKind.LeftIsNotNil));
    registry.register(CoreFuncId.OpNotEqualToNilNumber, new NilEquality(NilEqualityKind.RightIsNotNil));
    registry.register(CoreFuncId.OpEqualToBooleanNil, new NilEquality(NilEqualityKind.LeftIsNil));
    registry.register(CoreFuncId.OpEqualToNilBoolean, new NilEquality(NilEqualityKind.RightIsNil));
    registry.register(CoreFuncId.OpNotEqualToBooleanNil, new NilEquality(NilEqualityKind.LeftIsNotNil));
    registry.register(CoreFuncId.OpNotEqualToNilBoolean, new NilEquality(NilEqualityKind.RightIsNotNil));
    registry.register(CoreFuncId.OpEqualToStringNil, new NilEquality(NilEqualityKind.LeftIsNil));
    registry.register(CoreFuncId.OpEqualToNilString, new NilEquality(NilEqualityKind.RightIsNil));
    registry.register(CoreFuncId.OpNotEqualToStringNil, new NilEquality(NilEqualityKind.LeftIsNotNil));
    registry.register(CoreFuncId.OpNotEqualToNilString, new NilEquality(NilEqualityKind.RightIsNotNil));

    registry.register(CoreFuncId.ConvNumberToString, new TypeConversion(ConversionKind.NumberToString, numerics));
    registry.register(CoreFuncId.ConvStringToNumber, new TypeConversion(ConversionKind.StringToNumber, numerics));
    registry.register(CoreFuncId.ConvNumberToBoolean, new TypeConversion(ConversionKind.NumberToBoolean, numerics));
    registry.register(CoreFuncId.ConvBooleanToNumber, new TypeConversion(ConversionKind.BooleanToNumber, numerics));
    registry.register(CoreFuncId.ConvStringToBoolean, new TypeConversion(ConversionKind.StringToBoolean, numerics));
    registry.register(CoreFuncId.ConvBooleanToString, new TypeConversion(ConversionKind.BooleanToString, numerics));

    registry.register(CoreFuncId.BrainContextGetVariable, new ContextVariableRead(ContextVariableScope.Brain));
    registry.register(CoreFuncId.BrainContextSetVariable, new ContextVariableWrite(ContextVariableScope.Brain));
    registry.register(CoreFuncId.RuleContextGetVariable, new ContextVariableRead(ContextVariableScope.Rule));
    registry.register(CoreFuncId.RuleContextSetVariable, new ContextVariableWrite(ContextVariableScope.Rule));
  }

  /**
   * Register the core host actions into `registry`.
   *
   * @param registry - Host-action registry the program's `HOST_ACTION_CALL`
   *   operands resolve against.
   * @param numerics - Numeric semantics the random-number sensor rounds its
   *   readings through; pass the instance the core host functions compute
   *   through.
   * @param rng - Random-number stream the random-number sensor draws from.
   */
  export function registerCoreHostActions(registry: HostActionRegistry, numerics: F64Numerics, rng: RngServices): void {
    registry.register(CoreActionId.SwitchPage, "switch-page", new SwitchPageActuator());
    registry.register(CoreActionId.RestartPage, "restart-page", new RestartPageActuator());
    registry.register(CoreActionId.Random, "random", new RandomSensor(numerics, rng));
    registry.register(CoreActionId.OnPageEntered, "on-page-entered", new OnPageEnteredSensor());
    registry.register(CoreActionId.Timeout, "sensor.timeout", new TimeoutSensor());
    registry.register(CoreActionId.CurrentPage, "current-page", new CurrentPageSensor());
    registry.register(CoreActionId.PreviousPage, "previous-page", new PreviousPageSensor());
    registry.register(CoreActionId.Otherwise, "otherwise", new OtherwiseTrigger());
    registry.register(CoreActionId.RuleTrigger, "rule-trigger", new RuleTrigger());
  }
}
