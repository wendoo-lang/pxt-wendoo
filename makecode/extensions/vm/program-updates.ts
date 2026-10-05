/**
 * Program updates: a newer compiled form of a registered program, or its
 * removal, taken by the running game without a restart. Queuing an update
 * changes nothing; the next program host drain applies every queued update
 * to the compiled-brain registry, and each host then restarts the programs
 * its actors run from an updated registration.
 */
namespace wendoo {
  /**
   * The update references a host-function id, host-action id, or type-atom
   * id that the project's id manifest did not hold when the program run
   * started, and that no core registration resolves.
   */
  export const UPDATE_ERROR_UNMAPPED_ID = "WENDOO_PROGRAM_UPDATE_UNMAPPED_ID";

  /** One program update waiting for the next program host drain. */
  class ProgramUpdate {
    /** Document id of the program the update replaces. */
    documentId: string;
    /** The program's display name; any text, including empty. */
    name: string;
    /** Source hash of the source the update's program was compiled from; empty for a removal. */
    sourceHash: string;
    /** The updated program, in the binary form the VM decodes; empty for a removal. */
    bytecode: Buffer;

    constructor(documentId: string, name: string, sourceHash: string, bytecode: Buffer) {
      this.documentId = documentId;
      this.name = name;
      this.sourceHash = sourceHash;
      this.bytecode = bytecode;
    }
  }

  /** Updates queued since the last drain applied them, in arrival order. */
  const pendingUpdates: ProgramUpdate[] = [];

  /**
   * Queue the update of the registered program `documentId` to `bytecode`,
   * for the next program host drain to apply. Records the update only;
   * nothing is decoded or run.
   *
   * @param documentId - Document id of the program to update.
   * @param name - The program's display name; any text, including empty.
   * @param sourceHash - Source hash of the source `bytecode` was compiled from; empty for a removal.
   * @param bytecode - The updated program, in the binary form the VM decodes; empty to remove the program.
   */
  //% hidden
  export function queueProgramUpdate(documentId: string, name: string, sourceHash: string, bytecode: Buffer): void {
    pendingUpdates.push(new ProgramUpdate(documentId, name, sourceHash, bytecode));
  }

  /**
   * Apply every queued update, in arrival order, to the registration of the
   * compiled brain with the update's document id. An update for a document
   * id no registration holds changes nothing, and neither does one carrying
   * the program its registration holds.
   *
   * - A removal replaces the registration's program with the empty program
   *   `wendooBrains.none`, logged as `wendoo program-removed <id>`.
   * - An update whose program the loader accepts and which references no id
   *   outside `registries` and the project's id manifest
   *   ({@link projectIds}) replaces the registration's program and name,
   *   logged as `wendoo program-updated <id> <sourceHash>`.
   * - Any other update is refused, the registration left as it was, logged
   *   as `wendoo program-update-rejected <code> <id>`: the loader's code, or
   *   {@link UPDATE_ERROR_UNMAPPED_ID}.
   *
   * Each line is logged through {@link debugLog}. Each replacement advances the registration's
   * {@link CompiledBrainRegistration.revision}. Call it from a program host
   * drain; every host shares the one queue, so the first drain after an
   * update arrives applies it.
   *
   * @param registries - The host registries of this program run.
   */
  //% hidden
  export function applyProgramUpdates(registries: HostRegistries): void {
    while (pendingUpdates.length > 0) {
      applyProgramUpdate(pendingUpdates.shift(), registries);
    }
  }

  /**
   * Apply `update` to the registration with its document id: replace its
   * program, or remove it, advance its revision, and log the replacement;
   * or refuse the update and log the refusal, leaving the registration as it
   * was. Does nothing for a document id no registration holds, or for the
   * program the registration already holds.
   */
  function applyProgramUpdate(update: ProgramUpdate, registries: HostRegistries): void {
    const registration = registrationWithId(update.documentId);
    if (!registration) {
      return;
    }
    const removal = update.bytecode.length === 0;
    const bytecode = removal ? wendooBrains.none.bytecode : update.bytecode;
    if (registration.bytecode.equals(bytecode)) {
      return;
    }
    if (!removal) {
      const candidate = new CompiledBrainRegistration(update.documentId, update.name, bytecode);
      const code = updateRefusal(loadCompiledProgram(candidate, registries.types), registries);
      if (code.length > 0) {
        debugLog(`wendoo program-update-rejected ${code} ${update.documentId}`);
        return;
      }
      registration.name = update.name;
    }
    registration.bytecode = bytecode;
    registration.revision++;
    if (removal) {
      debugLog(`wendoo program-removed ${update.documentId}`);
    } else {
      debugLog(`wendoo program-updated ${update.documentId} ${update.sourceHash}`);
    }
  }

  /** The registration of the compiled brain `documentId`, or `undefined` when none is registered. */
  function registrationWithId(documentId: string): CompiledBrainRegistration {
    const registrations = compiledBrainRegistrations();
    for (let i = 0; i < registrations.length; i++) {
      if (registrations[i].id === documentId) {
        return registrations[i];
      }
    }
    return undefined;
  }

  /**
   * The stable code refusing the updated program `loaded`, or `""` when it
   * is accepted: {@link UPDATE_ERROR_UNMAPPED_ID} when it references a
   * host-function, host-action, or type-atom id neither `registries` nor the
   * project's id manifest holds, else the loader's own code.
   */
  function updateRefusal(loaded: LoadedProgram, registries: HostRegistries): string {
    const ids = projectIds();
    if (loaded.errorCode === DECODE_ERROR_UNKNOWN_TYPE_ATOM && !ids.hasTypeAtomId(loaded.unknownTypeAtomId)) {
      return UPDATE_ERROR_UNMAPPED_ID;
    }
    if (loaded.errorCode.length > 0) {
      return loaded.errorCode;
    }
    const functions = loaded.program.functions;
    for (let f = 0; f < functions.length; f++) {
      const code = functions[f].code;
      for (let i = 0; i < code.length; i++) {
        const op = code[i].op;
        if ((op === Op.HOST_CALL || op === Op.HOST_CALL_ASYNC) && !knownFunctionId(code[i].a, registries, ids)) {
          return UPDATE_ERROR_UNMAPPED_ID;
        }
        if (
          (op === Op.HOST_ACTION_CALL || op === Op.HOST_ACTION_CALL_ASYNC) &&
          !knownActionId(code[i].a, registries, ids)
        ) {
          return UPDATE_ERROR_UNMAPPED_ID;
        }
      }
    }
    return "";
  }

  /** Whether `registries` or `ids` holds the host-function id `id`. */
  function knownFunctionId(id: number, registries: HostRegistries, ids: RegistrationIdMap): boolean {
    return !!registries.functions.getById(id) || ids.hasOperatorId(id);
  }

  /** Whether `registries` or `ids` holds the host-action id `id`. */
  function knownActionId(id: number, registries: HostRegistries, ids: RegistrationIdMap): boolean {
    return !!registries.actions.getById(id) || ids.hasActionId(id);
  }
}
