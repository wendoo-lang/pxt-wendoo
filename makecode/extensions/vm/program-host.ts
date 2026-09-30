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
   * The host loop of the programs one game scene runs. It owns the host
   * registries every program resolves against -- the core host functions
   * computing in the sts-f64 world and the core host actions -- and every
   * program's runtime, and it is the only caller of those runtimes.
   *
   * Call {@link ProgramHost.attach} from game code, and
   * {@link ProgramHost.drain} once per frame from the game's frame loop.
   */
  //% hidden
  export class ProgramHost {
    private functions: HostFunctionRegistry;
    private actions: HostActionRegistry;
    private types: StructTypeRegistry;
    private caps: VmCaps;
    private observer: VmObserver;
    private loaded: LoadedProgram[] = [];
    private registeredLoaded: boolean = false;
    private requests: AttachRequest[] = [];
    private running: HostedProgram[] = [];

    /**
     * @param observer - Passive observer of every hosted program's visible effects.
     */
    constructor(observer: VmObserver) {
      this.functions = new HostFunctionRegistry();
      registerCoreHostFunctions(this.functions, new F64Numerics());
      this.actions = new HostActionRegistry();
      registerCoreHostActions(this.actions);
      this.types = new StructTypeRegistry();
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
     * Run one pass of the host loop: on the first pass, load every
     * registered compiled brain, logging each refusal; end the program of
     * every actor that has ended; start the programs attached since the last
     * pass, in request order; then think every running program once, in
     * start order.
     *
     * @param timeMs - Cumulative scheduled time of this pass, in milliseconds.
     */
    drain(timeMs: number): void {
      if (!this.registeredLoaded) {
        this.registeredLoaded = true;
        this.loaded = loadRegisteredPrograms(this.types);
        for (let i = 0; i < this.loaded.length; i++) {
          logRefusal(this.loaded[i]);
        }
      }

      this.endEndedPrograms();

      const requests = this.requests;
      this.requests = [];
      for (let i = 0; i < requests.length; i++) {
        this.start(requests[i]);
      }

      for (let i = 0; i < this.running.length; i++) {
        this.running[i].runtime.think(timeMs);
      }
    }

    /** The programs running now, in start order. */
    hostedPrograms(): HostedProgram[] {
      return this.running;
    }

    /** Every compiled brain loaded so far that was refused, in load order. */
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
        this.functions,
        this.actions,
        this.types,
        this.observer,
        this.caps,
        request.world
      );
      runtime.startup();
      this.running.push(new HostedProgram(request.world, loaded, runtime));
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

    /** The loaded form of `registration`, loading it on first use. */
    private load(registration: CompiledBrainRegistration): LoadedProgram {
      for (let i = 0; i < this.loaded.length; i++) {
        if (this.loaded[i].registration === registration) {
          return this.loaded[i];
        }
      }
      const loaded = loadCompiledProgram(registration, this.types);
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
