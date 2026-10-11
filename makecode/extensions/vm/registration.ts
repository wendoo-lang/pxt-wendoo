/**
 * The registration surface a MakeCode extension declares Wendoo vocabulary
 * through, and the drain that moves what it collected into the registries a
 * brain runtime resolves against.
 *
 * An extension registers from its own top-level code, which runs at program
 * start, before anything constructs a runtime. Registrations are keyed by
 * name and carry no ids; the drain gives each name the id the project's
 * mapping records for it, and closes registration. A struct type's fields
 * take their ids from the mapping too, so the type's storage layout is the
 * mapping's, never the order the fields are declared in.
 *
 * A registration also carries its declared shape and catalog metadata --
 * fields (each with its accessor tile's metadata), an asset type's asset
 * kind, argument grammar (each slot with its tile's display label, sentence
 * words and icon), returns, outputs,
 * consumed WHEN result, a sensor's inline and writable-result flags, a struct
 * type's variable factory flag, declared literals and variable initial,
 * label, group, docs, icon, sentence words. A
 * pack may also give core tiles icons, and add overloads to core operators.
 * The drain installs behavior only and
 * ignores all of it; the catalog serializer reads it through
 * {@link writeCatalogEntries}.
 *
 * Nothing in registration is fatal. A registration that cannot be honoured is
 * ignored and recorded in {@link registrationDiagnostics}, and the program
 * runs on.
 */
namespace wendoo {
  /** Diagnostic code: two registrations claimed one name; the earlier one stands and the later is ignored. */
  export const REGISTRATION_DUPLICATE_NAME = "registration-duplicate-name";

  /** Diagnostic code: a registration arrived after the registries were populated, and was ignored. */
  export const REGISTRATION_AFTER_SNAPSHOT = "registration-after-snapshot";

  /** Diagnostic code: the mapping records no id for a registered name, which is therefore left unbound. */
  export const REGISTRATION_UNMAPPED_NAME = "registration-unmapped-name";

  /**
   * Diagnostic code: a type reads its fields through a field getter and
   * declares them writable, but registers no field setter, so a brain's write
   * lands in the value's own field slots, which the getter never reads.
   */
  export const REGISTRATION_FIELD_WRITES_UNBOUND = "registration-field-writes-unbound";

  /**
   * The TypeId a struct value of the type named `name` carries.
   *
   * @param name - Wendoo type name, as the type is registered.
   */
  export function structTypeId(name: string): string {
    return `struct:<${name}>`;
  }

  /**
   * The name one field of one struct type is diagnosed under: the type name
   * and the field name, joined by a dot.
   *
   * @param typeName - Wendoo type name, as the type is registered.
   * @param fieldName - Field name, as the type declares it.
   */
  export function structFieldKey(typeName: string, fieldName: string): string {
    return `${typeName}.${fieldName}`;
  }

  /** Diagnostic code: a tile's argument grammar names two of its specs alike, so the tile was ignored. */
  export const REGISTRATION_CALL_SPEC_DUPLICATE_NAME = "registration-call-spec-duplicate-name";

  /**
   * Diagnostic code: an argument slot declares both a default and that the
   * action derives its value, so the tile was ignored.
   */
  export const REGISTRATION_ARG_DEFAULT_AND_DERIVED = "registration-arg-default-and-derived";

  /**
   * Diagnostic code: a slot declared required also declares a default or
   * that the action derives its value, so the tile was ignored.
   */
  export const REGISTRATION_ARG_REQUIRED_WITH_EMPTY_MEANING = "registration-arg-required-with-empty-meaning";

  /** Diagnostic code: an argument slot declares a range carrying neither bound, so the tile was ignored. */
  export const REGISTRATION_ARG_RANGE_UNBOUNDED = "registration-arg-range-unbounded";

  /** Diagnostic code: an argument slot declares a range whose min is above its max, so the tile was ignored. */
  export const REGISTRATION_ARG_RANGE_INVERTED = "registration-arg-range-inverted";

  /**
   * Diagnostic code: an argument slot declares a range and a default that is
   * not a number, so the tile was ignored.
   */
  export const REGISTRATION_ARG_RANGE_NON_NUMERIC = "registration-arg-range-non-numeric";

  /**
   * One registration problem. Diagnostics carry machine-readable fields only:
   * a stable {@link RegistrationDiagnostic.code} and the names the problem is
   * about.
   */
  export class RegistrationDiagnostic {
    /** Stable code of the problem. */
    code: string;
    /** Registration name the problem is about. */
    name: string;
    /** Pack whose registration the problem is reported against. */
    pack: string;
    /** Pack holding the registration that stands, or `""` when the code names no second registration. */
    otherPack: string;
    /** Name of the call spec within the registration the problem is about, or `""` when the code names none. */
    spec: string;

    constructor(code: string, name: string, pack: string, otherPack: string, spec: string) {
      this.code = code;
      this.name = name;
      this.pack = pack;
      this.otherPack = otherPack;
      this.spec = spec;
    }
  }

  /**
   * The name-to-id mapping the drain applies: one id space per kind of
   * registration -- host-action ids for tiles, host-function ids for
   * operators, type-atom ids for struct types -- and, per struct type, the
   * ids of its fields. Build it from the project's committed mapping before
   * draining.
   */
  export class RegistrationIdMap {
    private actionNames: string[] = [];
    private actionIds: number[] = [];
    private operatorNames: string[] = [];
    private operatorIds: number[] = [];
    private typeNames: string[] = [];
    private typeAtomIds: number[] = [];
    private typeFields: string[][] = [];

    constructor() {}

    /**
     * Record the host-action id of the tile `name`. A name recorded twice
     * keeps the id it was first recorded with.
     *
     * @param name - Tile name.
     * @param id - Host-action id the drain gives the tile.
     */
    addAction(name: string, id: number): void {
      this.actionNames.push(name);
      this.actionIds.push(id);
    }

    /**
     * Record the host-function id of the operator `name`. A name recorded
     * twice keeps the id it was first recorded with.
     *
     * @param name - Operator name.
     * @param id - Host-function id the drain gives the operator.
     */
    addOperator(name: string, id: number): void {
      this.operatorNames.push(name);
      this.operatorIds.push(id);
    }

    /**
     * Record the type-atom id of the struct type `name` and the ids of its
     * fields: each field's id is its position in `fieldNames`. A name
     * recorded twice keeps what it was first recorded with.
     *
     * @param name - Type name.
     * @param atomId - Type-atom id the drain gives the type.
     * @param fieldNames - Every field name the mapping allocates for the type, each at the position that is its id.
     */
    addType(name: string, atomId: number, fieldNames: string[]): void {
      this.typeNames.push(name);
      this.typeAtomIds.push(atomId);
      this.typeFields.push(fieldNames);
    }

    /**
     * The host-action id recorded for the tile `name`, or
     * {@link UNASSIGNED_ID} when none is.
     *
     * @param name - Tile name.
     */
    actionId(name: string): number {
      const index = this.actionNames.indexOf(name);
      return index >= 0 ? this.actionIds[index] : UNASSIGNED_ID;
    }

    /**
     * The host-function id recorded for the operator `name`, or
     * {@link UNASSIGNED_ID} when none is.
     *
     * @param name - Operator name.
     */
    operatorId(name: string): number {
      const index = this.operatorNames.indexOf(name);
      return index >= 0 ? this.operatorIds[index] : UNASSIGNED_ID;
    }

    /**
     * The type-atom id recorded for the struct type `name`, or
     * {@link UNASSIGNED_ID} when none is.
     *
     * @param name - Type name.
     */
    typeAtomId(name: string): number {
      const index = this.typeNames.indexOf(name);
      return index >= 0 ? this.typeAtomIds[index] : UNASSIGNED_ID;
    }

    /**
     * The id recorded for the field `fieldName` of the struct type
     * `typeName`, or {@link UNASSIGNED_ID} when none is.
     *
     * @param typeName - Type name.
     * @param fieldName - Field name.
     */
    fieldId(typeName: string, fieldName: string): number {
      const index = this.typeNames.indexOf(typeName);
      return index >= 0 ? this.typeFields[index].indexOf(fieldName) : UNASSIGNED_ID;
    }

    /**
     * Whether some tile is recorded under the host-action id `id`.
     *
     * @param id - Host-action id.
     */
    hasActionId(id: number): boolean {
      return this.actionIds.indexOf(id) >= 0;
    }

    /**
     * Whether some operator is recorded under the host-function id `id`.
     *
     * @param id - Host-function id.
     */
    hasOperatorId(id: number): boolean {
      return this.operatorIds.indexOf(id) >= 0;
    }

    /**
     * Whether some struct type is recorded under the type-atom id `atomId`.
     *
     * @param atomId - Type-atom id.
     */
    hasTypeAtomId(atomId: number): boolean {
      return this.typeAtomIds.indexOf(atomId) >= 0;
    }
  }

  /** Tile kind of a sensor: a tile a brain reads a value through. */
  export const TILE_KIND_SENSOR = "sensor";

  /** Tile kind of an actuator: a tile a brain acts on the world through. */
  export const TILE_KIND_ACTUATOR = "actuator";

  /*
   * The core types, each named twice. A `TYPE_*` constant is the type's
   * name: what a declared field, slot, return, output, operand or
   * consumed WHEN result refers to the type by, and what the catalog
   * carries. A `TYPE_ID_*` constant is the type's TypeId: what a runtime
   * call taking a TypeId, such as {@link setActionOutput}, is given. Both
   * sets are the reference VM's core types, name for name.
   */

  /** Type name of the unknown type. */
  export const TYPE_UNKNOWN = "unknown";

  /** Type name of the void type. */
  export const TYPE_VOID = "void";

  /** Type name of the nil type. */
  export const TYPE_NIL = "nil";

  /** Type name of the boolean type. */
  export const TYPE_BOOLEAN = "boolean";

  /** Type name of the number type. */
  export const TYPE_NUMBER = "number";

  /** Type name of the string type. */
  export const TYPE_STRING = "string";

  /** Type name of the any type: a slot of this type accepts every value kind. */
  export const TYPE_ANY = "any";

  /** Type name of the function type. */
  export const TYPE_FUNCTION = "function";

  /** Type name of the buffer type. */
  export const TYPE_BUFFER = "buffer";

  /** TypeId of the unknown type. */
  export const TYPE_ID_UNKNOWN = "unknown:<unknown>";

  /** TypeId of the void type. */
  export const TYPE_ID_VOID = "void:<void>";

  /** TypeId of the nil type. */
  export const TYPE_ID_NIL = "nil:<nil>";

  /** TypeId of the boolean type. */
  export const TYPE_ID_BOOLEAN = "boolean:<boolean>";

  /** TypeId of the number type. */
  export const TYPE_ID_NUMBER = "number:<number>";

  /** TypeId of the string type. */
  export const TYPE_ID_STRING = "string:<string>";

  /** TypeId of the any type. */
  export const TYPE_ID_ANY = "any:<any>";

  /** TypeId of the function type. */
  export const TYPE_ID_FUNCTION = "function:<function>";

  /** TypeId of the buffer type. */
  export const TYPE_ID_BUFFER = "buffer:<buffer>";

  /*
   * The core operators' ids, the reference VM's core operator ids, id for id:
   * what {@link Pack.overloadOperator} is given to add an overload to one of
   * them, and what the catalog carries as the operator an overload extends.
   */

  /** Id of the core logical AND operator. */
  export const OPERATOR_AND = "and";

  /** Id of the core logical OR operator. */
  export const OPERATOR_OR = "or";

  /** Id of the core logical NOT operator. */
  export const OPERATOR_NOT = "not";

  /** Id of the core addition operator. */
  export const OPERATOR_ADD = "add";

  /** Id of the core subtraction operator. */
  export const OPERATOR_SUBTRACT = "sub";

  /** Id of the core multiplication operator. */
  export const OPERATOR_MULTIPLY = "mul";

  /** Id of the core division operator. */
  export const OPERATOR_DIVIDE = "div";

  /** Id of the core remainder operator. */
  export const OPERATOR_MODULO = "mod";

  /** Id of the core negation operator. */
  export const OPERATOR_NEGATE = "neg";

  /** Id of the core equality operator. */
  export const OPERATOR_EQUAL_TO = "eq";

  /** Id of the core inequality operator. */
  export const OPERATOR_NOT_EQUAL_TO = "ne";

  /** Id of the core less-than operator. */
  export const OPERATOR_LESS_THAN = "lt";

  /** Id of the core less-than-or-equal operator. */
  export const OPERATOR_LESS_THAN_OR_EQUAL_TO = "le";

  /** Id of the core greater-than operator. */
  export const OPERATOR_GREATER_THAN = "gt";

  /** Id of the core greater-than-or-equal operator. */
  export const OPERATOR_GREATER_THAN_OR_EQUAL_TO = "ge";

  /** Id of the core power operator. */
  export const OPERATOR_POWER = "pow";

  /** Id of the core bitwise AND operator. */
  export const OPERATOR_BITWISE_AND = "bitand";

  /** Id of the core bitwise OR operator. */
  export const OPERATOR_BITWISE_OR = "bitor";

  /** Id of the core bitwise XOR operator. */
  export const OPERATOR_BITWISE_XOR = "bitxor";

  /** Id of the core bitwise NOT operator. */
  export const OPERATOR_BITWISE_NOT = "bitnot";

  /** Id of the core left shift operator. */
  export const OPERATOR_LEFT_SHIFT = "shl";

  /** Id of the core right shift operator. */
  export const OPERATOR_RIGHT_SHIFT = "shr";

  /** Id of the core assignment operator. */
  export const OPERATOR_ASSIGN = "assign";

  /**
   * Catalog metadata of one registration: what the Wendoo editor shows for
   * it. Every field is optional catalog data; the runtime reads none of them.
   */
  export class CatalogMeta {
    /** Display label; `""` when none is declared. */
    label: string = "";
    /** Palette group the registration is listed under; `""` when none is declared. */
    group: string = "";
    /** Markdown document of the registration; `""` when none is declared. */
    docs: string = "";
    /**
     * Icon in the host target's own icon form, or `undefined` when none is
     * declared. Opaque: only a host-supplied {@link CatalogIconEncoder}
     * renders it.
     */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    icon: any;

    constructor() {}
  }

  /** One field value a declared literal holds: the field, by the name its type declares it under, and the value. */
  export class LiteralFieldValue {
    /** Field name, as the literal's type declares the field. */
    name: string;
    /** The value the literal holds in the field, of the field's type. */
    value: Value;

    constructor(name: string, value: Value) {
      this.name = name;
      this.value = value;
    }
  }

  /**
   * The value `value` held in the field `name` of a declared literal.
   *
   * @param name - Field name, as the literal's type declares the field.
   * @param value - The value the literal holds in the field.
   */
  export function literalField(name: string, value: Value): LiteralFieldValue {
    return new LiteralFieldValue(name, value);
  }

  /**
   * One literal a struct type declares: a value of the type the Wendoo
   * editor offers as a literal tile of its own. Catalog data only: the drain
   * ignores it.
   *
   * The {@link TypeLiteral.key} is the literal's public identity: a saved
   * program places the literal by it from the first save on. Keys are
   * append-only, as tile ids are -- never renamed, and never reused for
   * another value, a retired literal's key staying reserved.
   */
  export class TypeLiteral {
    /** The literal's identity among the literals of its type: durable, append-only, never shown. */
    key: string;
    /** Display label of the literal's tile; `""` when undeclared, and the editor shows the key. */
    label: string;
    /**
     * The value the literal holds in each field it sets, by field name; a
     * field it sets no value in holds nil.
     */
    fields: LiteralFieldValue[];

    constructor(key: string, label: string, fields: LiteralFieldValue[]) {
      this.key = key;
      this.label = label;
      this.fields = fields;
    }
  }

  /**
   * A literal of a struct type, declared through {@link TypeMeta.literals}.
   *
   * @param key - The literal's durable identity among its type's literals; see {@link TypeLiteral.key}.
   * @param label - Display label of the literal's tile; `""` to declare none.
   * @param fields - The value the literal holds in each field it sets, each built with {@link literalField}.
   */
  export function typeLiteral(key: string, label: string, fields: LiteralFieldValue[]): TypeLiteral {
    return new TypeLiteral(key, label, fields);
  }

  /**
   * Catalog metadata of one struct type: what the Wendoo editor shows and
   * offers for it. Catalog data only, like every {@link CatalogMeta}: the
   * runtime reads none of it.
   */
  export class TypeMeta extends CatalogMeta {
    /**
     * Whether brains may hold variables of the type: the Wendoo editor offers
     * a variable factory for it, minting variable tiles of the type.
     */
    variableFactory: boolean = false;
    /**
     * The literals the type declares, in the order the editor offers them,
     * each built with {@link typeLiteral}; every key among them distinct.
     * Each key is public identity from the first save of a program placing
     * its literal: append-only, as {@link TypeLiteral.key} states.
     */
    literals: TypeLiteral[] = [];
    /**
     * Key of the declared literal every variable of the type starts holding,
     * from program start and at every reseed, each variable its own fresh
     * copy; `""` when the type declares none, so its variables start nil
     * until a brain writes them. Must name one of {@link literals}.
     */
    variableInitial: string = "";

    constructor() {
      super();
    }
  }

  /** Sentence frame of a sensor that reads as an action, as in "When I hear a bang". */
  export const SENTENCE_FRAME_VERB = "verb";

  /** Sentence frame of a sensor that reads as a condition, worded with the locale's copula, as in "When I am hungry". */
  export const SENTENCE_FRAME_STATE = "state";

  /** Sentence frame of a sensor that reads as a happening, as in "When my timer ends". */
  export const SENTENCE_FRAME_EVENT = "event";

  /**
   * The words the Wendoo editor reads a tile with in the sentence it shows
   * for a rule. Every field is optional, `""` when undeclared, and the
   * editor supplies a default for each, so a tile declaring none still
   * reads. Catalog data only: the runtime reads none of it.
   */
  export class TileLanguage {
    /** The tile's word in a sentence, such as `"press"`; `""` reads the tile by its label. */
    form: string = "";
    /**
     * Which sentence template reads a sensor heading a rule's WHEN side: one
     * of the `SENTENCE_FRAME_*` tokens. `""` reads it as
     * {@link SENTENCE_FRAME_VERB}. No other tile is read through a frame.
     */
    frame: string = "";
    /**
     * Word completing the sentence when a sensor heads a WHEN side with no
     * tile after it, such as `"anything"`. `""` takes the default: under the
     * verb frame, `"anything"` for a sensor declaring an argument slot;
     * otherwise nothing.
     */
    bare: string = "";

    constructor() {}
  }

  /**
   * Sentence words for a {@link TileSpec.language} or a slot's
   * {@link ArgSlotSpec.language}.
   *
   * @param form - The tile's word in a sentence; `""` to declare none. See {@link TileLanguage.form}.
   * @param frame - A `SENTENCE_FRAME_*` token; omit to declare none. See {@link TileLanguage.frame}.
   * @param bare - The word completing a WHEN side the sensor heads alone; omit to declare none. See {@link TileLanguage.bare}.
   */
  export function tileLanguage(form: string, frame?: string, bare?: string): TileLanguage {
    const language = new TileLanguage();
    language.form = form;
    if (frame) {
      language.frame = frame;
    }
    if (bare) {
      language.bare = bare;
    }
    return language;
  }

  /** One declared field of a struct type: its name, its value type, its writability, and its accessor tile. */
  export class StructFieldSpec {
    /** Field name, as brains address it. */
    name: string;
    /** Type name of the field's value. */
    type: string;
    /** Whether brains can only read the field. */
    readOnly: boolean;
    /**
     * Catalog metadata of the field's accessor tile -- the tile a brain
     * places after a value of the type to read the field, and to write it
     * when the field is writable -- or `undefined` when the field has no
     * accessor tile. Set it with {@link withAccessor}. Catalog data only: the
     * drain ignores it.
     */
    accessor: CatalogMeta = undefined;

    constructor(name: string, type: string, readOnly: boolean) {
      this.name = name;
      this.type = type;
      this.readOnly = readOnly;
    }
  }

  /**
   * A writable struct field.
   *
   * @param name - Field name.
   * @param type - Type name of the field's value.
   */
  export function field(name: string, type: string): StructFieldSpec {
    return new StructFieldSpec(name, type, false);
  }

  /**
   * A struct field brains can only read.
   *
   * @param name - Field name.
   * @param type - Type name of the field's value.
   */
  export function readOnlyField(name: string, type: string): StructFieldSpec {
    return new StructFieldSpec(name, type, true);
  }

  /**
   * `spec`, given an accessor tile: a tile reading the field, and writing it
   * unless the field is read-only. Set further catalog metadata, such as
   * docs, on the returned field's {@link StructFieldSpec.accessor}.
   *
   * @param spec - The field the accessor tile reads.
   * @param label - Display label of the accessor tile; omit to declare none, and the editor labels it by the field's name.
   * @param icon - Icon of the accessor tile, in the host target's own icon form; omit to declare none.
   */
  // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
  export function withAccessor(spec: StructFieldSpec, label?: string, icon?: any): StructFieldSpec {
    const meta = new CatalogMeta();
    if (label) {
      meta.label = label;
    }
    meta.icon = icon;
    spec.accessor = meta;
    return spec;
  }

  /** Call-spec kind of an argument slot: {@link ArgSlotSpec}. */
  export const CALL_SPEC_ARG = "arg";

  /** Call-spec kind of a sequence, whose items match in order: {@link SeqSpec}. */
  export const CALL_SPEC_SEQ = "seq";

  /** Call-spec kind of a choice, of whose options exactly one matches: {@link ChoiceSpec}. */
  export const CALL_SPEC_CHOICE = "choice";

  /** Call-spec kind of an optional item, matching zero or one time: {@link OptionalSpec}. */
  export const CALL_SPEC_OPTIONAL = "optional";

  /** Call-spec kind of a repeated item, matching between a min and a max count: {@link RepeatSpec}. */
  export const CALL_SPEC_REPEAT = "repeat";

  /** Call-spec kind of a bag, whose items match in any order: {@link BagSpec}. */
  export const CALL_SPEC_BAG = "bag";

  /** Call-spec kind of a conditional, matching one item or another by whether a named spec matched: {@link ConditionalSpec}. */
  export const CALL_SPEC_CONDITIONAL = "conditional";

  /** Range overflow token: the action holds a value outside the range at the bound it exceeded, and proceeds. */
  export const ARG_ON_EXCEED_CLAMP = "clamp";

  /** Range overflow token: the action brings a value outside the range back into it by modulus, and proceeds. */
  export const ARG_ON_EXCEED_WRAP = "wrap";

  /** Range overflow token: the action completes without doing anything when a value is outside the range. */
  export const ARG_ON_EXCEED_DROP = "drop";

  /**
   * One node of a tile's argument grammar: an argument slot
   * ({@link ArgSlotSpec}), or a construct over nodes -- {@link SeqSpec},
   * {@link ChoiceSpec}, {@link OptionalSpec}, {@link RepeatSpec},
   * {@link BagSpec} or {@link ConditionalSpec}. Build nodes with the
   * builders beside these classes; read {@link TileArgSpec.kind} to tell
   * which class a node is.
   */
  export class TileArgSpec {
    /** Which construct the node is: one of the `CALL_SPEC_*` kinds. */
    kind: string;
    /**
     * Name identifying the node to the grammar, unique among the names in
     * one tile's grammar; a {@link ConditionalSpec} tests a name. `""` when
     * the node is unnamed. Set it after building the node.
     */
    name: string;

    constructor(kind: string, name: string) {
      this.kind = kind;
      this.name = name;
    }
  }

  /**
   * The bounds an action holds a numeric argument slot to, and what it does
   * with a value outside them. A bound left out is unbounded on its side.
   */
  export class ArgRange {
    /** Whether the range declares a lower bound. */
    hasMin: boolean;
    /** Smallest value the action accepts; read only when {@link ArgRange.hasMin}. */
    min: number;
    /** Whether the range declares an upper bound. */
    hasMax: boolean;
    /** Largest value the action accepts; read only when {@link ArgRange.hasMax}. */
    max: number;
    /** What the action does with a value outside the bounds: one of the `ARG_ON_EXCEED_*` tokens. */
    onExceed: string;

    constructor(hasMin: boolean, min: number, hasMax: boolean, max: number, onExceed: string) {
      this.hasMin = hasMin;
      this.min = min;
      this.hasMax = hasMax;
      this.max = max;
      this.onExceed = onExceed;
    }
  }

  /**
   * A range bounded on both sides.
   *
   * @param min - Smallest value the action accepts.
   * @param max - Largest value the action accepts.
   * @param onExceed - What the action does with a value outside the range: an `ARG_ON_EXCEED_*` token.
   */
  export function argRange(min: number, max: number, onExceed: string): ArgRange {
    return new ArgRange(true, min, true, max, onExceed);
  }

  /**
   * A range bounded below only.
   *
   * @param min - Smallest value the action accepts.
   * @param onExceed - What the action does with a value below it: an `ARG_ON_EXCEED_*` token.
   */
  export function argRangeAtLeast(min: number, onExceed: string): ArgRange {
    return new ArgRange(true, min, false, 0, onExceed);
  }

  /**
   * A range bounded above only.
   *
   * @param max - Largest value the action accepts.
   * @param onExceed - What the action does with a value above it: an `ARG_ON_EXCEED_*` token.
   */
  export function argRangeAtMost(max: number, onExceed: string): ArgRange {
    return new ArgRange(false, 0, true, max, onExceed);
  }

  /**
   * One argument slot: a parameter slot carrying a typed value, or a
   * modifier slot whose presence is the argument. Inside a sequence a slot
   * must be filled unless it is declared not required; wrap it in
   * {@link optional} to let it be left out wherever it stands.
   *
   * A slot is filled by the tile {@link ArgSlotSpec.tileId} names. One tile
   * may fill several slots of a grammar; name the slots to tell them apart.
   *
   * The options after {@link ArgSlotSpec.isModifier} describe the slot for
   * the editor; the drain reads none of them.
   */
  export class ArgSlotSpec extends TileArgSpec {
    /**
     * Identity of the tile that fills the slot. A fragment starting
     * `parameter.` or `modifier.` names a tile shared by every pack and tile
     * declaring the same fragment; any other fragment names a tile private to
     * the tile declaring the slot. An anonymous slot is filled by a bare value
     * expression of its type, so no tile of its own fills it.
     */
    tileId: string;
    /** Type name of the slot's value; `""` on a modifier slot. */
    type: string;
    /** Whether the slot is a modifier: matched by its own tile, carrying no value. */
    isModifier: boolean;
    /** Whether a bare value expression fills the slot, with no tile of the slot's own before it. */
    anonymous: boolean = false;
    /**
     * The value the action acts on when the slot is left empty, or
     * `undefined` when none is declared. Nothing substitutes it into a call.
     * Never declared together with {@link ArgSlotSpec.derived}.
     */
    defaultValue: Value;
    /**
     * Whether the action chooses the slot's value as it runs when the slot
     * is left empty. Never declared together with
     * {@link ArgSlotSpec.defaultValue}.
     */
    derived: boolean = false;
    /** Bounds the action holds the slot's value to, or `undefined` when it accepts any value. Numeric slots only. */
    range: ArgRange;
    /** Unit the slot's value is measured in, as the author writes it; `""` when it counts none. */
    unit: string = "";
    /**
     * Display label of the tile that fills the slot, such as `"away from"`;
     * `""` when none is declared, and the editor labels the tile from
     * {@link ArgSlotSpec.tileId}. Declare one label on every slot a shared
     * tile fills: the editor displays the label of the first one registered.
     */
    label: string = "";
    /**
     * Sentence words of the tile that fills the slot, such as the form
     * `"a carnivore"`; each field `""` when undeclared, and the editor reads
     * the tile by its label. Declare the same words on every slot a shared
     * tile fills: the editor reads the tile with the words of the first one
     * registered.
     */
    language: TileLanguage = new TileLanguage();
    /**
     * Icon of the tile that fills the slot, in the host target's own icon
     * form, or `undefined` when none is declared. Opaque: only a
     * host-supplied {@link CatalogIconEncoder} renders it. Declare the same
     * icon on every slot a shared tile fills: the editor shows the icon of
     * the first one registered.
     */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    icon: any;
    private requiredDeclared: boolean = false;
    private requiredValue: boolean = false;

    constructor(tileId: string, type: string, isModifier: boolean) {
      super(CALL_SPEC_ARG, "");
      this.tileId = tileId;
      this.type = type;
      this.isModifier = isModifier;
    }

    /**
     * Declare whether the slot must be filled. A slot declaring neither must
     * be filled wherever its grammar requires its items; `false` lets it be
     * left empty there. A slot declared required declares no default and is
     * not derived.
     *
     * @param required - Whether the slot must be filled.
     */
    setRequired(required: boolean): void {
      this.requiredDeclared = true;
      this.requiredValue = required;
    }

    /** Whether {@link ArgSlotSpec.setRequired} declared the slot's requirement. */
    declaresRequired(): boolean {
      return this.requiredDeclared;
    }

    /** The requirement {@link ArgSlotSpec.setRequired} declared; `false` when none was declared. */
    isRequired(): boolean {
      return this.requiredValue;
    }

    /** Whether the slot declares a {@link ArgSlotSpec.defaultValue}. */
    declaresDefault(): boolean {
      return this.defaultValue !== undefined && this.defaultValue !== null;
    }
  }

  /** A sequence: every item matches, in order. */
  export class SeqSpec extends TileArgSpec {
    /** The items, in the order they match. */
    items: TileArgSpec[];

    constructor(items: TileArgSpec[]) {
      super(CALL_SPEC_SEQ, "");
      this.items = items;
    }
  }

  /** A choice: exactly one option matches. */
  export class ChoiceSpec extends TileArgSpec {
    /** The options, in the order they are tried. */
    options: TileArgSpec[];

    constructor(options: TileArgSpec[]) {
      super(CALL_SPEC_CHOICE, "");
      this.options = options;
    }
  }

  /** An optional item: it matches zero or one time. */
  export class OptionalSpec extends TileArgSpec {
    /** The item that may be left out. */
    item: TileArgSpec;

    constructor(item: TileArgSpec) {
      super(CALL_SPEC_OPTIONAL, "");
      this.item = item;
    }
  }

  /**
   * A repeated item: it matches at least {@link RepeatSpec.min} times and,
   * when {@link RepeatSpec.hasMax}, at most {@link RepeatSpec.max} times. A
   * repeated parameter slot gathers its values in source order; a repeated
   * modifier slot counts its occurrences.
   */
  export class RepeatSpec extends TileArgSpec {
    /** The item that repeats. */
    item: TileArgSpec;
    /** Fewest matches the item accepts; `0` puts no lower bound on the count. */
    min: number;
    /** Whether the count has an upper bound. */
    hasMax: boolean;
    /** Most matches the item accepts; read only when {@link RepeatSpec.hasMax}. */
    max: number;

    constructor(item: TileArgSpec, min: number, hasMax: boolean, max: number) {
      super(CALL_SPEC_REPEAT, "");
      this.item = item;
      this.min = min;
      this.hasMax = hasMax;
      this.max = max;
    }
  }

  /** A bag: its items match in any order, each at most once; an item not wrapped in {@link optional} must match. */
  export class BagSpec extends TileArgSpec {
    /** The items, in declaration order. */
    items: TileArgSpec[];

    constructor(items: TileArgSpec[]) {
      super(CALL_SPEC_BAG, "");
      this.items = items;
    }
  }

  /**
   * A conditional: {@link ConditionalSpec.thenItem} is available when the
   * spec named {@link ConditionalSpec.condition} has matched, and
   * {@link ConditionalSpec.elseItem}, when there is one, otherwise.
   */
  export class ConditionalSpec extends TileArgSpec {
    /** Name of the spec whose match the conditional tests. */
    condition: string;
    /** The item available when the named spec matched. */
    thenItem: TileArgSpec;
    /** The item available when the named spec did not match, or `undefined` when none is. */
    elseItem: TileArgSpec;

    constructor(condition: string, thenItem: TileArgSpec, elseItem: TileArgSpec) {
      super(CALL_SPEC_CONDITIONAL, "");
      this.condition = condition;
      this.thenItem = thenItem;
      this.elseItem = elseItem;
    }
  }

  /** `slot`, carrying `label` as its {@link ArgSlotSpec.label} when `label` is given and not empty. */
  function labeled(slot: ArgSlotSpec, label: string): ArgSlotSpec {
    if (label) {
      slot.label = label;
    }
    return slot;
  }

  /**
   * A parameter slot: its tile followed by a value expression. The slot is
   * unnamed; set its {@link TileArgSpec.name} to name it.
   *
   * @param tileId - Identity of the parameter tile that fills the slot; see {@link ArgSlotSpec.tileId}.
   * @param type - Type name of the slot's value.
   * @param label - Display label of the parameter tile; omit to declare none. See {@link ArgSlotSpec.label}.
   */
  export function arg(tileId: string, type: string, label?: string): ArgSlotSpec {
    return labeled(new ArgSlotSpec(tileId, type, false), label);
  }

  /**
   * A modifier slot: its tile, carrying no value. The slot is unnamed; set
   * its {@link TileArgSpec.name} to name it.
   *
   * @param tileId - Identity of the modifier tile that fills the slot; see {@link ArgSlotSpec.tileId}.
   * @param label - Display label of the modifier tile, such as `"away from"`; omit to declare none. See {@link ArgSlotSpec.label}.
   * @param language - Sentence words of the modifier tile, built with {@link tileLanguage}; omit to declare none. See {@link ArgSlotSpec.language}.
   */
  export function modifier(tileId: string, label?: string, language?: TileLanguage): ArgSlotSpec {
    const slot = labeled(new ArgSlotSpec(tileId, "", true), label);
    if (language) {
      slot.language = language;
    }
    return slot;
  }

  /**
   * A parameter slot that may be left out: {@link optional} around {@link arg}.
   *
   * @param tileId - Identity of the parameter tile that fills the slot.
   * @param type - Type name of the slot's value.
   * @param label - Display label of the parameter tile; omit to declare none. See {@link ArgSlotSpec.label}.
   */
  export function optionalArg(tileId: string, type: string, label?: string): TileArgSpec {
    return new OptionalSpec(arg(tileId, type, label));
  }

  /**
   * A repeated parameter slot with no upper bound: {@link repeated} around
   * {@link arg}. Several tiles may fill it, gathered in source order.
   *
   * @param tileId - Identity of the parameter tile that fills the slot.
   * @param type - Type name of each fill's value.
   * @param minRepeats - Fewest fills the slot accepts; `0` puts no lower bound on the count.
   * @param label - Display label of the parameter tile; omit to declare none. See {@link ArgSlotSpec.label}.
   */
  export function rest(tileId: string, type: string, minRepeats: number, label?: string): TileArgSpec {
    return new RepeatSpec(arg(tileId, type, label), minRepeats, false, 0);
  }

  /**
   * A sequence: every item of `items` matches, in order.
   *
   * @param items - The items.
   */
  export function seq(items: TileArgSpec[]): SeqSpec {
    return new SeqSpec(items);
  }

  /**
   * A choice: exactly one of `options` matches.
   *
   * @param options - The options, in the order they are tried.
   */
  export function choice(options: TileArgSpec[]): ChoiceSpec {
    return new ChoiceSpec(options);
  }

  /**
   * An optional item: `item` matches zero or one time.
   *
   * @param item - The item that may be left out.
   */
  export function optional(item: TileArgSpec): OptionalSpec {
    return new OptionalSpec(item);
  }

  /**
   * A repeated item with no upper bound on its count.
   *
   * @param item - The item that repeats.
   * @param min - Fewest matches the item accepts; `0` puts no lower bound on the count.
   */
  export function repeated(item: TileArgSpec, min: number): RepeatSpec {
    return new RepeatSpec(item, min, false, 0);
  }

  /**
   * A repeated item with an upper bound on its count.
   *
   * @param item - The item that repeats.
   * @param min - Fewest matches the item accepts; `0` puts no lower bound on the count.
   * @param max - Most matches the item accepts.
   */
  export function repeatedUpTo(item: TileArgSpec, min: number, max: number): RepeatSpec {
    return new RepeatSpec(item, min, true, max);
  }

  /**
   * A bag: the items of `items` match in any order.
   *
   * @param items - The items.
   */
  export function bag(items: TileArgSpec[]): BagSpec {
    return new BagSpec(items);
  }

  /**
   * A conditional: `thenItem` is available when the spec named `condition`
   * has matched, and `elseItem`, when given, otherwise.
   *
   * @param condition - Name of the spec whose match the conditional tests.
   * @param thenItem - The item available when it matched.
   * @param elseItem - The item available when it did not; omit for none.
   */
  export function conditional(condition: string, thenItem: TileArgSpec, elseItem?: TileArgSpec): ConditionalSpec {
    return new ConditionalSpec(condition, thenItem, elseItem);
  }

  /**
   * The nodes directly below `node` in its grammar, in the order the grammar
   * flattens them into argument slots; empty for an argument slot.
   */
  function childSpecs(node: TileArgSpec): TileArgSpec[] {
    if (node.kind === CALL_SPEC_SEQ) {
      return (node as SeqSpec).items;
    }
    if (node.kind === CALL_SPEC_BAG) {
      return (node as BagSpec).items;
    }
    if (node.kind === CALL_SPEC_CHOICE) {
      return (node as ChoiceSpec).options;
    }
    if (node.kind === CALL_SPEC_OPTIONAL) {
      return [(node as OptionalSpec).item];
    }
    if (node.kind === CALL_SPEC_REPEAT) {
      return [(node as RepeatSpec).item];
    }
    if (node.kind === CALL_SPEC_CONDITIONAL) {
      const conditional = node as ConditionalSpec;
      return conditional.elseItem ? [conditional.thenItem, conditional.elseItem] : [conditional.thenItem];
    }
    return [];
  }

  /** The first rule a tile's argument grammar breaks: its diagnostic code, and the spec it breaks it on. */
  class CallSpecProblem {
    code: string;
    spec: string;

    constructor(code: string, spec: string) {
      this.code = code;
      this.spec = spec;
    }
  }

  /** The first spec under `node`, itself included and visited before its children, whose name `seen` already holds. */
  function duplicateSpecName(node: TileArgSpec, seen: string[]): CallSpecProblem {
    if (node.name.length > 0) {
      if (seen.indexOf(node.name) >= 0) {
        return new CallSpecProblem(REGISTRATION_CALL_SPEC_DUPLICATE_NAME, node.name);
      }
      seen.push(node.name);
    }
    const children = childSpecs(node);
    for (let i = 0; i < children.length; i++) {
      const problem = duplicateSpecName(children[i], seen);
      if (problem) {
        return problem;
      }
    }
    return undefined;
  }

  /**
   * The first rule the slot `slot` breaks, or `undefined` when it breaks
   * none. The problem names the slot by its name, or by its tile identity
   * when it is unnamed.
   */
  function argSlotProblem(slot: ArgSlotSpec): CallSpecProblem {
    const where = slot.name.length > 0 ? slot.name : slot.tileId;
    const hasDefault = slot.declaresDefault();
    if (hasDefault && slot.derived) {
      return new CallSpecProblem(REGISTRATION_ARG_DEFAULT_AND_DERIVED, where);
    }
    if (slot.declaresRequired() && slot.isRequired() && (hasDefault || slot.derived)) {
      return new CallSpecProblem(REGISTRATION_ARG_REQUIRED_WITH_EMPTY_MEANING, where);
    }
    const range = slot.range;
    if (!range) {
      return undefined;
    }
    if (!range.hasMin && !range.hasMax) {
      return new CallSpecProblem(REGISTRATION_ARG_RANGE_UNBOUNDED, where);
    }
    if (range.hasMin && range.hasMax && range.min > range.max) {
      return new CallSpecProblem(REGISTRATION_ARG_RANGE_INVERTED, where);
    }
    if (hasDefault && slot.defaultValue.t !== ValueTag.Number) {
      return new CallSpecProblem(REGISTRATION_ARG_RANGE_NON_NUMERIC, where);
    }
    return undefined;
  }

  /** The first rule a slot under `node` breaks, slots visited in flattening order, or `undefined` when none does. */
  function firstArgSlotProblem(node: TileArgSpec): CallSpecProblem {
    if (node.kind === CALL_SPEC_ARG) {
      return argSlotProblem(node as ArgSlotSpec);
    }
    const children = childSpecs(node);
    for (let i = 0; i < children.length; i++) {
      const problem = firstArgSlotProblem(children[i]);
      if (problem) {
        return problem;
      }
    }
    return undefined;
  }

  /**
   * The first rule the argument grammar whose top-level items are `items`
   * breaks, or `undefined` when it breaks none. Names are checked across the
   * whole grammar first -- names only: one tile may fill several slots, named
   * apart or unnamed; then each slot, in flattening order, is checked for
   * a default declared beside derived, a requirement declared beside either,
   * a range carrying no bound, a range whose min is above its max, and a
   * range beside a default that is not a number.
   */
  function callSpecProblem(items: TileArgSpec[]): CallSpecProblem {
    const seen: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const problem = duplicateSpecName(items[i], seen);
      if (problem) {
        return problem;
      }
    }
    for (let i = 0; i < items.length; i++) {
      const problem = firstArgSlotProblem(items[i]);
      if (problem) {
        return problem;
      }
    }
    return undefined;
  }

  /**
   * One named output a tile declares, with what the editor shows for its
   * output tile. A tile writes the output through {@link setActionOutput};
   * the output's own tile reads it back by this name and type.
   */
  export class TileOutputSpec {
    /** Output name, as the tile declares it; with {@link TileOutputSpec.type}, the output's identity. */
    name: string;
    /** Type name of the output's value. */
    type: string;
    /** Display label of the output's tile; `""` when undeclared, and the editor shows the output's name. */
    label: string = "";
    /** Markdown document of the output's tile, verbatim; `""` when undeclared. */
    docs: string = "";
    /** Icon of the output's tile, in the form the host target's catalog icon encoder renders; `undefined` when undeclared. */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    icon: any = undefined;
    /**
     * Whether the output's value is a live reference a brain may write a
     * field through, as in assigning to an accessor tile placed after the
     * output's tile.
     */
    writableResult: boolean = false;

    constructor(name: string, type: string) {
      this.name = name;
      this.type = type;
    }
  }

  /**
   * A named output of a tile.
   *
   * @param name - Output name.
   * @param type - Type name of the output's value.
   */
  export function output(name: string, type: string): TileOutputSpec {
    return new TileOutputSpec(name, type);
  }

  /**
   * The declared shape of one tile: its kind, its call surface, and its
   * catalog metadata. Catalog data only: the runtime dispatches the tile
   * through its binding and reads nothing here.
   */
  export class TileSpec extends CatalogMeta {
    /** Tile kind: {@link TILE_KIND_SENSOR} or {@link TILE_KIND_ACTUATOR}. */
    kind: string;
    /**
     * The tile's argument grammar: its top-level items, which match as the
     * items of one {@link bag} -- in any order, each item not wrapped in
     * {@link optional} required. The grammar's argument slots, in the order
     * the items and the nodes under them are declared, are the positions of
     * the tile's argument buffer.
     */
    args: TileArgSpec[];
    /** Type name of the value the tile evaluates to; `""` when it produces none. */
    returns: string;
    /** Named outputs the tile declares. */
    outputs: TileOutputSpec[] = [];
    /**
     * Type name of the rule's WHEN result the tile requires; the editor
     * offers the tile only where a WHEN result of that type is available.
     * `""` when the tile does not consume the WHEN result.
     */
    consumesWhenResult: string = "";
    /** Sentence words of the tile; each field `""` when undeclared, and the editor reads the tile by its label. */
    language: TileLanguage = new TileLanguage();
    /**
     * Whether a sensor taking no arguments reads as a value inside an
     * expression, so operators and accessor tiles may follow it. Read on
     * sensors only.
     */
    inline: boolean = false;
    /**
     * Whether a sensor's result is a live reference a brain may write a
     * field through, as in assigning to an accessor tile placed after it.
     * Read on sensors only.
     */
    writableResult: boolean = false;

    constructor(kind: string, args: TileArgSpec[], returns: string) {
      super();
      this.kind = kind;
      this.args = args;
      this.returns = returns;
    }
  }

  /** The declared shape of one operator: its operand types and its result type. */
  export class OperatorSpec {
    /** Type names of the operand slots, in operand order. */
    operands: string[];
    /** Type name of the value the operator evaluates to. */
    returns: string;

    constructor(operands: string[], returns: string) {
      this.operands = operands;
      this.returns = returns;
    }
  }

  /**
   * The name an overload {@link Pack.overloadOperator} adds to the operator
   * `operatorId` over operands of the types `operands` claims, and the name
   * the project's mapping records its host-function id under: the operator
   * id, then the operand type names in operand order, comma-separated in
   * parentheses, as in `eq(Image,Image)`. The name identifies the overload
   * uniquely: an operator holds at most one overload per operand type list.
   *
   * @param operatorId - Id of the operator the overload extends, one of the `OPERATOR_*` ids.
   * @param operands - Type names of the overload's operands, in operand order.
   */
  export function operatorOverloadName(operatorId: string, operands: string[]): string {
    return `${operatorId}(${operands.join(",")})`;
  }

  /** The registries one drain populates, and the mapping it resolves ids through. */
  class DrainTarget {
    ids: RegistrationIdMap;
    functions: HostFunctionRegistry;
    actions: HostActionRegistry;
    types: StructTypeRegistry;

    constructor(
      ids: RegistrationIdMap,
      functions: HostFunctionRegistry,
      actions: HostActionRegistry,
      types: StructTypeRegistry
    ) {
      this.ids = ids;
      this.functions = functions;
      this.actions = actions;
      this.types = types;
    }
  }

  /**
   * One registration waiting for the drain. Subclass and override
   * {@link PendingRegistration.idIn} and {@link PendingRegistration.install}
   * to resolve its id and place it in its registry.
   */
  class PendingRegistration {
    /** Name the registration claims. */
    name: string;
    /** Pack that made the registration. */
    pack: string;

    constructor(name: string, pack: string) {
      this.name = name;
      this.pack = pack;
    }

    /**
     * The id `ids` records for the registration, in its kind's id space, or
     * {@link UNASSIGNED_ID} when none is. The base implementation records
     * none.
     *
     * @param ids - The mapping being applied.
     */
    idIn(ids: RegistrationIdMap): number {
      return UNASSIGNED_ID;
    }

    /**
     * Place the registration in its registry under `id`. The base
     * implementation registers nothing.
     *
     * @param id - Id {@link PendingRegistration.idIn} resolved.
     * @param target - Registries being populated, and the mapping.
     */
    install(id: number, target: DrainTarget): void {}

    /**
     * Stable code of the problem this registration carries although it is
     * honoured, or `""` when it carries none. The base implementation carries
     * none.
     */
    warningCode(): string {
      return "";
    }

    /**
     * The diagnostic of the problem that keeps this registration from being
     * honoured at all, or `undefined` when it has none. The base
     * implementation has none.
     */
    declarationProblem(): RegistrationDiagnostic {
      return undefined;
    }

    /**
     * Write the registration's catalog entry through `catalog`. The base
     * implementation writes none.
     *
     * @param catalog - Writer collecting the catalog under this registration's pack.
     */
    writeCatalog(catalog: CatalogWriter): void {}
  }

  /** A struct type waiting for its type-atom id and its field ids. */
  class PendingStructType extends PendingRegistration {
    private fields: StructFieldSpec[];
    private binding: StructTypeBinding;
    private meta: TypeMeta;
    /** Kind of the project assets an asset type's values name; `""` for any other struct type. */
    private assetKind: string;
    /** Whether the type is a brain type, its values each naming one of the project's brains. */
    private brain: boolean;

    constructor(
      name: string,
      pack: string,
      fields: StructFieldSpec[],
      binding: StructTypeBinding,
      meta: TypeMeta,
      assetKind: string,
      brain: boolean
    ) {
      super(name, pack);
      this.fields = fields;
      this.binding = binding;
      this.meta = meta;
      this.assetKind = assetKind;
      this.brain = brain;
    }

    idIn(ids: RegistrationIdMap): number {
      return ids.typeAtomId(this.name);
    }

    install(id: number, target: DrainTarget): void {
      const fieldIds: number[] = [];
      for (let i = 0; i < this.fields.length; i++) {
        const fieldId = target.ids.fieldId(this.name, this.fields[i].name);
        if (fieldId === UNASSIGNED_ID) {
          diagnose(REGISTRATION_UNMAPPED_NAME, structFieldKey(this.name, this.fields[i].name), this.pack, "");
        }
        fieldIds.push(fieldId);
      }
      target.types.register(structTypeId(this.name), id, fieldIds, this.binding);
    }

    warningCode(): string {
      const writesUnbound =
        this.binding.hasFieldGetter && !this.binding.hasFieldSetter && !this.binding.fieldsAreReadOnly;
      return writesUnbound ? REGISTRATION_FIELD_WRITES_UNBOUND : "";
    }

    writeCatalog(catalog: CatalogWriter): void {
      const native = this.binding.hasFieldGetter || this.binding.hasFieldSetter || this.binding.hasSnapshotNative;
      catalog.struct(
        this.pack,
        this.name,
        this.fields,
        native,
        this.binding.hasFieldSetter,
        this.assetKind,
        this.brain,
        this.meta
      );
    }
  }

  /** A sensor or actuator waiting for its action id. */
  class PendingHostAction extends PendingRegistration {
    private binding: HostActionBinding;
    private spec: TileSpec;

    constructor(name: string, pack: string, binding: HostActionBinding, spec: TileSpec) {
      super(name, pack);
      this.binding = binding;
      this.spec = spec;
    }

    idIn(ids: RegistrationIdMap): number {
      return ids.actionId(this.name);
    }

    install(id: number, target: DrainTarget): void {
      target.actions.register(id, this.name, this.binding);
    }

    declarationProblem(): RegistrationDiagnostic {
      if (!this.spec) {
        return undefined;
      }
      const problem = callSpecProblem(this.spec.args);
      return problem ? new RegistrationDiagnostic(problem.code, this.name, this.pack, "", problem.spec) : undefined;
    }

    writeCatalog(catalog: CatalogWriter): void {
      catalog.tile(this.pack, this.name, this.binding.isAsync, this.spec);
    }
  }

  /** An operator's implementing host function, waiting for its funcId. */
  class PendingHostFunction extends PendingRegistration {
    private fn: HostFunction;
    private spec: OperatorSpec;

    constructor(name: string, pack: string, fn: HostFunction, spec: OperatorSpec) {
      super(name, pack);
      this.fn = fn;
      this.spec = spec;
    }

    idIn(ids: RegistrationIdMap): number {
      return ids.operatorId(this.name);
    }

    install(id: number, target: DrainTarget): void {
      target.functions.register(id, this.fn);
    }

    writeCatalog(catalog: CatalogWriter): void {
      catalog.operator(this.pack, this.name, this.fn.isAsync, this.spec);
    }
  }

  /**
   * An overload a pack adds to an operator the Wendoo editor's core
   * vocabulary holds, its implementing host function waiting for its funcId.
   */
  class PendingOperatorOverload extends PendingRegistration {
    private operatorId: string;
    private fn: HostFunction;
    private spec: OperatorSpec;

    constructor(pack: string, operatorId: string, fn: HostFunction, spec: OperatorSpec) {
      super(operatorOverloadName(operatorId, spec.operands), pack);
      this.operatorId = operatorId;
      this.fn = fn;
      this.spec = spec;
    }

    idIn(ids: RegistrationIdMap): number {
      return ids.operatorId(this.name);
    }

    install(id: number, target: DrainTarget): void {
      target.functions.register(id, this.fn);
    }

    writeCatalog(catalog: CatalogWriter): void {
      catalog.overload(this.pack, this.name, this.operatorId, this.fn.isAsync, this.spec);
    }
  }

  /** One icon a pack gives a core tile: a tile the Wendoo editor's own core vocabulary holds. */
  class CoreTileIcon {
    /** Id of the core tile, as the Wendoo editor holds it. */
    tileId: string;
    /** Pack that gave the icon. */
    pack: string;
    /** Icon in the host target's own icon form. */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    icon: any;

    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    constructor(tileId: string, pack: string, icon: any) {
      this.tileId = tileId;
      this.pack = pack;
      this.icon = icon;
    }
  }

  /** One icon a pack gives a core type: a type of the Wendoo language's own, such as `number`, which no pack registers. */
  class CoreTypeIcon {
    /** Name of the core type, as the catalog names it. */
    typeName: string;
    /** Pack that gave the icon. */
    pack: string;
    /** Icon in the host target's own icon form. */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    icon: any;

    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    constructor(typeName: string, pack: string, icon: any) {
      this.typeName = typeName;
      this.pack = pack;
      this.icon = icon;
    }
  }

  /** Registrations made since program start, in the order they were made. */
  const pendingRegistrations: PendingRegistration[] = [];

  /** Core tile icons given since program start, in the order they were given. */
  const coreTileIcons: CoreTileIcon[] = [];

  /** Core type icons given since program start, in the order they were given. */
  const coreTypeIcons: CoreTypeIcon[] = [];

  /** Registration problems recorded since program start, in the order they were found. */
  const recordedDiagnostics: RegistrationDiagnostic[] = [];

  /** Whether a drain has taken the registry snapshot, after which registration is closed. */
  let registrationClosed: boolean = false;

  function diagnose(code: string, name: string, pack: string, otherPack: string): void {
    recordedDiagnostics.push(new RegistrationDiagnostic(code, name, pack, otherPack, ""));
  }

  function appendPending(entry: PendingRegistration): void {
    if (registrationClosed) {
      diagnose(REGISTRATION_AFTER_SNAPSHOT, entry.name, entry.pack, "");
      return;
    }
    const problem = entry.declarationProblem();
    if (problem) {
      recordedDiagnostics.push(problem);
      return;
    }
    pendingRegistrations.push(entry);
  }

  /**
   * The registration handle one extension registers its vocabulary through.
   * Obtain it with {@link pack} in the extension's top-level code; every call
   * on it appends to the pending set a drain later moves into the registries.
   */
  export class Pack {
    /** Name the registration diagnostics report this pack by. */
    name: string;

    constructor(name: string) {
      this.name = name;
    }

    /**
     * Register the struct type `name`, whose fields are `fields`. The drain
     * resolves the type's atom id and each field's id from the mapping --
     * the field ids are the type's storage slots, so the order the fields
     * are declared in changes nothing a brain observes -- and gives
     * `binding` the TypeId {@link structTypeId} derives from `name`. A field
     * the mapping records no id for is diagnosed under its
     * {@link structFieldKey} and left without one.
     *
     * @param name - Wendoo type name; struct values of the type carry the TypeId derived from it.
     * @param fields - Field specs, each with its accessor tile if {@link withAccessor} gave it one; the binding's `fieldIds` follow their order.
     * @param binding - Type binding carrying the type's hooks.
     * @param meta - Catalog metadata of the type, its variable factory flag, declared literals and variable initial included; the drain ignores it.
     */
    defineStruct(name: string, fields: StructFieldSpec[], binding: StructTypeBinding, meta?: TypeMeta): void {
      appendPending(new PendingStructType(name, this.name, fields, binding, meta, "", false));
    }

    /**
     * Register the asset type `name`: a struct type whose values each name
     * one of the project's assets of `binding`'s asset kind, by the id the
     * project gives it, in one read-only string field, {@link ASSET_FIELD}.
     * The drain resolves the type's atom id and the field's id from the
     * project's mapping; the catalog entry carries the asset kind.
     *
     * @param name - Wendoo type name; values of the type carry the TypeId {@link structTypeId} derives from it.
     * @param binding - The type's binding, carrying the asset kind; read asset ids through it once the drain has run.
     * @param meta - Catalog metadata of the type, its variable factory flag, declared literals and variable initial included; the drain ignores it.
     */
    defineAssetType(name: string, binding: AssetTypeBinding, meta?: TypeMeta): void {
      const fields = [readOnlyField(ASSET_FIELD, TYPE_STRING)];
      appendPending(new PendingStructType(name, this.name, fields, binding, meta, binding.assetKind, false));
    }

    /**
     * Register the brain type `name`: a struct type whose values each name
     * one of the project's compiled brains by its document id, in one
     * read-only string field, {@link BRAIN_FIELD}. The drain resolves the
     * type's atom id and the field's id from the project's mapping; the
     * catalog entry marks the type as a brain type.
     *
     * @param name - Wendoo type name; values of the type carry the TypeId {@link structTypeId} derives from it.
     * @param binding - The type's binding; read document ids through it once the drain has run.
     * @param meta - Catalog metadata of the type, its variable factory flag, declared literals and variable initial included; the drain ignores it.
     */
    defineBrainType(name: string, binding: BrainTypeBinding, meta?: TypeMeta): void {
      const fields = [readOnlyField(BRAIN_FIELD, TYPE_STRING)];
      appendPending(new PendingStructType(name, this.name, fields, binding, meta, "", true));
    }

    /**
     * Register the sensor or actuator `name`. The drain resolves its action
     * id from the mapping and gives `binding` both the id and the name.
     *
     * A registration whose argument grammar breaks a rule a call spec is
     * held to is ignored: it is recorded under the `REGISTRATION_ARG_*` or
     * {@link REGISTRATION_CALL_SPEC_DUPLICATE_NAME} code of the first rule
     * it breaks, naming the offending spec, and claims no name.
     *
     * @param name - Tile name; the mapping records the action id under it.
     * @param binding - Action binding carrying the tile's body.
     * @param spec - Declared shape and catalog metadata of the tile; the drain ignores it.
     */
    bind(name: string, binding: HostActionBinding, spec?: TileSpec): void {
      appendPending(new PendingHostAction(name, this.name, binding, spec));
    }

    /**
     * Register the host function implementing the operator `name`. The drain
     * resolves its funcId from the mapping and gives `fn` the id.
     *
     * @param name - Operator name; the mapping records the funcId under it.
     * @param fn - Host function computing the operator.
     * @param spec - Declared shape of the operator; the drain ignores it.
     */
    bindOperator(name: string, fn: HostFunction, spec?: OperatorSpec): void {
      appendPending(new PendingHostFunction(name, this.name, fn, spec));
    }

    /**
     * Add an overload to the core operator `operatorId`, over operands of
     * the types `spec` declares: a brain applies the operator's own tile to
     * operands of those types, and no tile of the pack's stands for it. The
     * overload claims the name {@link operatorOverloadName} derives from the
     * operator and the operand types; the drain resolves its funcId from the
     * mapping under that name and gives `fn` the id.
     *
     * @param operatorId - Id of the operator the overload extends: one of the `OPERATOR_*` ids.
     * @param fn - Host function computing the operator over operands of the declared types.
     * @param spec - Declared shape of the overload: its operand types, which name it, and its result type.
     */
    overloadOperator(operatorId: string, fn: HostFunction, spec: OperatorSpec): void {
      appendPending(new PendingOperatorOverload(this.name, operatorId, fn, spec));
    }

    /**
     * Give the core tile `tileId` the icon `icon`: a tile of the Wendoo
     * editor's own core vocabulary, such as an operator or a page tile,
     * which no pack registers. Catalog data only: the catalog carries the
     * icon under this pack, and the drain ignores it. Every icon given is
     * carried, and the editor shows the first one given a tile; it ignores
     * an icon given a tile id it does not hold. An icon given after the
     * drain is ignored and recorded under
     * {@link REGISTRATION_AFTER_SNAPSHOT}, naming `tileId`.
     *
     * @param tileId - Id of the core tile, as the editor holds it, such as `tile.op->and`.
     * @param icon - Icon in the host target's own icon form.
     */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    defineCoreTileIcon(tileId: string, icon: any): void {
      if (registrationClosed) {
        diagnose(REGISTRATION_AFTER_SNAPSHOT, tileId, this.name, "");
        return;
      }
      coreTileIcons.push(new CoreTileIcon(tileId, this.name, icon));
    }

    /**
     * Give the core type `typeName` the icon `icon`: a type of the Wendoo
     * language's own, such as `number`, which no pack registers. Catalog data
     * only: the catalog carries the icon under this pack, and the drain
     * ignores it. Every icon given is carried, and the editor shows the first
     * one given a type; it ignores an icon given a name that is no core type.
     * An icon given after the drain is ignored and recorded under
     * {@link REGISTRATION_AFTER_SNAPSHOT}, naming `typeName`.
     *
     * @param typeName - Name of the core type, as the catalog names it, such as `number`.
     * @param icon - Icon in the host target's own icon form.
     */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    defineCoreTypeIcon(typeName: string, icon: any): void {
      if (registrationClosed) {
        diagnose(REGISTRATION_AFTER_SNAPSHOT, typeName, this.name, "");
        return;
      }
      coreTypeIcons.push(new CoreTypeIcon(typeName, this.name, icon));
    }
  }

  /**
   * Begin registering the vocabulary of the pack `name`. Call it from an
   * extension's top-level code; registrations made through the returned
   * handle are honoured until a drain closes registration.
   *
   * @param name - Pack name; registration diagnostics report the pack by it.
   */
  export function pack(name: string): Pack {
    return new Pack(name);
  }

  /**
   * Move every pending registration into `functions`, `actions` and `types`,
   * giving each the id `ids` records for its name, and close registration so
   * that a later one is ignored with a diagnostic.
   *
   * Call it once while constructing the brain runtime, before decoding any
   * program: decoding validates every type atom a program names against
   * `types`.
   *
   * Two registrations claiming one name resolve first-wins: the earlier one
   * is installed, the later one is ignored, and the diagnostic names both
   * packs. A name the mapping records no id for is left unbound.
   *
   * @param ids - Name-to-id mapping, from the project's committed mapping.
   * @param functions - Host-function registry the program's `HOST_CALL` operands resolve against.
   * @param actions - Host-action registry the program's `HOST_ACTION_CALL` operands resolve against.
   * @param types - Struct type registry the program's type atoms and field hooks resolve against.
   */
  export function applyPendingRegistrations(
    ids: RegistrationIdMap,
    functions: HostFunctionRegistry,
    actions: HostActionRegistry,
    types: StructTypeRegistry
  ): void {
    const target = new DrainTarget(ids, functions, actions, types);
    const claimedNames: string[] = [];
    const claimedBy: string[] = [];
    for (let i = 0; i < pendingRegistrations.length; i++) {
      const entry = pendingRegistrations[i];
      const claimed = claimedNames.indexOf(entry.name);
      if (claimed >= 0) {
        diagnose(REGISTRATION_DUPLICATE_NAME, entry.name, entry.pack, claimedBy[claimed]);
        continue;
      }
      const id = entry.idIn(ids);
      if (id === UNASSIGNED_ID) {
        diagnose(REGISTRATION_UNMAPPED_NAME, entry.name, entry.pack, "");
        continue;
      }
      const warning = entry.warningCode();
      if (warning.length > 0) {
        diagnose(warning, entry.name, entry.pack, "");
      }
      entry.install(id, target);
      claimedNames.push(entry.name);
      claimedBy.push(entry.pack);
    }
    registrationClosed = true;
  }

  /**
   * Every registration problem recorded since program start, in the order it
   * was found. The host surfaces them; the registries are usable whatever
   * they say.
   */
  export function registrationDiagnostics(): RegistrationDiagnostic[] {
    return recordedDiagnostics;
  }

  /**
   * Write one catalog entry per registration through `catalog`, in
   * registration order, then one per core tile icon given, then one per
   * core type icon given, each in the order they were given. Two
   * registrations claiming one name resolve first-wins here as in the
   * drain: only the earlier one's entry is written.
   *
   * @param catalog - Writer collecting the entries by pack.
   */
  export function writeCatalogEntries(catalog: CatalogWriter): void {
    const written: string[] = [];
    for (let i = 0; i < pendingRegistrations.length; i++) {
      const entry = pendingRegistrations[i];
      if (written.indexOf(entry.name) >= 0) {
        continue;
      }
      written.push(entry.name);
      entry.writeCatalog(catalog);
    }
    for (let i = 0; i < coreTileIcons.length; i++) {
      const given = coreTileIcons[i];
      catalog.coreTileIcon(given.pack, given.tileId, given.icon);
    }
    for (let i = 0; i < coreTypeIcons.length; i++) {
      const given = coreTypeIcons[i];
      catalog.coreTypeIcon(given.pack, given.typeName, given.icon);
    }
  }
}
