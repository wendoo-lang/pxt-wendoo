/**
 * The compiled brains a project registers: the call its generated brains
 * module makes once per brain from top-level code, and the registry the
 * calls collect in. Registering records a brain; it runs nothing.
 */
namespace wendoo {
  /** One compiled brain a project registered with {@link registerCompiledBrain}. */
  export class CompiledBrainRegistration {
    /** The brain's document id. */
    id: string;
    /** The brain's display name; any text, including empty. */
    name: string;
    /** The compiled program, in the binary form the VM decodes. */
    bytecode: Buffer;

    constructor(id: string, name: string, bytecode: Buffer) {
      this.id = id;
      this.name = name;
      this.bytecode = bytecode;
    }
  }

  /** Compiled brains registered since program start, in registration order. */
  const compiledBrains: CompiledBrainRegistration[] = [];

  /**
   * Register the compiled brain `id`, recording it after every brain
   * registered before it. A project's generated brains module calls this
   * once per brain; nothing is decoded or run.
   *
   * @param id - The brain's document id.
   * @param name - The brain's display name; any text, including empty.
   * @param bytecode - The compiled program, in the binary form the VM decodes.
   */
  export function registerCompiledBrain(id: string, name: string, bytecode: Buffer): void {
    compiledBrains.push(new CompiledBrainRegistration(id, name, bytecode));
  }

  /** Every compiled brain registered since program start, in registration order. */
  export function compiledBrainRegistrations(): CompiledBrainRegistration[] {
    return compiledBrains;
  }
}
