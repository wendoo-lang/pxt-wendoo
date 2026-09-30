/**
 * The program loader: decodes compiled brains and holds each to the world
 * this VM computes in. A program built for another world is refused, never
 * run.
 */
namespace wendoo {
  /**
   * Numeric device-profile id of the sts-f64 world, the world this VM
   * computes in: the id every program it runs must carry in its envelope.
   */
  export const STS_F64_PROFILE_ID = 2001;

  /**
   * The program decoded, but its envelope carries a device-profile id other
   * than {@link STS_F64_PROFILE_ID}.
   */
  export const LOAD_ERROR_UNSUPPORTED_DEVICE_PROFILE = "WENDOO_BINARY_CODEC_UNSUPPORTED_DEVICE_PROFILE";

  /** What loading one compiled brain produced. */
  //% hidden
  export class LoadedProgram {
    /** The compiled brain that was loaded. */
    registration: CompiledBrainRegistration;
    /**
     * Stable code of the reason the program was refused -- a decode failure
     * code or {@link LOAD_ERROR_UNSUPPORTED_DEVICE_PROFILE} -- or `""` when it
     * was accepted.
     */
    errorCode: string;
    /** The decoded program, meaningful only when {@link errorCode} is empty. */
    program: Program;

    constructor(registration: CompiledBrainRegistration, errorCode: string, program: Program) {
      this.registration = registration;
      this.errorCode = errorCode;
      this.program = program;
    }
  }

  /**
   * Decode `registration`'s program and accept it when it decodes and was
   * compiled for the sts-f64 world. Never throws: a refusal is reported by
   * the result's error code.
   *
   * @param registration - The compiled brain to load.
   * @param types - Struct type registry the program's type atoms resolve against.
   */
  //% hidden
  export function loadCompiledProgram(
    registration: CompiledBrainRegistration,
    types: StructTypeRegistry
  ): LoadedProgram {
    const decoded = decodeProgram(registration.bytecode.toArray(NumberFormat.UInt8LE), types);
    if (decoded.errorCode.length > 0) {
      return new LoadedProgram(registration, decoded.errorCode, decoded.program);
    }
    if (decoded.profileId !== STS_F64_PROFILE_ID) {
      return new LoadedProgram(registration, LOAD_ERROR_UNSUPPORTED_DEVICE_PROFILE, decoded.program);
    }
    return new LoadedProgram(registration, "", decoded.program);
  }

  /**
   * Load every compiled brain registered since program start, in
   * registration order. A refused program is reported in its result and
   * does not stop the rest from loading.
   *
   * @param types - Struct type registry the programs' type atoms resolve against.
   */
  //% hidden
  export function loadRegisteredPrograms(types: StructTypeRegistry): LoadedProgram[] {
    const registrations = compiledBrainRegistrations();
    const loaded: LoadedProgram[] = [];
    for (let i = 0; i < registrations.length; i++) {
      loaded.push(loadCompiledProgram(registrations[i], types));
    }
    return loaded;
  }
}
