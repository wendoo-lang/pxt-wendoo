/**
 * A MakeCode project as the simulator extension serves it, in memory, for
 * the specs playing the frame's side of the brains family.
 */
import type {
  MakeCodeBrainSummary,
  MakeCodeBrainsChannel,
  MakeCodeWireBrain,
  MakeCodeWireBrainPush,
  MakeCodeWireCompileOutcome,
} from "@wendoo/makecode-session";
import { brainSourceHash } from "@wendoo/makecode-session";
import { BrainEngine } from "../../simx/brain-engine.js";
import type { CompiledBrain } from "../../simx/brains-module.js";

/**
 * A project's brains keyed by id, as a pull returns them, each with the
 * registration the frame holds of it, compiled in the frame's compile
 * environment, which is core-only unless a spec adopts a catalog into it.
 */
export class FrameProject extends Map<string, MakeCodeWireBrain> {
  /** The frame's compile environment. */
  readonly engine = new BrainEngine();
  /** The registration of each brain's compiled form, by id. */
  readonly registrations = new Map<string, CompiledBrain>();

  /**
   * Stores `source`, the brain `id` named `name`, and compiles it as the
   * frame does, keeping the brain's last good registration for a compile
   * producing no program. Returns the compile's outcome.
   */
  write(id: string, name: string, source: string): MakeCodeWireCompileOutcome {
    const origin = this.get(id)?.origin ?? null;
    const compiled = this.engine.compile(id, name, source, this.registrations.get(id), this);
    if (compiled.registration === undefined) this.registrations.delete(id);
    else this.registrations.set(id, compiled.registration);
    const compiledSourceHash = compiled.registration?.sourceHash ?? null;
    this.set(id, { id, name, source, compiledSourceHash, origin, originLabel: null });
    return compiled.outcome;
  }

  /** Removes the brain `id` in both forms, whether or not the project holds it. */
  remove(id: string): void {
    this.delete(id);
    this.registrations.delete(id);
  }

  /**
   * Mints an empty brain named `name` through the frame's environment and
   * writes it. Returns its summary.
   */
  create(name: string): MakeCodeBrainSummary {
    const minted = this.engine.mint(name);
    this.write(minted.id, name, minted.source);
    const summary = this.summaries().find((brain) => brain.id === minted.id);
    if (summary === undefined) throw new Error(`the created brain ${minted.id} is not held`);
    return summary;
  }

  /** The project's brains, as the frame publishes them. */
  summaries(): MakeCodeBrainSummary[] {
    return [...this.values()].map((brain) => ({
      id: brain.id,
      name: brain.name,
      sourceHash: brainSourceHash(brain.source),
      compiledSourceHash: brain.compiledSourceHash,
      origin: brain.origin,
      originLabel: brain.originLabel,
    }));
  }
}

/**
 * A project holding `brains`, each written to it as the frame writes a push.
 *
 * @param brains - The brains to hold, each by its id, name and source.
 */
export function frameProjectOf(...brains: { id: string; name: string; source: string }[]): FrameProject {
  const project = new FrameProject();
  for (const brain of brains) project.write(brain.id, brain.name, brain.source);
  return project;
}

/** Options for a {@link FakeBrainsChannel}. */
export interface FakeBrainsChannelOptions {
  /** Whether each push is applied to the project and answered with its outcome; when `false`, every push is answered with `null` and the project is left as it is. Default `true`. */
  readonly applyPushes?: boolean;
}

/**
 * One handshake's brains channel over `project`, standing in for the frame:
 * it answers every request at once, listing and pulling from the project,
 * recording every push in {@link pushes}, and refusing every create and
 * open. A push writes or removes its brain in the project and is answered
 * with the write's compile outcome, or `null` for a removal, unless
 * `options.applyPushes` is `false`.
 */
export class FakeBrainsChannel implements MakeCodeBrainsChannel {
  /** Every push received, in order. */
  readonly pushes: MakeCodeWireBrainPush[] = [];

  constructor(
    private readonly project: FrameProject,
    private readonly options: FakeBrainsChannelOptions = {}
  ) {}

  listBrains(): Promise<MakeCodeBrainSummary[]> {
    return Promise.resolve(this.project.summaries());
  }

  pullBrains(ids: readonly string[]): Promise<MakeCodeWireBrain[]> {
    return Promise.resolve(ids.flatMap((id) => this.project.get(id) ?? []));
  }

  pushBrain(push: MakeCodeWireBrainPush): Promise<MakeCodeWireCompileOutcome | null> {
    this.pushes.push(push);
    if (this.options.applyPushes === false) return Promise.resolve(null);
    if (push.op === "remove") {
      this.project.remove(push.brainId);
      return Promise.resolve(null);
    }
    return Promise.resolve(this.project.write(push.brain.id, push.brain.name, push.brain.source));
  }

  createBrain(): Promise<MakeCodeBrainSummary> {
    return Promise.reject(new Error("no brain is created over this channel"));
  }

  openBrain(): Promise<void> {
    return Promise.reject(new Error("no brain is opened over this channel"));
  }
}
