/** Stable code of a catalog text the editor cannot read as a catalog document. */
export const CATALOG_UNREADABLE = "CATALOG_UNREADABLE";

/**
 * Stable codes of the problems {@link parseCatalog} finds in a catalog entry.
 * An entry carrying one stays listed, and unless its code says otherwise no
 * tile can be made of it; the rest of its pack reads on.
 */
export const CatalogProblemCode = {
  /** A tile names a kind other than `sensor` or `actuator`; the token is the kind. */
  TILE_KIND_UNKNOWN: "CATALOG_TILE_KIND_UNKNOWN",
  /** A tile declares no kind and no argument grammar: its registration declared no shape. */
  TILE_SHAPE_UNDECLARED: "CATALOG_TILE_SHAPE_UNDECLARED",
  /** A node of a tile's argument grammar names a construct the grammar does not have; the token is the construct. */
  CALL_SPEC_KIND_UNKNOWN: "CATALOG_CALL_SPEC_KIND_UNKNOWN",
  /** A slot's range names an overflow behavior other than `clamp`, `wrap` or `drop`; the token is the behavior. */
  ON_EXCEED_UNKNOWN: "CATALOG_ON_EXCEED_UNKNOWN",
  /** Part of an entry does not have the shape the catalog grammar gives it. */
  ENTRY_MALFORMED: "CATALOG_ENTRY_MALFORMED",
  /**
   * The sentence words of a tile or a modifier slot name a frame other than
   * `verb`, `state` or `event`; the token is the frame. Only the frame is
   * dropped: the entry's tile is still made, and reads through the default
   * frame.
   */
  SENTENCE_FRAME_UNKNOWN: "CATALOG_SENTENCE_FRAME_UNKNOWN",
} as const;

/** Union of all {@link CatalogProblemCode} values. */
export type CatalogProblemCode = (typeof CatalogProblemCode)[keyof typeof CatalogProblemCode];

/** One problem {@link parseCatalog} found in a catalog entry. */
export interface CatalogProblem {
  /** What the problem is. */
  readonly code: CatalogProblemCode;
  /** Name of the pack holding the entry. */
  readonly pack: string;
  /** Name of the entry. */
  readonly name: string;
  /** The token the entry carries where the code names one: an unknown kind, construct or overflow behavior. */
  readonly token?: string;
}

/** The catalog metadata of an entry: what the editor shows for it. Each field is absent when undeclared. */
export interface CatalogMeta {
  /** Display label. */
  readonly label?: string;
  /** Palette group the entry is listed under. */
  readonly group?: string;
  /** Markdown document of the entry. */
  readonly docs?: string;
  /** Icon, as a data URI usable as an image source as it is; render it only as an image source, never as markup. */
  readonly iconUrl?: string;
}

/** A sentence frame: the template a sensor heading a rule's WHEN side reads through. */
export type CatalogSentenceFrame = "verb" | "state" | "event";

/** The words a tile reads with in the sentence the editor shows for a rule. Each field is absent when undeclared. */
export interface CatalogLanguage {
  /** The tile's word. */
  readonly form?: string;
  /** The frame a sensor heading a WHEN side reads through. */
  readonly frame?: CatalogSentenceFrame;
  /** The word completing a WHEN side such a sensor heads alone. */
  readonly bare?: string;
}

/** One declared field of a struct type. */
export interface CatalogField {
  /** Field name. */
  readonly name: string;
  /** Type name of the field's value. */
  readonly type: string;
  /** Whether brains can only read the field. */
  readonly readOnly: boolean;
  /**
   * Present on a writable field whose writes the type's field setter takes to
   * host state rather than the value's own storage; absent on any other.
   */
  readonly routed?: true;
  /**
   * The metadata of the field's accessor tile -- the tile placed after a
   * value of the type to read the field, and to write it unless the field is
   * read-only -- or absent when the field has no accessor tile.
   */
  readonly accessor?: CatalogMeta;
}

/** One field value a declared literal holds. */
export interface CatalogLiteralField {
  /** Field name, as the literal's type declares the field. */
  readonly name: string;
  /** The value the literal holds in the field, as its tagged JSON value. */
  readonly value: unknown;
}

/**
 * One literal a struct type declares: a value of the type the editor offers
 * as a literal tile of its own.
 */
export interface CatalogLiteral {
  /**
   * The literal's identity among its type's literals. Public identity in
   * saved brains, which place the literal by a tile id derived from its type
   * and this key.
   */
  readonly key: string;
  /** Display label of the literal's tile, or absent when undeclared. */
  readonly label?: string;
  /** The value the literal holds in each field it sets; a field it sets none in holds nil. */
  readonly fields: readonly CatalogLiteralField[];
}

/** One struct type of a pack. */
export interface CatalogType extends CatalogMeta {
  /** Type name. */
  readonly name: string;
  /** Whether values of the type are backed by host objects. */
  readonly native: boolean;
  /** Declared fields, in declaration order. */
  readonly fields: readonly CatalogField[];
  /**
   * The project asset kind the type's values name, for example `image`, or
   * absent for a type that is no asset type. A value of an asset type names
   * one project asset of that kind by its short id, in its `asset` field.
   */
  readonly asset?: string;
  /**
   * `true` for a brain type, absent for any other type. A value of a brain
   * type names one of the project's brains by its document id, in its `id`
   * field.
   */
  readonly brain?: true;
  /**
   * `true` for a type brains may hold variables of, absent for any other
   * type: the editor offers a variable factory minting variable tiles of it.
   */
  readonly variableFactory?: true;
  /** The literals the type declares, in declaration order. */
  readonly literals: readonly CatalogLiteral[];
  /**
   * Key of the declared literal every variable of the type starts holding, or
   * absent when the type declares none and its variables start nil.
   */
  readonly variableInitial?: string;
}

/** What an action does with a numeric argument outside a slot's range. */
export type CatalogOnExceed = "clamp" | "wrap" | "drop";

/** The bounds an action holds a numeric slot's value to. A bound left out is unbounded on its side. */
export interface CatalogRange {
  /** Smallest value the action accepts. */
  readonly min?: number;
  /** Largest value the action accepts. */
  readonly max?: number;
  /** What the action does with a value outside the bounds. */
  readonly onExceed: CatalogOnExceed;
}

/** One argument slot of a tile's grammar. */
export interface CatalogArgSlot {
  readonly kind: "arg";
  /** Name identifying the slot to the grammar, or absent when the slot is unnamed. */
  readonly name?: string;
  /** Identity of the tile that fills the slot, as the pack declares it. */
  readonly tileId: string;
  /** Whether the slot is a modifier, carrying no value. */
  readonly modifier: boolean;
  /** Type name of a parameter slot's value; absent on a modifier slot. */
  readonly type?: string;
  /** Whether the slot must be filled, or absent when the slot does not declare it. */
  readonly required?: boolean;
  /** Whether a bare value expression fills the slot. */
  readonly anonymous: boolean;
  /** The value the action acts on when the slot is left empty, as its tagged JSON value, or absent. */
  readonly default?: unknown;
  /** Whether the action chooses the slot's value as it runs when the slot is left empty. */
  readonly derived: boolean;
  /** Bounds the action holds the slot's value to, or absent. */
  readonly range?: CatalogRange;
  /** Unit the slot's value is measured in, or absent. */
  readonly unit?: string;
  /** Display label of the tile that fills the slot, or absent when the slot declares none. */
  readonly label?: string;
  /** Sentence words of the tile that fills a modifier slot, or absent when it declares none; a parameter slot carries none. */
  readonly language?: CatalogLanguage;
  /** Icon of the tile that fills the slot, as {@link CatalogMeta.iconUrl} carries one, or absent when the slot carries none. */
  readonly iconUrl?: string;
}

/** A sequence or a bag of grammar nodes. */
export interface CatalogListNode {
  readonly kind: "seq" | "bag";
  readonly name?: string;
  readonly items: readonly CatalogArgNode[];
}

/** A choice among grammar nodes. */
export interface CatalogChoiceNode {
  readonly kind: "choice";
  readonly name?: string;
  readonly options: readonly CatalogArgNode[];
}

/** An optional grammar node. */
export interface CatalogOptionalNode {
  readonly kind: "optional";
  readonly name?: string;
  readonly item: CatalogArgNode;
}

/** A repeated grammar node. */
export interface CatalogRepeatNode {
  readonly kind: "repeat";
  readonly name?: string;
  readonly item: CatalogArgNode;
  /** Fewest matches; absent for no lower bound. */
  readonly min?: number;
  /** Most matches; absent for no upper bound. */
  readonly max?: number;
}

/** A conditional grammar node. */
export interface CatalogConditionalNode {
  readonly kind: "conditional";
  readonly name?: string;
  /** Name of the node whose match the conditional tests. */
  readonly condition: string;
  /** The node available when the named node matched. */
  readonly then: CatalogArgNode;
  /** The node available when it did not, or absent. */
  readonly else?: CatalogArgNode;
}

/** One node of a tile's argument grammar. */
export type CatalogArgNode =
  | CatalogArgSlot
  | CatalogListNode
  | CatalogChoiceNode
  | CatalogOptionalNode
  | CatalogRepeatNode
  | CatalogConditionalNode;

/** One named output a tile declares, with what the editor shows for its output tile. Each display field is absent when undeclared. */
export interface CatalogOutput {
  /** Output name; with `type`, the output's identity. */
  readonly name: string;
  /** Type name of the output's value. */
  readonly type: string;
  /** Display label of the output's tile. */
  readonly label?: string;
  /** Markdown document of the output's tile. */
  readonly docs?: string;
  /** Icon of the output's tile, as a data URI usable as an image source as it is; render it only as an image source, never as markup. */
  readonly iconUrl?: string;
  /** `true` for an output whose value a brain may write a field through; absent otherwise. */
  readonly writableResult?: true;
}

/** One tile of a pack. */
export interface CatalogTile extends CatalogMeta {
  /** The tile's name. */
  readonly name: string;
  /** The tile's kind, or `undefined` when the registration declared none. */
  readonly kind: string | undefined;
  /** Whether the tile's binding is asynchronous. */
  readonly async: boolean;
  /**
   * The tile's argument grammar: its top-level items, which match as the
   * items of one bag. `undefined` when a problem was found in it.
   */
  readonly grammar: readonly CatalogArgNode[] | undefined;
  /** Type name of the value the tile evaluates to, or absent. */
  readonly returns?: string;
  /** Named outputs the tile declares. */
  readonly outputs: readonly CatalogOutput[];
  /** Type name of the WHEN result the tile requires, or absent. */
  readonly consumesWhenResult?: string;
  /** Sentence words of the tile, or absent when it declares none. */
  readonly language?: CatalogLanguage;
  /** `true` for a sensor taking no arguments that reads as a value inside an expression; absent otherwise. */
  readonly inline?: true;
  /** `true` for a sensor whose result a brain may write a field through; absent otherwise. */
  readonly writableResult?: true;
}

/** One operator of a pack. */
export interface CatalogOperator {
  /** The operator's name. */
  readonly name: string;
  /** Whether the operator's host function is asynchronous. */
  readonly async: boolean;
  /** Type names of the operand slots, in operand order. */
  readonly operands: readonly string[];
  /** Type name of the value the operator evaluates to, or absent when the registration declared no shape. */
  readonly returns?: string;
}

/**
 * One overload a pack adds to an operator the editor's core vocabulary
 * holds: the operator's own tile stands for it, and no tile of the pack's.
 */
export interface CatalogOverload {
  /** The name the project's id manifest allocates the overload's host-function id under, such as `eq(Image,Image)`. */
  readonly name: string;
  /** Id of the operator the overload extends, such as `eq`. */
  readonly operator: string;
  /** Whether the overload's host function is asynchronous. */
  readonly async: boolean;
  /** Type names of the operand slots, in operand order. */
  readonly operands: readonly string[];
  /** Type name of the value the overload evaluates to, or absent when the registration declared none. */
  readonly returns?: string;
}

/** One icon a pack gives a core tile: a tile the editor's own core vocabulary holds. */
export interface CatalogCoreTileIcon {
  /** Id of the core tile, as the editor's environment holds it, for example `tile.op->and`. */
  readonly tileId: string;
  /** The icon, as {@link CatalogMeta.iconUrl} carries one. */
  readonly iconUrl: string;
}

/** One icon a pack gives a core type: a type of the Wendoo language's own, which no pack declares. */
export interface CatalogCoreTypeIcon {
  /** Name of the core type, as the catalog names it, for example `number`. */
  readonly typeName: string;
  /** The icon, as {@link CatalogMeta.iconUrl} carries one. */
  readonly iconUrl: string;
}

/** One vocabulary pack of the catalog. */
export interface CatalogPack {
  /** The pack's name. */
  readonly name: string;
  /** The pack's struct types, in registration order. */
  readonly types: readonly CatalogType[];
  /** The pack's tiles, in registration order. */
  readonly tiles: readonly CatalogTile[];
  /** The pack's operators, in registration order. */
  readonly operators: readonly CatalogOperator[];
  /** The overloads the pack adds to core operators, in registration order. */
  readonly overloads: readonly CatalogOverload[];
  /** The icons the pack gives core tiles, in declaration order. */
  readonly coreTileIcons: readonly CatalogCoreTileIcon[];
  /** The icons the pack gives core types, in declaration order. */
  readonly coreTypeIcons: readonly CatalogCoreTypeIcon[];
}

/** A catalog document read in full. */
export interface ParsedCatalog {
  /** The catalog's packs, in registration order. Empty when the document declares none. */
  readonly packs: readonly CatalogPack[];
  /** The problems found in the packs' entries, in catalog order. */
  readonly problems: readonly CatalogProblem[];
  /** {@link CATALOG_UNREADABLE} when the text could not be read, and `undefined` when it was. */
  readonly errorCode: typeof CATALOG_UNREADABLE | undefined;
}

/** The grammar constructs a node may name. */
const NODE_KINDS = new Set(["arg", "seq", "choice", "optional", "repeat", "bag", "conditional"]);

/** The overflow behaviors a range may name. */
const ON_EXCEED_TOKENS = new Set(["clamp", "wrap", "drop"]);

/** The tile kinds a tile may name. */
const TILE_KINDS = new Set(["sensor", "actuator"]);

/** The sentence frames a language group may name. */
const SENTENCE_FRAMES: ReadonlySet<string> = new Set(["verb", "state", "event"]);

/** Receives each sentence frame token a reader finds that the grammar does not have. */
type FrameReport = (token: string) => void;

/** A JSON object, read field by field. */
type JsonObject = { readonly [key: string]: unknown };

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNamed(value: unknown): value is JsonObject & { name: string } {
  return isObject(value) && typeof value.name === "string";
}

function stringField(entry: JsonObject, key: string): string | undefined {
  const value = entry[key];
  return typeof value === "string" ? value : undefined;
}

function numberField(entry: JsonObject, key: string): number | undefined {
  const value = entry[key];
  return typeof value === "number" ? value : undefined;
}

function arrayField(entry: JsonObject, key: string): readonly unknown[] {
  const value = entry[key];
  return Array.isArray(value) ? value : [];
}

/** The metadata fields `entry` declares. */
function metaOf(entry: JsonObject): CatalogMeta {
  const meta: { label?: string; group?: string; docs?: string; iconUrl?: string } = {};
  for (const key of ["label", "group", "docs", "iconUrl"] as const) {
    const value = stringField(entry, key);
    if (value !== undefined) meta[key] = value;
  }
  return meta;
}

/**
 * The sentence words `value` declares, or `undefined` when it declares none.
 * A frame the grammar does not have is passed to `reportFrame` and left out.
 */
function languageOf(value: unknown, reportFrame: FrameReport): CatalogLanguage | undefined {
  if (!isObject(value)) return undefined;
  const language: { form?: string; frame?: CatalogSentenceFrame; bare?: string } = {};
  const form = stringField(value, "form");
  if (form !== undefined) language.form = form;
  const frame = stringField(value, "frame");
  if (frame !== undefined) {
    if (SENTENCE_FRAMES.has(frame)) language.frame = frame as CatalogSentenceFrame;
    else reportFrame(frame);
  }
  const bare = stringField(value, "bare");
  if (bare !== undefined) language.bare = bare;
  return Object.keys(language).length > 0 ? language : undefined;
}

/** Thrown while reading a grammar: the problem that makes it unreadable. */
class GrammarProblem {
  constructor(
    readonly code: CatalogProblemCode,
    readonly token?: string
  ) {}
}

/** The range `value` declares. Throws a {@link GrammarProblem} when it is not one. */
function rangeOf(value: unknown): CatalogRange {
  if (!isObject(value)) throw new GrammarProblem(CatalogProblemCode.ENTRY_MALFORMED);
  const onExceed = stringField(value, "onExceed");
  if (onExceed === undefined) throw new GrammarProblem(CatalogProblemCode.ENTRY_MALFORMED);
  if (!ON_EXCEED_TOKENS.has(onExceed)) throw new GrammarProblem(CatalogProblemCode.ON_EXCEED_UNKNOWN, onExceed);
  const range: { min?: number; max?: number; onExceed: CatalogOnExceed } = { onExceed: onExceed as CatalogOnExceed };
  const min = numberField(value, "min");
  const max = numberField(value, "max");
  if (min !== undefined) range.min = min;
  if (max !== undefined) range.max = max;
  return range;
}

/**
 * The slot `entry` declares, its slot fields read, and on a modifier slot its
 * sentence words, an unknown frame among them passed to `reportFrame`. Throws
 * a {@link GrammarProblem} when it is not one.
 */
function slotOf(entry: JsonObject, reportFrame: FrameReport): CatalogArgSlot {
  const tileId = stringField(entry, "tileId");
  const modifier = entry.modifier === true;
  const type = stringField(entry, "type");
  if (tileId === undefined || (!modifier && type === undefined)) {
    throw new GrammarProblem(CatalogProblemCode.ENTRY_MALFORMED);
  }
  const slot: {
    kind: "arg";
    name?: string;
    tileId: string;
    modifier: boolean;
    type?: string;
    required?: boolean;
    anonymous: boolean;
    default?: unknown;
    derived: boolean;
    range?: CatalogRange;
    unit?: string;
    label?: string;
    language?: CatalogLanguage;
    iconUrl?: string;
  } = { kind: "arg", tileId, modifier, anonymous: entry.anonymous === true, derived: entry.derived === true };
  const name = stringField(entry, "name");
  if (name !== undefined) slot.name = name;
  if (!modifier) slot.type = type;
  if (typeof entry.required === "boolean") slot.required = entry.required;
  if (entry.default !== undefined) slot.default = entry.default;
  if (entry.range !== undefined) slot.range = rangeOf(entry.range);
  const unit = stringField(entry, "unit");
  if (unit !== undefined) slot.unit = unit;
  const label = stringField(entry, "label");
  if (label !== undefined) slot.label = label;
  const language = modifier ? languageOf(entry.language, reportFrame) : undefined;
  if (language !== undefined) slot.language = language;
  const iconUrl = stringField(entry, "iconUrl");
  if (iconUrl !== undefined) slot.iconUrl = iconUrl;
  return slot;
}

/**
 * The grammar node `value` declares, and every node under it, each unknown
 * sentence frame passed to `reportFrame`. Throws a {@link GrammarProblem}
 * when it is not one.
 */
function nodeOf(value: unknown, reportFrame: FrameReport): CatalogArgNode {
  const child = (node: unknown) => nodeOf(node, reportFrame);
  if (!isObject(value)) throw new GrammarProblem(CatalogProblemCode.ENTRY_MALFORMED);
  const kind = stringField(value, "kind");
  if (kind === undefined) throw new GrammarProblem(CatalogProblemCode.ENTRY_MALFORMED);
  if (!NODE_KINDS.has(kind)) throw new GrammarProblem(CatalogProblemCode.CALL_SPEC_KIND_UNKNOWN, kind);
  const name = stringField(value, "name");
  const named = name === undefined ? {} : { name };
  switch (kind) {
    case "arg":
      return slotOf(value, reportFrame);
    case "seq":
    case "bag":
      return { kind, ...named, items: arrayField(value, "items").map(child) };
    case "choice":
      return { kind, ...named, options: arrayField(value, "options").map(child) };
    case "optional":
      return { kind, ...named, item: child(value.item) };
    case "repeat": {
      const min = numberField(value, "min");
      const max = numberField(value, "max");
      return {
        kind,
        ...named,
        item: child(value.item),
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      };
    }
    default: {
      const condition = stringField(value, "condition");
      if (condition === undefined) throw new GrammarProblem(CatalogProblemCode.ENTRY_MALFORMED);
      const otherwise = value.else === undefined ? {} : { else: child(value.else) };
      // biome-ignore lint/suspicious/noThenProperty: a conditional node's branch keys are the reference call spec's then/else.
      return { kind: "conditional", ...named, condition, then: child(value.then), ...otherwise };
    }
  }
}

/**
 * The grammar node of one flat `args` entry: the slot, wrapped in an
 * optional when the entry is `optional`, or in a repeat when it is
 * `repeated`, each unknown sentence frame passed to `reportFrame`. Throws a
 * {@link GrammarProblem} when it is not one.
 */
function flatNodeOf(value: unknown, reportFrame: FrameReport): CatalogArgNode {
  if (!isObject(value)) throw new GrammarProblem(CatalogProblemCode.ENTRY_MALFORMED);
  const slot = slotOf(value, reportFrame);
  if (value.optional === true) return { kind: "optional", item: slot };
  if (value.repeated === true) {
    const min = numberField(value, "min");
    return { kind: "repeat", item: slot, ...(min === undefined ? {} : { min }) };
  }
  return slot;
}

/** The tile `entry` declares, recording each problem found in it in `problems`. */
function tileOf(pack: string, entry: JsonObject & { name: string }, problems: CatalogProblem[]): CatalogTile {
  const kind = stringField(entry, "kind");
  const reportFrame: FrameReport = (token) => {
    problems.push({ code: CatalogProblemCode.SENTENCE_FRAME_UNKNOWN, pack, name: entry.name, token });
  };
  let grammar: CatalogArgNode[] | undefined;
  try {
    grammar = Array.isArray(entry.call)
      ? entry.call.map((node) => nodeOf(node, reportFrame))
      : arrayField(entry, "args").map((item) => flatNodeOf(item, reportFrame));
  } catch (error) {
    if (!(error instanceof GrammarProblem)) throw error;
    problems.push({
      code: error.code,
      pack,
      name: entry.name,
      ...(error.token === undefined ? {} : { token: error.token }),
    });
  }
  if (kind === undefined) {
    problems.push({ code: CatalogProblemCode.TILE_SHAPE_UNDECLARED, pack, name: entry.name });
  } else if (!TILE_KINDS.has(kind)) {
    problems.push({ code: CatalogProblemCode.TILE_KIND_UNKNOWN, pack, name: entry.name, token: kind });
  }
  const outputs = arrayField(entry, "outputs").flatMap((output) => {
    if (!isNamed(output) || typeof output.type !== "string") return [];
    const display: { label?: string; docs?: string; iconUrl?: string } = {};
    for (const key of ["label", "docs", "iconUrl"] as const) {
      const value = stringField(output, key);
      if (value !== undefined) display[key] = value;
    }
    return [
      {
        name: output.name,
        type: output.type,
        ...display,
        ...(output.writableResult === true ? { writableResult: true as const } : {}),
      },
    ];
  });
  const returns = stringField(entry, "returns");
  const consumesWhenResult = stringField(entry, "consumesWhenResult");
  const language = languageOf(entry.language, reportFrame);
  return {
    name: entry.name,
    kind,
    async: entry.async === true,
    grammar,
    ...(returns === undefined ? {} : { returns }),
    outputs,
    ...(consumesWhenResult === undefined ? {} : { consumesWhenResult }),
    ...metaOf(entry),
    ...(language === undefined ? {} : { language }),
    ...(entry.inline === true ? { inline: true as const } : {}),
    ...(entry.writableResult === true ? { writableResult: true as const } : {}),
  };
}

/**
 * The literal `value` declares, or none when it lacks its key; a field value
 * lacking its field name or its value is left out of it.
 */
function literalOf(value: unknown): CatalogLiteral[] {
  if (!isObject(value)) return [];
  const key = stringField(value, "key");
  if (key === undefined) return [];
  const label = stringField(value, "label");
  const fields = arrayField(value, "fields").flatMap((field) =>
    isNamed(field) && field.value !== undefined ? [{ name: field.name, value: field.value }] : []
  );
  return [{ key, ...(label === undefined ? {} : { label }), fields }];
}

/** The struct type `entry` declares. */
function typeOf(entry: JsonObject & { name: string }): CatalogType {
  const fields = arrayField(entry, "fields").flatMap((field) =>
    isNamed(field) && typeof field.type === "string"
      ? [
          {
            name: field.name,
            type: field.type,
            readOnly: field.readOnly === true,
            ...(field.routed === true ? { routed: true as const } : {}),
            ...(isObject(field.accessor) ? { accessor: metaOf(field.accessor) } : {}),
          },
        ]
      : []
  );
  const asset = stringField(entry, "asset");
  const variableInitial = stringField(entry, "variableInitial");
  return {
    name: entry.name,
    native: entry.native === true,
    fields,
    literals: arrayField(entry, "literals").flatMap(literalOf),
    ...metaOf(entry),
    ...(asset === undefined ? {} : { asset }),
    ...(entry.brain === true ? { brain: true as const } : {}),
    ...(entry.variableFactory === true ? { variableFactory: true as const } : {}),
    ...(variableInitial === undefined ? {} : { variableInitial }),
  };
}

/** The core tile icon `value` declares, or none when it lacks its tile id or its icon. */
function coreTileIconOf(value: unknown): CatalogCoreTileIcon[] {
  if (!isObject(value)) return [];
  const tileId = stringField(value, "tileId");
  const iconUrl = stringField(value, "iconUrl");
  return tileId === undefined || iconUrl === undefined ? [] : [{ tileId, iconUrl }];
}

/** The core type icon `value` declares, or none when it lacks its type name or its icon. */
function coreTypeIconOf(value: unknown): CatalogCoreTypeIcon[] {
  if (!isObject(value)) return [];
  const typeName = stringField(value, "type");
  const iconUrl = stringField(value, "iconUrl");
  return typeName === undefined || iconUrl === undefined ? [] : [{ typeName, iconUrl }];
}

/** The operand type names `entry` declares, in operand order. */
function operandsOf(entry: JsonObject): string[] {
  return arrayField(entry, "operands").flatMap((operand) => (typeof operand === "string" ? [operand] : []));
}

/** The operator `entry` declares. */
function operatorOf(entry: JsonObject & { name: string }): CatalogOperator {
  const returns = stringField(entry, "returns");
  return {
    name: entry.name,
    async: entry.async === true,
    operands: operandsOf(entry),
    ...(returns === undefined ? {} : { returns }),
  };
}

/** The overload `value` declares, or none when it lacks its name or the operator it extends. */
function overloadOf(value: unknown): CatalogOverload[] {
  if (!isNamed(value)) return [];
  const operator = stringField(value, "operator");
  if (operator === undefined) return [];
  const returns = stringField(value, "returns");
  return [
    {
      name: value.name,
      operator,
      async: value.async === true,
      operands: operandsOf(value),
      ...(returns === undefined ? {} : { returns }),
    },
  ];
}

/**
 * Reads a catalog's serialized text, in the grammar the MakeCode Wendoo VM
 * extension's catalog serializer writes as the simx renders it for the
 * editor -- each icon carried as an `iconUrl` data URI -- into its packs,
 * each with its types and the literals they declare, tiles, operators,
 * overloads of core operators, core tile icons and core type icons. An
 * overload entry carrying no operator, a literal entry carrying no key, a
 * core tile icon entry carrying no tile id or no icon, and a core type icon
 * entry carrying no type name or no icon, is dropped. A token the grammar does not have -- a tile kind, a
 * grammar construct, a range's overflow behavior, a sentence frame -- is
 * never dropped silently: the entry carrying it is recorded in the result's
 * problems by stable code and keeps no grammar, but for a sentence frame,
 * which alone is left out, and the rest of the catalog reads on.
 * Entries without a name are dropped; text that is not a JSON document at all
 * yields no packs and {@link CATALOG_UNREADABLE}. Never throws.
 */
export function parseCatalog(text: string): ParsedCatalog {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return { packs: [], problems: [], errorCode: CATALOG_UNREADABLE };
  }
  const declared = isObject(document) ? document.packs : undefined;
  const packs: CatalogPack[] = [];
  const problems: CatalogProblem[] = [];
  if (Array.isArray(declared)) {
    for (const pack of declared) {
      if (!isNamed(pack)) continue;
      packs.push({
        name: pack.name,
        types: arrayField(pack, "types").filter(isNamed).map(typeOf),
        tiles: arrayField(pack, "tiles")
          .filter(isNamed)
          .map((tile) => tileOf(pack.name, tile, problems)),
        operators: arrayField(pack, "operators").filter(isNamed).map(operatorOf),
        overloads: arrayField(pack, "overloads").flatMap(overloadOf),
        coreTileIcons: arrayField(pack, "coreTileIcons").flatMap(coreTileIconOf),
        coreTypeIcons: arrayField(pack, "coreTypeIcons").flatMap(coreTypeIconOf),
      });
    }
  }
  return { packs, problems, errorCode: undefined };
}
