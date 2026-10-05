/**
 * Brain types: struct types whose values each name one of the project's
 * compiled brains by its document id, holding nothing else of the brain. A
 * pack declares one with {@link Pack.defineBrainType}.
 */
namespace wendoo {
  /** Name of a brain type's one field: a read-only string holding the document id of the brain the value names. */
  export const BRAIN_FIELD = "id";

  /**
   * The binding of one brain type. Pass it to {@link Pack.defineBrainType};
   * once the drain has registered the type, read the document id of a value
   * with {@link BrainTypeBinding.documentIdOf}.
   */
  export class BrainTypeBinding extends StructTypeBinding {
    constructor() {
      super();
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
