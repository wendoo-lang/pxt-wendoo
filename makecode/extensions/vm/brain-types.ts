/**
 * Brain types: struct types whose values each name one of the project's
 * compiled brains by its document id, holding nothing else of the brain. A
 * pack declares one with {@link Pack.defineBrainType}.
 */
namespace wendoo {
  /** Name of a brain type's one field: a read-only string holding the document id of the brain the value names. */
  export const BRAIN_FIELD = "id";

  /**
   * Log code: a value named a brain the project holds no compiled brain for
   * -- one it has deleted. Logged as `wendoo WENDOO_BRAIN_UNRESOLVED <id>`,
   * once per document id, while {@link debug} is on.
   */
  export const BRAIN_UNRESOLVED = "WENDOO_BRAIN_UNRESOLVED";

  /**
   * The binding of one brain type. Pass it to {@link Pack.defineBrainType};
   * once the drain has registered the type, read the document id of a value
   * with {@link BrainTypeBinding.documentIdOf}, make a value naming a brain
   * with {@link BrainTypeBinding.valueNaming}, and when the project holds no
   * brain under a document id, report it with
   * {@link BrainTypeBinding.reportUnresolved}.
   */
  export class BrainTypeBinding extends StructTypeBinding {
    /** Document ids already reported unresolved, each logged once. */
    private unresolved: string[] = [];

    constructor() {
      super();
    }

    /**
     * The value of this type naming the brain `documentId`. Call it only
     * once the drain has registered the type, so its field id is assigned.
     *
     * @param documentId - Document id of one of the project's brains.
     */
    valueNaming(documentId: string): Value {
      const fieldId = this.fieldIds[0];
      const slots: Value[] = [];
      for (let i = 0; i < fieldId; i++) {
        slots.push(NIL_VALUE);
      }
      slots.push(mkString(documentId));
      return mkStruct(this.typeId, slots);
    }

    /**
     * Log that the project holds no compiled brain under `documentId`, as
     * `wendoo WENDOO_BRAIN_UNRESOLVED <id>` through {@link debugLog}: the
     * first time it is reported, and never again in the same program run.
     *
     * @param documentId - The document id a value held.
     */
    reportUnresolved(documentId: string): void {
      if (this.unresolved.indexOf(documentId) >= 0) {
        return;
      }
      this.unresolved.push(documentId);
      debugLog(`wendoo ${BRAIN_UNRESOLVED} ${documentId}`);
    }

    /**
     * The document id `value` holds in its {@link BRAIN_FIELD} when it is a
     * value of this type; `""` for any other value, nil included.
     *
     * @param value - Any value a program produced.
     */
    documentIdOf(value: Value): string {
      if (!value || value.t !== ValueTag.Struct || value.typeId !== this.typeId) {
        return "";
      }
      const id = value.fields[this.fieldIds[0]];
      return id ? id.str : "";
    }
  }
}
