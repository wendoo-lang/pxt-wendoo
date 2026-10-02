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
   * The world of one actor a program runs on: the per-run payload its host
   * functions and actions reach through the execution context, and the
   * actor's lifecycle as the host loop sees it. A target subclasses it with
   * its actor, overriding {@link ActorWorld.hasEnded} and
   * {@link ActorWorld.isSameActor}.
   */
  //% hidden
  export class ActorWorld extends HostWorld {
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
     * Whether `other` is the world of this same actor: attaching a program
     * to a world ends the running program of every world this reports as the
     * same actor. The base compares the worlds themselves.
     *
     * @param other - World of the actor a program is being attached to.
     */
    isSameActor(other: ActorWorld): boolean {
      return other === this;
    }
  }

  /** One program running on one actor. */
  //% hidden
  export class HostedProgram {
    /** World of the actor the program runs on. */
    world: ActorWorld;
    /** The loaded program. */
    loaded: LoadedProgram;
    /** The program's runtime, which the host loop alone thinks. */
    runtime: BrainRuntime;

    constructor(world: ActorWorld, loaded: LoadedProgram, runtime: BrainRuntime) {
      this.world = world;
      this.loaded = loaded;
      this.runtime = runtime;
    }
  }

  /**
   * The host registries every program of one program run resolves against:
   * the core host functions computing in the sts-f64 world, the core host
   * actions, and every pack registration, drained through the project's id
   * manifest. Obtain them with {@link hostRegistries}.
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
   * `wendoo <code> <name> <pack>`; every later call returns the same
   * registries. Call it once the program's top-level code has run, so every
   * pack and the manifest have registered.
   */
  //% hidden
  export function hostRegistries(): HostRegistries {
    if (drainedRegistries) {
      return drainedRegistries;
    }
    const functions = new HostFunctionRegistry();
    registerCoreHostFunctions(functions, new F64Numerics());
    const actions = new HostActionRegistry();
    registerCoreHostActions(actions);
    const types = new StructTypeRegistry();
    applyPendingRegistrations(projectIds(), functions, actions, types);
    drainedRegistries = new HostRegistries(functions, actions, types);
    const recorded = registrationDiagnostics();
    for (let i = 0; i < recorded.length; i++) {
      console.log(`wendoo ${recorded[i].code} ${recorded[i].name} ${recorded[i].pack}`);
    }
    return drainedRegistries;
  }

  /** One request to run a compiled brain on an actor, waiting for the next drain. */
  class AttachRequest {
    world: ActorWorld;
    registration: CompiledBrainRegistration;

    constructor(world: ActorWorld, registration: CompiledBrainRegistration) {
      this.world = world;
      this.registration = registration;
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
     * @param observer - Passive observer of every hosted program's visible effects.
     */
    constructor(observer: VmObserver) {
      this.caps = new VmCaps(STS_F64_DEFAULT_BUDGET, STS_F64_MAX_STACK_SIZE, STS_F64_MAX_HANDLES);
      this.observer = observer;
    }

    /**
     * Ask that `registration`'s program run on the actor `world` belongs to,
     * from the next drain, in place of any program the actor runs then.
     * Records the request only; nothing runs until the drain. A refused
     * program ends the actor's program and starts nothing.
     *
     * @param world - World of the actor to run the program on.
     * @param registration - The compiled brain to run.
     */
    attach(world: ActorWorld, registration: CompiledBrainRegistration): void {
      this.requests.push(new AttachRequest(world, registration));
    }

    /**
     * Run one pass of the host loop: on the first pass, take this program
     * run's {@link hostRegistries} -- draining them when no host has yet;
     * apply every queued program update ({@link applyProgramUpdates}); on
     * the first pass, load every registered compiled brain, logging each
     * refusal; end the program of every actor that has ended; restart, on
     * its own actor, every running program whose registration an update has
     * replaced since it started, in start order, then start the programs
     * attached since the last pass, in request order -- each restart and
     * start ending the program its actor ran; think every running program
     * once, in start order; then log each field programs addressed that its
     * registered type does not declare, not logged before by any host, as
     * `wendoo field-undeclared <typeId> <fieldId>`.
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
        this.running[i].runtime.think(timeMs);
      }

      const registries = this.registries;
      const undeclared = registries.types.undeclaredFieldAccesses();
      for (; registries.undeclaredLogged < undeclared.length; registries.undeclaredLogged++) {
        const access = undeclared[registries.undeclaredLogged];
        console.log(`wendoo ${FIELD_UNDECLARED} ${access.typeId} ${access.fieldId}`);
      }
    }

    /** The programs running now, in start order. */
    hostedPrograms(): HostedProgram[] {
      return this.running;
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
      if (request.world.hasEnded()) {
        return;
      }
      this.endProgramOf(request.world);
      const loaded = this.load(request.registration);
      if (loaded.errorCode.length > 0) {
        return;
      }
      const runtime = new BrainRuntime(
        loaded.program,
        this.registries.functions,
        this.registries.actions,
        this.registries.types,
        this.observer,
        this.caps,
        request.world
      );
      runtime.startup();
      this.running.push(new HostedProgram(request.world, loaded, runtime));
    }

    /**
     * A request to run each running program again on its own actor, in start
     * order, for every one whose registration an update has replaced since
     * the program was loaded.
     */
    private restartsOfUpdatedPrograms(): AttachRequest[] {
      const restarts: AttachRequest[] = [];
      for (let i = 0; i < this.running.length; i++) {
        const loaded = this.running[i].loaded;
        if (loaded.revision !== loaded.registration.revision) {
          restarts.push(new AttachRequest(this.running[i].world, loaded.registration));
        }
      }
      return restarts;
    }

    /** Drop every running program whose actor has ended. */
    private endEndedPrograms(): void {
      const kept: HostedProgram[] = [];
      for (let i = 0; i < this.running.length; i++) {
        if (!this.running[i].world.hasEnded()) {
          kept.push(this.running[i]);
        }
      }
      this.running = kept;
    }

    /** Drop the running program of the actor `world` belongs to, if it runs one. */
    private endProgramOf(world: ActorWorld): void {
      const kept: HostedProgram[] = [];
      for (let i = 0; i < this.running.length; i++) {
        if (!this.running[i].world.isSameActor(world)) {
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

  /** Log `loaded`'s refusal as `wendoo program-rejected <code> <id>`; an accepted program logs nothing. */
  function logRefusal(loaded: LoadedProgram): void {
    if (loaded.errorCode.length > 0) {
      console.log(`wendoo program-rejected ${loaded.errorCode} ${loaded.registration.id}`);
    }
  }
}
