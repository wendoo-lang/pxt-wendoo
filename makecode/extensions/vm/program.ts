/**
 * The loaded program: the decoded form of one binary program artifact, held in
 * the shapes the dispatch loop and the brain runtime address.
 */
namespace wendoo {
  /** Variable-init entry meaning the slot starts holding no value. */
  export const NO_VARIABLE_INIT = -1;

  /** Function-table entry meaning the function takes no injected context struct. */
  export const NO_INJECT_CTX = -1;

  /** One compiled function body. */
  export class FunctionBytecode {
    /** Instructions in program-counter order. */
    code: Instr[];
    /** Number of leading local slots populated from call arguments. */
    numParams: number;
    /** Total local slots on a frame of this function, params included. */
    numLocals: number;
    /** Type-table index of the injected context struct, or {@link NO_INJECT_CTX}. */
    injectCtxTypeIdx: number;

    constructor(code: Instr[], numParams: number, numLocals: number, injectCtxTypeIdx: number) {
      this.code = code;
      this.numParams = numParams;
      this.numLocals = numLocals;
      this.injectCtxTypeIdx = injectCtxTypeIdx;
    }
  }

  /** Atom-id value of a type-table entry that is not an atom entry. */
  export const NO_TYPE_ATOM = -1;

  /**
   * One program type-table entry, kept as the tag byte it was encoded with.
   * Type identity travels by table index; an atom entry additionally carries
   * the stable atom id it was encoded with and the typeId the decoding
   * runtime's registry resolved it to, and a program-local struct or enum
   * entry carries the typeId reconstructed from its embedded name.
   */
  export class ProgramTypeEntry {
    /** Wire tag of the entry kind. */
    tag: number;
    /** Stable type-atom id of an atom entry, or {@link NO_TYPE_ATOM}. */
    atomId: number;
    /**
     * TypeId of the entry's type: registry-resolved for an atom entry (`""`
     * for a core atom the registry does not carry), reconstructed from the
     * embedded name for a program-local struct or enum entry, and `""` for
     * every other entry kind.
     */
    typeId: string;
    /** Symbol keys of a program-local enum entry, in ordinal order; empty on every other entry kind. */
    enumSymbols: string[];

    constructor(tag: number) {
      this.tag = tag;
      this.atomId = NO_TYPE_ATOM;
      this.typeId = "";
      this.enumSymbols = [];
    }
  }

  /** One bytecode-bound action and its optional lifecycle hook function ids. */
  export class BytecodeAction {
    /** Function id of the action body. */
    entryFuncId: number;
    /** Function id run once per call site on first activation, or -1. */
    initializerFuncId: number;
    /** Function id run on every page activation, or -1. */
    activationFuncId: number;
    /** Function id run on every page deactivation, or -1. */
    deactivationFuncId: number;

    constructor(entryFuncId: number, initializerFuncId: number, activationFuncId: number, deactivationFuncId: number) {
      this.entryFuncId = entryFuncId;
      this.initializerFuncId = initializerFuncId;
      this.activationFuncId = activationFuncId;
      this.deactivationFuncId = deactivationFuncId;
    }
  }

  /** One registered System: its brain-global store slot and lifecycle function ids. */
  export class SystemRegistration {
    /** Authoring name of the System. */
    name: string;
    /** Slot in the brain-global System store. */
    storeSlot: number;
    /** Function id of the startup initializer, or -1. */
    initFuncId: number;
    /** Function id of the per-think tick, or -1. */
    thinkFuncId: number;

    constructor(name: string, storeSlot: number, initFuncId: number, thinkFuncId: number) {
      this.name = name;
      this.storeSlot = storeSlot;
      this.initFuncId = initFuncId;
      this.thinkFuncId = thinkFuncId;
    }
  }

  /** One action call site on a page, keyed by the call-site id the bytecode passes. */
  export class ActionCallSite {
    /** True when the site dispatches a host-bound action by stable action id. */
    isHostBinding: boolean;
    /** Call-site id keying per-callsite state. */
    callSiteId: number;
    /** Stable host action id, or the program-local bytecode action slot. */
    id: number;

    constructor(isHostBinding: boolean, callSiteId: number, id: number) {
      this.isHostBinding = isHostBinding;
      this.callSiteId = callSiteId;
      this.id = id;
    }
  }

  /** Linker-produced metadata for one page. */
  export class PageMetadata {
    /** Zero-based position of the page in the program. */
    pageIndex: number;
    /** Stable page identifier. */
    pageId: string;
    /** Function ids of the page's root rules, in document order. */
    rootRuleFuncIds: number[];
    /** Action call sites the page activates, in linker order. */
    actionCallSites: ActionCallSite[];

    constructor(pageIndex: number, pageId: string, rootRuleFuncIds: number[], actionCallSites: ActionCallSite[]) {
      this.pageIndex = pageIndex;
      this.pageId = pageId;
      this.rootRuleFuncIds = rootRuleFuncIds;
      this.actionCallSites = actionCallSites;
    }
  }

  /**
   * A decoded, linked brain program: the executable functions, the constant
   * pools they index, the variable table, the rule tables, and the page
   * metadata the brain runtime activates.
   */
  export class Program {
    /** Compiled functions, indexed by function id. */
    functions: FunctionBytecode[] = [];
    /** Numeric constant pool addressed by `PUSH_CONST_NUM`. */
    constNumbers: number[] = [];
    /** String constant pool addressed by `PUSH_CONST_STR`. */
    constStrings: string[] = [];
    /** Residual constant pool addressed by `PUSH_CONST_VAL`. */
    constValues: Value[] = [];
    /** Program type table; entries are addressed by index. */
    types: ProgramTypeEntry[] = [];
    /** Brain-global variable names, indexed by slot id. */
    variableNames: string[] = [];
    /** Per slot, the `constValues` index of its starting value, or {@link NO_VARIABLE_INIT}. */
    variableInitValues: number[] = [];
    /** Bytecode-bound actions, indexed by action slot. */
    actions: BytecodeAction[] = [];
    /** Function ids that are rule entry points. */
    ruleFuncIds: number[] = [];
    /** Rule funcIds that have a parent rule, parallel to {@link ruleParents}. */
    ruleChildren: number[] = [];
    /** Parent rule funcId of the entry at the same index in {@link ruleChildren}. */
    ruleParents: number[] = [];
    /** Registered Systems, in registration order. */
    systems: SystemRegistration[] = [];
    /** Page metadata, in page order. */
    pages: PageMetadata[] = [];

    constructor() {}

    /**
     * Whether `funcId` appears in {@link Program.ruleFuncIds}, the table of
     * rule entry points.
     *
     * @param funcId - Function id to test.
     */
    isRuleFunc(funcId: number): boolean {
      for (let i = 0; i < this.ruleFuncIds.length; i++) {
        if (this.ruleFuncIds[i] === funcId) {
          return true;
        }
      }
      return false;
    }

    /**
     * The parent rule of `ruleFuncId`, or -1 for a root rule and for a
     * funcId the ancestor table does not declare.
     *
     * @param ruleFuncId - Rule funcId to resolve.
     */
    ruleParentFuncId(ruleFuncId: number): number {
      for (let i = 0; i < this.ruleChildren.length; i++) {
        if (this.ruleChildren[i] === ruleFuncId) {
          return this.ruleParents[i];
        }
      }
      return NO_RULE;
    }

    /**
     * The rule directly above `ruleFuncId` at its own nesting level, or -1
     * when it is the first rule at that level. A child rule resolves against
     * its siblings under the same parent; a root rule against its page's
     * root-rule run.
     *
     * @param ruleFuncId - Rule funcId whose subject is wanted.
     */
    precedingSiblingRuleFuncId(ruleFuncId: number): number {
      const parent = this.ruleParentFuncId(ruleFuncId);
      if (parent !== NO_RULE) {
        let best = NO_RULE;
        for (let i = 0; i < this.ruleChildren.length; i++) {
          const candidate = this.ruleChildren[i];
          if (candidate >= ruleFuncId || this.ruleParents[i] !== parent) {
            continue;
          }
          if (best === NO_RULE || candidate > best) {
            best = candidate;
          }
        }
        return best;
      }
      for (let p = 0; p < this.pages.length; p++) {
        const roots = this.pages[p].rootRuleFuncIds;
        for (let r = 0; r < roots.length; r++) {
          if (roots[r] !== ruleFuncId) {
            continue;
          }
          return r === 0 ? NO_RULE : roots[r - 1];
        }
      }
      return NO_RULE;
    }
  }

  /** Rule-funcId sentinel meaning "no rule". `0` is a valid rule funcId. */
  export const NO_RULE = -1;

  /** Call-site-id sentinel meaning "no call site is bound". */
  export const NO_CALL_SITE = -1;
}
