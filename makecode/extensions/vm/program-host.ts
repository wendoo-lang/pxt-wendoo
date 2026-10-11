/**
 * The program host: the host loop that runs compiled brains on the actors a
 * game gives them, as the single entry into every program it runs. A game
 * pairs an actor with a program by calling {@link ProgramHost.attach}, which
 * only records the request; the game's frame loop calls
 * {@link ProgramHost.drain}, and the drain alone starts, thinks, and ends
 * programs.
 */
namespace wendoo {
  /** Instructions each fiber slice of a round is granted in the sts-f64 world. */
  const STS_F64_DEFAULT_BUDGET = 1000;

  /** Values one fiber's operand stack holds at most in the sts-f64 world. */
  const STS_F64_MAX_STACK_SIZE = 4096;

  /** Pending capped async handles one program instance holds at most in the sts-f64 world. */
  const STS_F64_MAX_HANDLES = 100000;

  /**
   * The attachment of one actor a program runs on: the per-run payload its host
   * functions and actions reach through the execution context, and the
   * actor's lifecycle as the host loop sees it. A target subclasses it with
   * its actor, overriding {@link ActorAttachment.hasEnded} and
   * {@link ActorAttachment.isSameActor}.
   */
  //% hidden
  export class ActorAttachment extends HostAttachment {
    /**
     * The program host running the actor's program, assigned when a host
     * starts a program on this attachment; `undefined` until then.
     */
    host: ProgramHost = undefined;

    constructor() {
      super();
    }

    /**
     * Whether the actor is gone. The drain that first sees it gone ends the
     * actor's program without thinking it again. The base actor never ends.
     */
    hasEnded(): boolean {
      return false;
    }

    /**
     * Whether `other` is the attachment of this same actor: attaching a
     * program to an attachment ends the running program of every attachment
     * this reports as the same actor. The base compares the attachments
     * themselves.
     *
     * @param other - Attachment of the actor a program is being attached to.
     */
    isSameActor(other: ActorAttachment): boolean {
      return other === this;
    }
  }

  /**
   * The observer of one hosted program: hands every effect the program has
   * to its host's observer, and logs each fault code the program raises the
   * first time it raises it, as `wendoo program-faulted <code> <id>` through
   * {@link debugLog}.
   */
  //% hidden
  export class HostedProgramObserver extends VmObserver {
    private hostObserver: VmObserver;
    private documentId: string;
    /** The fault codes the program has raised, in the order first raised: at most one entry per {@link ErrorCode}. */
    private loggedCodes: number[] = [];

    /**
     * @param hostObserver - The program host's observer, which every effect is handed to.
     * @param documentId - Document id of the program's compiled brain, which the log line names.
     */
    constructor(hostObserver: VmObserver, documentId: string) {
      super();
      this.hostObserver = hostObserver;
      this.documentId = documentId;
    }

    onHostActionCall(actionId: number, callSiteId: number, args: Value[], result: Value): void {
      this.hostObserver.onHostActionCall(actionId, callSiteId, args, result);
    }

    onHostActionCallAsync(actionId: number, callSiteId: number, args: Value[]): void {
      this.hostObserver.onHostActionCallAsync(actionId, callSiteId, args);
    }

    onFiberFault(fiberId: number, fault: VmFault): void {
      if (this.loggedCodes.indexOf(fault.code) < 0) {
        this.loggedCodes.push(fault.code);
        debugLog(`wendoo program-faulted ${fault.code} ${this.documentId}`);
      }
      this.hostObserver.onFiberFault(fiberId, fault);
    }

    /**
     * Report `thrown`, thrown out of the program outside every fiber, as the
     * fault {@link thrownFault} makes of it, raised on no fiber.
     *
     * @param thrown - The value thrown.
     */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    onThrown(thrown: any): void {
      this.onFiberFault(NO_FIBER, thrownFault(thrown, -1, -1));
    }
  }

  /** One program running on one actor. */
  //% hidden
  export class HostedProgram {
    /** Attachment of the actor the program runs on. */
    attachment: ActorAttachment;
    /** The loaded program. */
    loaded: LoadedProgram;
    /** The program's runtime, which the host loop alone thinks. */
    runtime: BrainRuntime;
    /** The observer the program's runtime reports to. */
    observer: HostedProgramObserver;

    constructor(
      attachment: ActorAttachment,
      loaded: LoadedProgram,
      runtime: BrainRuntime,
      observer: HostedProgramObserver
    ) {
      this.attachment = attachment;
      this.loaded = loaded;
      this.runtime = runtime;
      this.observer = observer;
    }
  }

  /**
   * The host registries every program of one program run resolves against:
   * the core host functions computing in the sts-f64 world, the core host
   * actions -- the random-number sensor drawing from the platform's own
   * random numbers -- and every pack registration, drained through the
   * project's id manifest. Obtain them with {@link hostRegistries}.
   */
  //% hidden
  export class HostRegistries {
    /** Host functions a program's `HOST_CALL` operands resolve against. */
    functions: HostFunctionRegistry;
    /** Host actions a program's `HOST_ACTION_CALL` operands resolve against. */
    actions: HostActionRegistry;
    /** Struct types a program's type atoms and field hooks resolve against. */
    types: StructTypeRegistry;
    /** How many of the type registry's undeclared field accesses a program host has logged. */
    undeclaredLogged: number = 0;

    constructor(functions: HostFunctionRegistry, actions: HostActionRegistry, types: StructTypeRegistry) {
      this.functions = functions;
      this.actions = actions;
      this.types = types;
    }
  }

  /** The registries {@link hostRegistries} drained, once it has. */
  let drainedRegistries: HostRegistries;

  /**
   * The host registries of this program run, shared by every program host.
   * The first call drains every pending pack registration through the
   * project's id manifest ({@link projectIds}), which closes registration,
   * and logs each registration diagnostic on record as
   * `wendoo <code> <name> <pack>` through {@link debugLog}; every later call returns the same
   * registries. Call it once the program's top-level code has run, so every
   * pack and the manifest have registered.
   */
  //% hidden
  export function hostRegistries(): HostRegistries {
    if (drainedRegistries) {
      return drainedRegistries;
    }
    const numerics = new F64Numerics();
    const functions = new HostFunctionRegistry();
    registerCoreHostFunctions(functions, numerics);
    const actions = new HostActionRegistry();
    registerCoreHostActions(actions, numerics, new RngServices());
    const types = new StructTypeRegistry();
    applyPendingRegistrations(projectIds(), functions, actions, types);
    drainedRegistries = new HostRegistries(functions, actions, types);
    const recorded = registrationDiagnostics();
    for (let i = 0; i < recorded.length; i++) {
      debugLog(`wendoo ${recorded[i].code} ${recorded[i].name} ${recorded[i].pack}`);
    }
    return drainedRegistries;
  }

  /**
   * Log code: game code read or wrote a variable of the program an actor
   * runs while the actor ran none -- no program, or the empty program
   * {@link wendooBrains.none} -- which read as nothing and wrote nothing.
   * Logged as `wendoo WENDOO_VARIABLE_NO_PROGRAM`, once per program run,
   * through {@link debugLog}.
   */
  //% hidden
  export const VARIABLE_NO_PROGRAM = "WENDOO_VARIABLE_NO_PROGRAM";

  /**
   * Log code: game code read a variable of the program an actor runs as one
   * type while it held a value of another, which read as nothing. Logged as
   * `wendoo WENDOO_VARIABLE_TYPE_MISMATCH`, once per program run, through
   * {@link debugLog}.
   */
  //% hidden
  export const VARIABLE_TYPE_MISMATCH = "WENDOO_VARIABLE_TYPE_MISMATCH";

  /**
   * Log code: game code read or wrote a variable by a name the program an
   * actor runs declares no variable by. Logged as
   * `wendoo WENDOO_VARIABLE_UNKNOWN <name>`, the name as a JSON string
   * literal ({@link jsonQuote}), once per name per program run, through
   * {@link debugLog}.
   */
  //% hidden
  export const VARIABLE_UNKNOWN = "WENDOO_VARIABLE_UNKNOWN";

  /** Whether {@link VARIABLE_NO_PROGRAM} has been logged in this program run. */
  let variableNoProgramLogged = false;

  /** Whether {@link VARIABLE_TYPE_MISMATCH} has been logged in this program run. */
  let variableTypeMismatchLogged = false;

  /** Every name {@link VARIABLE_UNKNOWN} has been logged for in this program run, in the order logged. */
  const variableUnknownLogged: string[] = [];

  /** Log {@link VARIABLE_NO_PROGRAM}, the first time in this program run. */
  function logVariableNoProgram(): void {
    if (!variableNoProgramLogged) {
      variableNoProgramLogged = true;
      debugLog(`wendoo ${VARIABLE_NO_PROGRAM}`);
    }
  }

  /** Log {@link VARIABLE_TYPE_MISMATCH}, the first time in this program run. */
  function logVariableTypeMismatch(): void {
    if (!variableTypeMismatchLogged) {
      variableTypeMismatchLogged = true;
      debugLog(`wendoo ${VARIABLE_TYPE_MISMATCH}`);
    }
  }

  /**
   * Log {@link VARIABLE_UNKNOWN} for `name` when `program` declares no
   * variable by it, the first time in this program run that name is logged.
   */
  function logVariableUnknown(program: Program, name: string): void {
    if (program.variableNames.indexOf(name) < 0 && variableUnknownLogged.indexOf(name) < 0) {
      variableUnknownLogged.push(name);
      debugLog(`wendoo ${VARIABLE_UNKNOWN} ${jsonQuote(name)}`);
    }
  }

  /** One write of a program variable by name, held until the program it is for starts. */
  class HeldVariableWrite {
    /** Variable name, exactly as written. */
    name: string;
    /** Value written. */
    value: Value;

    constructor(name: string, value: Value) {
      this.name = name;
      this.value = value;
    }
  }

  /** One request to run a compiled brain on an actor, waiting for the next drain. */
  class AttachRequest {
    attachment: ActorAttachment;
    registration: CompiledBrainRegistration;
    /** Variable writes game code made for the requested program before it started, in write order. */
    heldWrites: HeldVariableWrite[] = [];
    /**
     * The variables of the program an update replaced, which the requested
     * program installs by name: set on a restart of an updated program,
     * `undefined` on every other request, whose program starts fresh.
     */
    previousVariables: VariableSnapshot;

    constructor(
      attachment: ActorAttachment,
      registration: CompiledBrainRegistration,
      previousVariables?: VariableSnapshot
    ) {
      this.attachment = attachment;
      this.registration = registration;
      this.previousVariables = previousVariables;
    }
  }

  /**
   * The host loop of the programs one game scene runs. Every program it runs
   * resolves against this program run's shared {@link hostRegistries}; it
   * owns every program's runtime, and it is the only caller of those
   * runtimes.
   *
   * Call {@link ProgramHost.attach} from game code, and
   * {@link ProgramHost.drain} once per frame from the game's frame loop.
   */
  //% hidden
  export class ProgramHost {
    private registries: HostRegistries = undefined;
    private caps: VmCaps;
    private observer: VmObserver;
    private loaded: LoadedProgram[] = [];
    private requests: AttachRequest[] = [];
    private running: HostedProgram[] = [];

    /**
     * @param observer - Passive observer of every hosted program's visible effects and faults.
     */
    constructor(observer: VmObserver) {
      this.caps = new VmCaps(STS_F64_DEFAULT_BUDGET, STS_F64_MAX_STACK_SIZE, STS_F64_MAX_HANDLES);
      this.observer = observer;
    }

    /**
     * Ask that `registration`'s program run on the actor `attachment` belongs
     * to, from the next drain, in place of any program the actor runs then,
     * its variables starting at their starting values. Records the request
     * only; nothing runs until the drain. A refused program ends the actor's
     * program and starts nothing.
     *
     * @param attachment - Attachment of the actor to run the program on.
     * @param registration - The compiled brain to run.
     */
    attach(attachment: ActorAttachment, registration: CompiledBrainRegistration): void {
      this.requests.push(new AttachRequest(attachment, registration));
    }

    /**
     * Read the variable named `name`, matched exactly and case-sensitively,
     * of the program the actor `attachment` belongs to runs now: its value
     * when it holds a value tagged `tag`, else `undefined`. Peeks at the
     * program's store between thinks; runs nothing.
     *
     * Reads `undefined` when the actor runs no program, or runs the empty
     * program {@link wendooBrains.none}, logging {@link VARIABLE_NO_PROGRAM};
     * when the variable holds nothing, nil included; and when it holds a
     * value of another type, logging {@link VARIABLE_TYPE_MISMATCH}. A name
     * the program declares no variable by is logged as
     * {@link VARIABLE_UNKNOWN} and reads the slot a write by that name gave
     * it, if any. A program attached but not yet started is not read.
     *
     * @param attachment - Attachment of the actor whose program is read.
     * @param name - Variable name, exactly as the program declares it.
     * @param tag - Tag of the values the caller reads.
     */
    readVariable(attachment: ActorAttachment, name: string, tag: ValueTag): Value {
      const hosted = this.programOn(attachment);
      if (!hosted) {
        logVariableNoProgram();
        return undefined;
      }
      logVariableUnknown(hosted.loaded.program, name);
      const value = hosted.runtime.getVariable(name);
      if (!value || value.t === ValueTag.Nil) {
        return undefined;
      }
      if (value.t !== tag) {
        logVariableTypeMismatch();
        return undefined;
      }
      return value;
    }

    /**
     * Write `value` into the variable named `name`, matched exactly and
     * case-sensitively, of the program the actor `attachment` belongs to
     * runs: a store mutation the program reads at its next think. Runs
     * nothing.
     *
     * While a request to run a program on the actor waits for the drain, the
     * write is held on the latest such request and applied once, in write
     * order with the other writes it holds, when the drain starts that
     * program -- after the program's variables take their starting values,
     * before its first think; a later request for the actor supersedes the
     * program and every write held for it. A write to an actor running no
     * program, running the empty program {@link wendooBrains.none}, or
     * waiting to run the empty program writes nothing and is logged as
     * {@link VARIABLE_NO_PROGRAM}. A name the program declares no variable
     * by gets a slot of its own and is logged as {@link VARIABLE_UNKNOWN},
     * when the write reaches the program.
     *
     * @param attachment - Attachment of the actor whose program is written.
     * @param name - Variable name, exactly as the program declares it.
     * @param value - Value to store.
     */
    writeVariable(attachment: ActorAttachment, name: string, value: Value): void {
      const pending = this.latestRequestFor(attachment);
      if (pending) {
        if (pending.registration === wendooBrains.none) {
          logVariableNoProgram();
        } else {
          pending.heldWrites.push(new HeldVariableWrite(name, value));
        }
        return;
      }
      const hosted = this.programOn(attachment);
      if (!hosted) {
        logVariableNoProgram();
        return;
      }
      logVariableUnknown(hosted.loaded.program, name);
      hosted.runtime.setVariable(name, value);
    }

    /**
     * Run one pass of the host loop: on the first pass, take this program
     * run's {@link hostRegistries} -- draining them when no host has yet;
     * apply every queued program update ({@link applyProgramUpdates}); on
     * the first pass, load every registered compiled brain, logging each
     * refusal; end the program of every actor that has ended; restart, on
     * its own actor, every running program whose registration an update has
     * replaced since it started, in start order, the new program's variables
     * installed by name from the replaced program's -- a variable both
     * declare keeps its value, one new to the update takes its starting
     * value, and one the update no longer declares is dropped -- then start
     * the programs attached since the last pass, in request order, each with
     * its variables at their starting values -- each restart and start
     * ending the program its actor ran; think every running program
     * once, in start order; then log each field programs addressed that its
     * registered type does not declare, not logged before by any host, as
     * `wendoo field-undeclared <typeId> <fieldId>` through {@link debugLog}.
     *
     * A throw out of a program's start or think, outside every fiber of it,
     * is reported as that program's fault through its
     * {@link HostedProgramObserver}; the program stays on its actor and
     * thinks again at the next pass, and the pass goes on.
     *
     * @param timeMs - Cumulative scheduled time of this pass, in milliseconds.
     */
    drain(timeMs: number): void {
      const firstPass = !this.registries;
      if (firstPass) {
        this.registries = hostRegistries();
      }
      applyProgramUpdates(this.registries);
      if (firstPass) {
        this.loaded = loadRegisteredPrograms(this.registries.types);
        for (let i = 0; i < this.loaded.length; i++) {
          logRefusal(this.loaded[i]);
        }
      }

      this.endEndedPrograms();

      const requests = this.restartsOfUpdatedPrograms();
      for (let i = 0; i < this.requests.length; i++) {
        requests.push(this.requests[i]);
      }
      this.requests = [];
      for (let i = 0; i < requests.length; i++) {
        this.start(requests[i]);
      }

      for (let i = 0; i < this.running.length; i++) {
        const hosted = this.running[i];
        try {
          hosted.runtime.think(timeMs);
        } catch (e) {
          hosted.observer.onThrown(e);
        }
      }

      const registries = this.registries;
      const undeclared = registries.types.undeclaredFieldAccesses();
      for (; registries.undeclaredLogged < undeclared.length; registries.undeclaredLogged++) {
        const access = undeclared[registries.undeclaredLogged];
        debugLog(`wendoo ${FIELD_UNDECLARED} ${access.typeId} ${access.fieldId}`);
      }
    }

    /** The programs running now, in start order. */
    hostedPrograms(): HostedProgram[] {
      return this.running;
    }

    /**
     * The attachments of the actors running the compiled brain `documentId`
     * now, in start order; empty when none does.
     *
     * @param documentId - Document id of a compiled brain.
     */
    attachmentsRunning(documentId: string): ActorAttachment[] {
      const attachments: ActorAttachment[] = [];
      for (let i = 0; i < this.running.length; i++) {
        if (this.running[i].loaded.registration.id === documentId) {
          attachments.push(this.running[i].attachment);
        }
      }
      return attachments;
    }

    /** Every compiled brain whose current program was refused when loaded, in load order. */
    rejections(): LoadedProgram[] {
      const refused: LoadedProgram[] = [];
      for (let i = 0; i < this.loaded.length; i++) {
        if (this.loaded[i].errorCode.length > 0) {
          refused.push(this.loaded[i]);
        }
      }
      return refused;
    }

    /** Start the program `request` asks for, ending the one its actor runs. */
    private start(request: AttachRequest): void {
      if (request.attachment.hasEnded()) {
        return;
      }
      this.endProgramOf(request.attachment);
      const loaded = this.load(request.registration);
      if (loaded.errorCode.length > 0) {
        return;
      }
      const observer = new HostedProgramObserver(this.observer, loaded.registration.id);
      const runtime = new BrainRuntime(
        loaded.program,
        this.registries.functions,
        this.registries.actions,
        this.registries.types,
        observer,
        this.caps,
        request.attachment,
        request.previousVariables
      );
      request.attachment.host = this;
      for (let i = 0; i < request.heldWrites.length; i++) {
        logVariableUnknown(loaded.program, request.heldWrites[i].name);
        runtime.setVariable(request.heldWrites[i].name, request.heldWrites[i].value);
      }
      try {
        runtime.startup();
      } catch (e) {
        observer.onThrown(e);
      }
      this.running.push(new HostedProgram(request.attachment, loaded, runtime, observer));
    }

    /**
     * A request to run each running program again on its own actor, in start
     * order, for every one whose registration an update has replaced since
     * the program was loaded, each carrying a snapshot of the running
     * program's variables, taken before its start ends that program.
     */
    private restartsOfUpdatedPrograms(): AttachRequest[] {
      const restarts: AttachRequest[] = [];
      for (let i = 0; i < this.running.length; i++) {
        const hosted = this.running[i];
        const loaded = hosted.loaded;
        if (loaded.revision !== loaded.registration.revision) {
          restarts.push(
            new AttachRequest(hosted.attachment, loaded.registration, hosted.runtime.snapshotVariables())
          );
        }
      }
      return restarts;
    }

    /**
     * The program the actor `attachment` belongs to runs now, or `undefined`
     * when it runs none, runs the empty program {@link wendooBrains.none},
     * or has ended.
     */
    private programOn(attachment: ActorAttachment): HostedProgram {
      for (let i = 0; i < this.running.length; i++) {
        const hosted = this.running[i];
        if (hosted.attachment.isSameActor(attachment)) {
          const runsNone = hosted.loaded.registration === wendooBrains.none;
          return runsNone || hosted.attachment.hasEnded() ? undefined : hosted;
        }
      }
      return undefined;
    }

    /** The latest request to run a program on the actor `attachment` belongs to that waits for the drain, or `undefined` when none does. */
    private latestRequestFor(attachment: ActorAttachment): AttachRequest {
      for (let i = this.requests.length - 1; i >= 0; i--) {
        if (this.requests[i].attachment.isSameActor(attachment)) {
          return this.requests[i];
        }
      }
      return undefined;
    }

    /** Drop every running program whose actor has ended. */
    private endEndedPrograms(): void {
      const kept: HostedProgram[] = [];
      for (let i = 0; i < this.running.length; i++) {
        if (!this.running[i].attachment.hasEnded()) {
          kept.push(this.running[i]);
        }
      }
      this.running = kept;
    }

    /** Drop the running program of the actor `attachment` belongs to, if it runs one. */
    private endProgramOf(attachment: ActorAttachment): void {
      const kept: HostedProgram[] = [];
      for (let i = 0; i < this.running.length; i++) {
        if (!this.running[i].attachment.isSameActor(attachment)) {
          kept.push(this.running[i]);
        }
      }
      this.running = kept;
    }

    /**
     * The loaded form of `registration`'s current program, loading it on
     * first use and again once an update has replaced it.
     */
    private load(registration: CompiledBrainRegistration): LoadedProgram {
      for (let i = 0; i < this.loaded.length; i++) {
        if (this.loaded[i].registration === registration) {
          if (this.loaded[i].revision !== registration.revision) {
            this.loaded[i] = loadCompiledProgram(registration, this.registries.types);
            logRefusal(this.loaded[i]);
          }
          return this.loaded[i];
        }
      }
      const loaded = loadCompiledProgram(registration, this.registries.types);
      logRefusal(loaded);
      this.loaded.push(loaded);
      return loaded;
    }
  }

  /** Log `loaded`'s refusal as `wendoo program-rejected <code> <id>` through {@link debugLog}; an accepted program logs nothing. */
  function logRefusal(loaded: LoadedProgram): void {
    if (loaded.errorCode.length > 0) {
      debugLog(`wendoo program-rejected ${loaded.errorCode} ${loaded.registration.id}`);
    }
  }
}
