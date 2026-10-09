/**
 * Named choices as Wendoo values: a plain struct type whose values each name
 * one of Arcade's own built-in choices -- one of its effects, one of its
 * melodies -- by the name Arcade's API gives it, in one read-only string
 * field. A value holds the name only; the Arcade object it names is looked up
 * when a tile uses it, and a name Arcade holds no object under is logged once
 * per game run and read as no choice.
 */
namespace wendoo {
  /** Name of a named-choice type's one field: the name of the Arcade object a value names. */
  //% hidden
  export const CHOICE_NAME_FIELD = "name";

  /** A named-choice type's declared fields: `name`, the read-only name of the Arcade object a value names. */
  //% hidden
  export function namedChoiceFields(): StructFieldSpec[] {
    return [readOnlyField(CHOICE_NAME_FIELD, TYPE_STRING)];
  }

  /**
   * A named-choice type's declared literals, one per name in `names`, in
   * order: each keyed by its name, labelled by the label at the same position
   * of `labels`, and holding its name in the `name` field. The keys are public
   * identity in saved programs: never rename or reuse one.
   *
   * @param names - The names Arcade's API gives the choices, each distinct.
   * @param labels - The label of each choice, at its name's position.
   */
  //% hidden
  export function namedChoiceLiterals(names: string[], labels: string[]): TypeLiteral[] {
    const literals: TypeLiteral[] = [];
    for (let i = 0; i < names.length; i++) {
      literals.push(typeLiteral(names[i], labels[i], [literalField(CHOICE_NAME_FIELD, mkString(names[i]))]));
    }
    return literals;
  }

  /**
   * The binding of a named-choice type: reads the name a value holds, and
   * logs, once per game run, a value naming nothing its type's lookup holds.
   */
  //% hidden
  export class NamedChoiceBinding extends StructTypeBinding {
    /** Log code of a value naming nothing, logged as `wendoo <code>`. */
    private unusableCode: string;
    /** Whether a value naming nothing has been logged in this game run. */
    private unusableLogged = false;

    /**
     * @param unusableCode - Log code of a value of the type naming nothing.
     */
    constructor(unusableCode: string) {
      super();
      this.unusableCode = unusableCode;
    }

    /**
     * The name `value` holds in its `name` field, or `""` when `value` is not
     * a value of this type holding a string, nil included.
     *
     * @param value - Any value a program produced.
     */
    nameOf(value: Value): string {
      if (!value || value.t !== ValueTag.Struct || value.typeId !== this.typeId) {
        return "";
      }
      const held = value.fields[this.fieldIds[0]];
      return held && held.t === ValueTag.String ? held.str : "";
    }

    /**
     * Whether `value` fills its slot: neither `undefined` nor nil.
     *
     * @param value - The slot's value.
     */
    isPlaced(value: Value): boolean {
      return value !== undefined && value.t !== ValueTag.Nil;
    }

    /** Log this type's unusable code, the first time in this game run while {@link debug} is on. */
    reportUnusable(): void {
      if (!this.unusableLogged) {
        this.unusableLogged = true;
        debugLog(`wendoo ${this.unusableCode}`);
      }
    }
  }
}
