/**
 * The catalog serializer: renders the registration set into the payload a
 * session channel carries to the Wendoo editor.
 *
 * The payload is one JSON document:
 *
 * - The root object holds `packs`, always present, and `diagnostics` when
 *   any registration problem is on record.
 * - `packs` holds one object per pack, in registration order: the pack's
 *   `name` plus its `types`, `tiles` and `operators` entry arrays, each in
 *   registration order, then its `coreTileIcons` and `coreTypeIcons` entry
 *   arrays, each in the order the icons were given.
 * - A type entry carries `name`, `native` (backed by host objects through
 *   registered hooks), `asset` (on an asset type, the kind of the project
 *   assets its values name), `brain` (on a brain type, whose values each name
 *   one of the project's brains), `fields` (each with `name`, `type`,
 *   `readOnly`, and `accessor` -- present exactly when the field has an
 *   accessor tile -- holding the accessor's metadata fields), and the
 *   metadata fields.
 * - A tile entry carries `name`, `kind`, `async`, `inline` (a sensor reading
 *   as a value inside an expression), `writableResult` (a sensor whose result
 *   a brain may write a field through), its argument grammar as either
 *   `args` or `call`, `returns`, `outputs` (each with `name` and
 *   `type`, then the output tile's `label`, `docs` and `icon`),
 *   `consumesWhenResult` (the type name of the WHEN result the tile
 *   requires), the metadata fields, and `language`.
 * - A tile's argument grammar is a list of top-level items that match as the
 *   items of one bag. It is written as `args` when every item has a flat
 *   form, and as `call` otherwise.
 * - `args` holds one flat entry per item: the slot's `name`, then its
 *   `tileId` (the identity of the tile that fills it), then `modifier` or
 *   `type`, then `optional` (the item is the slot wrapped in an optional), or
 *   `repeated` and `min` (the slot wrapped in a repeat with no upper bound),
 *   then the slot's argument options, then its `label`, then, on a modifier
 *   slot, its `language`, then its `icon`. An item has a flat form when it
 *   is a slot, or an unnamed optional or unnamed unbounded repeat directly
 *   around a slot.
 * - `call` holds one grammar node per item. Every node carries `kind` (`arg`,
 *   `seq`, `choice`, `optional`, `repeat`, `bag` or `conditional`) and
 *   `name`. An `arg` node carries `tileId`, then `modifier` or `type`, then
 *   its argument options, then its `label`, then, on a modifier slot, its
 *   `language`, then its `icon`; `seq` and `bag` carry `items`;
 *   `choice` carries `options`; `optional` carries `item`; `repeat` carries
 *   `item`, `min` and `max`; and `conditional` carries `condition` (the name
 *   it tests), `then` and `else`.
 * - The argument options are `required`, `anonymous`, `default` (a tagged
 *   value), `derived`, `range` (`min`, `max` and `onExceed`) and `unit`. A
 *   slot's `label` is the display label of the tile that fills it, a
 *   modifier slot's `language` the sentence words of that tile, and a slot's
 *   `icon` that tile's icon, in the encoder's text form.
 * - A `language` object holds the sentence words the Wendoo editor reads a
 *   tile with: `form` (the tile's word), `frame` (`verb`, `state` or
 *   `event`: the template a sensor heading a WHEN side reads through) and
 *   `bare` (the word completing a WHEN side such a sensor heads alone), in
 *   that order. A `language` declaring none of them is left out.
 * - A tagged value is an object holding the value's native type id under
 *   `t`, with `v` for a boolean, number or string; `typeId` and `v` for an
 *   enum symbol; `typeId` and a `v` array of tagged values for a list or a
 *   struct; and `{"t":"handle","id":n}` for a handle.
 * - An operator entry carries `name`, `async`, `operands` and `returns`.
 * - A core tile icon entry carries `tileId` (the id of the core tile the
 *   pack gives the icon, as the Wendoo editor holds it) and `icon`.
 * - A core type icon entry carries `type` (the name of the core type the
 *   pack gives the icon, such as `number`) and `icon`.
 * - The metadata fields are `label`, `group`, `docs` (markdown text,
 *   verbatim) and `icon` (the encoder's text form).
 * - A diagnostic entry carries `code`, `name`, `pack`, `otherPack` and
 *   `spec` (the part of the registration the problem is about: for a slot's
 *   icon, the slot's name, or its `tileId` when it is unnamed; for an
 *   output's icon, the output's name; for an accessor's icon, its field's
 *   name). A core tile icon's diagnostic names
 *   the core tile's id as its `name`, and a core type icon's the core
 *   type's name.
 *
 * Omission conventions, applied uniformly: a boolean field is present only
 * when true, a string field only when non-empty, an array field only when
 * non-empty, and an object or number field only when declared; `min` is
 * present only when above zero. `required` is the one boolean present when
 * false: it is present, `true` or `false`, exactly when the slot declares
 * it. `packs` alone is always present. Every type reference is a Wendoo type
 * name -- a primitive name such as `number`, or a registered type's name.
 * A number is written in its shortest decimal form, and as `null` when it is
 * not finite. The document is rendered byte-identically for one
 * registration state: fixed key order, entries in registration order, and
 * every string escaped to ASCII.
 */
namespace wendoo {
  /**
   * Diagnostic code: a registration declares an icon, on itself or on a slot
   * of its argument grammar, that its encoder cannot render, so the entry is
   * written without it.
   */
  export const CATALOG_ICON_UNENCODABLE = "catalog-icon-unencodable";

  /**
   * Renders a registration's opaque icon into the text form the catalog
   * carries. A target-aware extension subclasses and overrides
   * {@link CatalogIconEncoder.encode} with the encoder of its own icon form;
   * the base implementation renders nothing.
   */
  export class CatalogIconEncoder {
    constructor() {}

    /**
     * The catalog text form of `icon`, or `""` when the encoder cannot
     * render it.
     *
     * @param icon - Opaque icon value, as the registration declared it.
     */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    encode(icon: any): string {
      return "";
    }
  }

  /**
   * JSON string literal of `text`: double-quoted, with `"` and `\` escaped,
   * and every non-printing or non-ASCII code unit escaped to `\n`, `\r`,
   * `\t` or `\uXXXX`, so the literal is pure ASCII.
   */
  function jsonQuote(text: string): string {
    let out = '"';
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code === 0x22) {
        out += '\\"';
      } else if (code === 0x5c) {
        out += "\\\\";
      } else if (code === 0x0a) {
        out += "\\n";
      } else if (code === 0x0d) {
        out += "\\r";
      } else if (code === 0x09) {
        out += "\\t";
      } else if (code < 0x20 || code > 0x7e) {
        let hex = hexU32(code);
        while (hex.length < 4) {
          hex = `0${hex}`;
        }
        out += `\\u${hex}`;
      } else {
        out += text.charAt(i);
      }
    }
    return `${out}"`;
  }

  /** JSON array literal holding the already rendered `entries`. */
  function jsonArray(entries: string[]): string {
    return `[${entries.join(",")}]`;
  }

  /** JSON number literal of `x`: its shortest decimal form, or `null` when `x` is not finite. */
  function jsonNumber(x: number): string {
    return x - x === 0 ? `${x}` : "null";
  }

  /**
   * JSON object text of the value `value`, tagged by its native type id
   * under `t`: `{"t":n}` for a value carrying no payload, `"v"` for a
   * boolean, number or string payload, `"typeId"` and `"v"` for an enum
   * symbol, `"typeId"` and the `"v"` array of element or field values for a
   * list or struct (a missing field reading as nil), and `{"t":"handle","id":n}`
   * for a handle.
   */
  function valueText(value: Value): string {
    const tag = `{"t":${value.t}`;
    if (value.t === ValueTag.Boolean) {
      return `${tag},"v":${value.b ? "true" : "false"}}`;
    }
    if (value.t === ValueTag.Number) {
      return `${tag},"v":${jsonNumber(value.num)}}`;
    }
    if (value.t === ValueTag.String) {
      return `${tag},"v":${jsonQuote(value.str)}}`;
    }
    if (value.t === ValueTag.Enum) {
      return `${tag},"typeId":${jsonQuote(value.typeId)},"v":${jsonQuote(value.str)}}`;
    }
    if (value.t === ValueTag.List || value.t === ValueTag.Struct) {
      const entries: string[] = [];
      const fields = value.fields ? value.fields : [];
      for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        entries.push(valueText(field ? field : NIL_VALUE));
      }
      return `${tag},"typeId":${jsonQuote(value.typeId)},"v":${jsonArray(entries)}}`;
    }
    if (value.t === ValueTag.Handle) {
      return `{"t":"handle","id":${jsonNumber(value.num)}}`;
    }
    return `${tag}}`;
  }

  /**
   * The argument options `slot` declares, rendered under the payload's
   * omission conventions, each prefixed by its separating comma.
   */
  function argOptionsText(slot: ArgSlotSpec): string {
    let out = "";
    if (slot.declaresRequired()) {
      out += `,"required":${slot.isRequired() ? "true" : "false"}`;
    }
    if (slot.anonymous) {
      out += ',"anonymous":true';
    }
    if (slot.declaresDefault()) {
      out += `,"default":${valueText(slot.defaultValue)}`;
    }
    if (slot.derived) {
      out += ',"derived":true';
    }
    const range = slot.range;
    if (range) {
      const bounds: string[] = [];
      if (range.hasMin) {
        bounds.push(`"min":${jsonNumber(range.min)}`);
      }
      if (range.hasMax) {
        bounds.push(`"max":${jsonNumber(range.max)}`);
      }
      if (range.onExceed.length > 0) {
        bounds.push(`"onExceed":${jsonQuote(range.onExceed)}`);
      }
      out += `,"range":{${bounds.join(",")}}`;
    }
    if (slot.unit.length > 0) {
      out += `,"unit":${jsonQuote(slot.unit)}`;
    }
    return out;
  }

  /**
   * The `"language"` field of `language`, prefixed by its separating comma:
   * an object holding the declared `form`, `frame` and `bare`, in that
   * order; `""` when `language` declares none of them.
   */
  function languageText(language: TileLanguage): string {
    if (!language) {
      return "";
    }
    const words: string[] = [];
    if (language.form.length > 0) {
      words.push(`"form":${jsonQuote(language.form)}`);
    }
    if (language.frame.length > 0) {
      words.push(`"frame":${jsonQuote(language.frame)}`);
    }
    if (language.bare.length > 0) {
      words.push(`"bare":${jsonQuote(language.bare)}`);
    }
    return words.length > 0 ? `,"language":{${words.join(",")}}` : "";
  }

  /**
   * The `"icon"` field of the slot it is given, prefixed by its separating
   * comma, or `""` when the slot declares no icon or its icon is not
   * rendered.
   */
  type SlotIconText = (slot: ArgSlotSpec) => string;

  /**
   * The slot's `"label"` field, then a modifier slot's `"language"` field,
   * then the slot's `"icon"` field as `iconText` renders it, each prefixed by
   * its separating comma and each left out when the slot declares none.
   */
  function slotDisplayText(slot: ArgSlotSpec, iconText: SlotIconText): string {
    const label = slot.label.length > 0 ? `,"label":${jsonQuote(slot.label)}` : "";
    const words = slot.isModifier ? languageText(slot.language) : "";
    return `${label}${words}${iconText(slot)}`;
  }

  /**
   * The slot's own identity fields, each prefixed by its separating comma:
   * its `"tileId"`, then `"modifier":true` or its `"type"`. The text starts
   * with a comma.
   */
  function slotKindText(slot: ArgSlotSpec): string {
    const kind = slot.isModifier ? ',"modifier":true' : `,"type":${jsonQuote(slot.type)}`;
    return `,"tileId":${jsonQuote(slot.tileId)}${kind}`;
  }

  /**
   * The slot an item's flat form describes: the item itself when it is a
   * slot, the slot an unnamed {@link OptionalSpec} or an unnamed
   * {@link RepeatSpec} without an upper bound wraps directly, and otherwise
   * `undefined` -- the item has no flat form.
   */
  function flatSlotOf(item: TileArgSpec): ArgSlotSpec {
    if (item.kind === CALL_SPEC_ARG) {
      return item as ArgSlotSpec;
    }
    if (item.name.length > 0) {
      return undefined;
    }
    if (item.kind === CALL_SPEC_OPTIONAL) {
      const inner = (item as OptionalSpec).item;
      return inner.kind === CALL_SPEC_ARG ? (inner as ArgSlotSpec) : undefined;
    }
    if (item.kind === CALL_SPEC_REPEAT) {
      const repeat = item as RepeatSpec;
      return !repeat.hasMax && repeat.item.kind === CALL_SPEC_ARG ? (repeat.item as ArgSlotSpec) : undefined;
    }
    return undefined;
  }

  /**
   * JSON object text of the flat form of `item`, which {@link flatSlotOf}
   * must find a slot for, its slot's icon rendered by `iconText`.
   */
  function flatArgText(item: TileArgSpec, iconText: SlotIconText): string {
    const slot = flatSlotOf(item);
    const named = slot.name.length > 0 ? `"name":${jsonQuote(slot.name)},` : "";
    let out = `{${named}${slotKindText(slot).substr(1)}`;
    if (item.kind === CALL_SPEC_OPTIONAL) {
      out += ',"optional":true';
    }
    if (item.kind === CALL_SPEC_REPEAT) {
      const min = (item as RepeatSpec).min;
      out += ',"repeated":true';
      if (min > 0) {
        out += `,"min":${jsonNumber(min)}`;
      }
    }
    return `${out}${argOptionsText(slot)}${slotDisplayText(slot, iconText)}}`;
  }

  /** JSON array text of `nodes`, each rendered as a grammar node, each slot's icon rendered by `iconText`. */
  function nodeListText(nodes: TileArgSpec[], iconText: SlotIconText): string {
    const rendered: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
      rendered.push(nodeText(nodes[i], iconText));
    }
    return jsonArray(rendered);
  }

  /** JSON object text of the grammar node `node` and every node under it, each slot's icon rendered by `iconText`. */
  function nodeText(node: TileArgSpec, iconText: SlotIconText): string {
    let out = `{"kind":${jsonQuote(node.kind)}`;
    if (node.name.length > 0) {
      out += `,"name":${jsonQuote(node.name)}`;
    }
    if (node.kind === CALL_SPEC_ARG) {
      const slot = node as ArgSlotSpec;
      return `${out}${slotKindText(slot)}${argOptionsText(slot)}${slotDisplayText(slot, iconText)}}`;
    }
    if (node.kind === CALL_SPEC_SEQ || node.kind === CALL_SPEC_BAG) {
      const items = node.kind === CALL_SPEC_SEQ ? (node as SeqSpec).items : (node as BagSpec).items;
      if (items.length > 0) {
        out += `,"items":${nodeListText(items, iconText)}`;
      }
    } else if (node.kind === CALL_SPEC_CHOICE) {
      const options = (node as ChoiceSpec).options;
      if (options.length > 0) {
        out += `,"options":${nodeListText(options, iconText)}`;
      }
    } else if (node.kind === CALL_SPEC_OPTIONAL) {
      out += `,"item":${nodeText((node as OptionalSpec).item, iconText)}`;
    } else if (node.kind === CALL_SPEC_REPEAT) {
      const repeat = node as RepeatSpec;
      out += `,"item":${nodeText(repeat.item, iconText)}`;
      if (repeat.min > 0) {
        out += `,"min":${jsonNumber(repeat.min)}`;
      }
      if (repeat.hasMax) {
        out += `,"max":${jsonNumber(repeat.max)}`;
      }
    } else if (node.kind === CALL_SPEC_CONDITIONAL) {
      const conditional = node as ConditionalSpec;
      if (conditional.condition.length > 0) {
        out += `,"condition":${jsonQuote(conditional.condition)}`;
      }
      out += `,"then":${nodeText(conditional.thenItem, iconText)}`;
      if (conditional.elseItem) {
        out += `,"else":${nodeText(conditional.elseItem, iconText)}`;
      }
    }
    return `${out}}`;
  }

  /**
   * The argument grammar whose top-level items are `items`, rendered as the
   * tile entry's `"args"` field when every item has a flat form and as its
   * `"call"` field otherwise, prefixed by the separating comma, each slot's
   * icon rendered by `iconText`; `""` when there are no items.
   */
  function grammarText(items: TileArgSpec[], iconText: SlotIconText): string {
    if (items.length === 0) {
      return "";
    }
    let flat = true;
    for (let i = 0; flat && i < items.length; i++) {
      flat = flatSlotOf(items[i]) !== undefined;
    }
    if (!flat) {
      return `,"call":${nodeListText(items, iconText)}`;
    }
    const rendered: string[] = [];
    for (let i = 0; i < items.length; i++) {
      rendered.push(flatArgText(items[i], iconText));
    }
    return `,"args":${jsonArray(rendered)}`;
  }

  /** JSON object text of one recorded diagnostic. */
  function diagnosticText(diagnostic: RegistrationDiagnostic): string {
    let out = `{"code":${jsonQuote(diagnostic.code)},"name":${jsonQuote(diagnostic.name)},"pack":${jsonQuote(diagnostic.pack)}`;
    if (diagnostic.otherPack.length > 0) {
      out += `,"otherPack":${jsonQuote(diagnostic.otherPack)}`;
    }
    if (diagnostic.spec.length > 0) {
      out += `,"spec":${jsonQuote(diagnostic.spec)}`;
    }
    return `${out}}`;
  }

  /**
   * Collects catalog entries by pack and renders the payload. Registration
   * entries write themselves through {@link CatalogWriter.struct},
   * {@link CatalogWriter.tile} and {@link CatalogWriter.operator}, core
   * tile icons through {@link CatalogWriter.coreTileIcon}, and core type
   * icons through {@link CatalogWriter.coreTypeIcon};
   * {@link CatalogWriter.render} then assembles the document.
   */
  export class CatalogWriter {
    private icons: CatalogIconEncoder;
    private packNames: string[] = [];
    private typeEntries: string[][] = [];
    private tileEntries: string[][] = [];
    private operatorEntries: string[][] = [];
    private coreTileIconEntries: string[][] = [];
    private coreTypeIconEntries: string[][] = [];
    private problems: RegistrationDiagnostic[] = [];

    /**
     * @param icons - Encoder rendering each entry's opaque icon into the payload's text form.
     */
    constructor(icons: CatalogIconEncoder) {
      this.icons = icons;
    }

    /** The index of `pack`'s entry arrays, allocating them on first sight. */
    private packIndex(pack: string): number {
      for (let i = 0; i < this.packNames.length; i++) {
        if (this.packNames[i] === pack) {
          return i;
        }
      }
      this.packNames.push(pack);
      this.typeEntries.push([]);
      this.tileEntries.push([]);
      this.operatorEntries.push([]);
      this.coreTileIconEntries.push([]);
      this.coreTypeIconEntries.push([]);
      return this.packNames.length - 1;
    }

    /**
     * The `"icon"` field of `icon`, prefixed by its separating comma; `""`
     * when `icon` is undeclared, or when the encoder cannot render it, which
     * is recorded under {@link CATALOG_ICON_UNENCODABLE} against `name`,
     * `pack` and `spec`.
     *
     * @param icon - Opaque icon value, or `undefined` when none is declared.
     * @param name - Name of the registration declaring it.
     * @param pack - Pack the registration is registered under.
     * @param spec - Name of the call spec or output declaring it, or `""` when the registration itself does.
     */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    private iconText(icon: any, name: string, pack: string, spec: string): string {
      if (icon === undefined || icon === null) {
        return "";
      }
      const text = this.icons.encode(icon);
      if (text.length > 0) {
        return `,"icon":${jsonQuote(text)}`;
      }
      this.problems.push(new RegistrationDiagnostic(CATALOG_ICON_UNENCODABLE, name, pack, "", spec));
      return "";
    }

    /**
     * The metadata fields of `meta`, rendered under the payload's omission
     * conventions, each prefixed by its separating comma. An icon the
     * encoder cannot render is left out and recorded under
     * {@link CATALOG_ICON_UNENCODABLE} against `name`, `pack` and `spec`
     * (`""` when the registration itself declares the metadata).
     */
    private metaText(name: string, pack: string, meta: CatalogMeta, spec: string): string {
      if (!meta) {
        return "";
      }
      let out = "";
      if (meta.label.length > 0) {
        out += `,"label":${jsonQuote(meta.label)}`;
      }
      if (meta.group.length > 0) {
        out += `,"group":${jsonQuote(meta.group)}`;
      }
      if (meta.docs.length > 0) {
        out += `,"docs":${jsonQuote(meta.docs)}`;
      }
      return out + this.iconText(meta.icon, name, pack, spec);
    }

    /**
     * JSON object text of one declared field of the struct type `typeName`
     * under `pack`, its accessor's metadata rendered as the metadata fields
     * are; an accessor icon the encoder cannot render is left out and
     * recorded against the type, naming the field as its spec.
     */
    private fieldText(pack: string, typeName: string, spec: StructFieldSpec): string {
      let out = `{"name":${jsonQuote(spec.name)},"type":${jsonQuote(spec.type)}`;
      if (spec.readOnly) {
        out += ',"readOnly":true';
      }
      if (spec.accessor) {
        out += `,"accessor":{${this.metaText(typeName, pack, spec.accessor, spec.name).substr(1)}}`;
      }
      return `${out}}`;
    }

    /**
     * Write the catalog entry of the struct type `name` under `pack`.
     *
     * @param pack - Pack the type is registered under.
     * @param name - Wendoo type name.
     * @param fields - Declared fields, in declaration order.
     * @param native - Whether the type is backed by host objects through registered hooks.
     * @param assetKind - Kind of the project assets an asset type's values name; `""` for any other type.
     * @param brain - Whether the type is a brain type, its values each naming one of the project's brains.
     * @param meta - Catalog metadata, or `undefined` when the registration declared none.
     */
    struct(
      pack: string,
      name: string,
      fields: StructFieldSpec[],
      native: boolean,
      assetKind: string,
      brain: boolean,
      meta: CatalogMeta
    ): void {
      let entry = `{"name":${jsonQuote(name)}`;
      if (native) {
        entry += ',"native":true';
      }
      if (assetKind.length > 0) {
        entry += `,"asset":${jsonQuote(assetKind)}`;
      }
      if (brain) {
        entry += ',"brain":true';
      }
      if (fields.length > 0) {
        const rendered: string[] = [];
        for (let i = 0; i < fields.length; i++) {
          rendered.push(this.fieldText(pack, name, fields[i]));
        }
        entry += `,"fields":${jsonArray(rendered)}`;
      }
      entry += this.metaText(name, pack, meta, "");
      this.typeEntries[this.packIndex(pack)].push(`${entry}}`);
    }

    /**
     * Write the catalog entry of the tile `name` under `pack`.
     *
     * @param pack - Pack the tile is registered under.
     * @param name - Tile name.
     * @param isAsync - Whether the tile's binding is asynchronous, settling a handle for its result.
     * @param spec - Declared shape and metadata, or `undefined` when the registration declared none.
     */
    tile(pack: string, name: string, isAsync: boolean, spec: TileSpec): void {
      let entry = `{"name":${jsonQuote(name)}`;
      if (spec && spec.kind.length > 0) {
        entry += `,"kind":${jsonQuote(spec.kind)}`;
      }
      if (isAsync) {
        entry += ',"async":true';
      }
      if (spec) {
        if (spec.inline) {
          entry += ',"inline":true';
        }
        if (spec.writableResult) {
          entry += ',"writableResult":true';
        }
        entry += grammarText(spec.args, (slot: ArgSlotSpec) =>
          this.iconText(slot.icon, name, pack, slot.name.length > 0 ? slot.name : slot.tileId)
        );
        if (spec.returns.length > 0) {
          entry += `,"returns":${jsonQuote(spec.returns)}`;
        }
        if (spec.outputs.length > 0) {
          const rendered: string[] = [];
          for (let i = 0; i < spec.outputs.length; i++) {
            const declared = spec.outputs[i];
            let output = `{"name":${jsonQuote(declared.name)},"type":${jsonQuote(declared.type)}`;
            if (declared.label.length > 0) {
              output += `,"label":${jsonQuote(declared.label)}`;
            }
            if (declared.docs.length > 0) {
              output += `,"docs":${jsonQuote(declared.docs)}`;
            }
            output += this.iconText(declared.icon, name, pack, declared.name);
            rendered.push(`${output}}`);
          }
          entry += `,"outputs":${jsonArray(rendered)}`;
        }
        if (spec.consumesWhenResult.length > 0) {
          entry += `,"consumesWhenResult":${jsonQuote(spec.consumesWhenResult)}`;
        }
        entry += this.metaText(name, pack, spec, "");
        entry += languageText(spec.language);
      }
      this.tileEntries[this.packIndex(pack)].push(`${entry}}`);
    }

    /**
     * Write the catalog entry of the operator `name` under `pack`.
     *
     * @param pack - Pack the operator is registered under.
     * @param name - Operator name.
     * @param isAsync - Whether the operator's host function is asynchronous, settling a handle for its result.
     * @param spec - Declared shape, or `undefined` when the registration declared none.
     */
    operator(pack: string, name: string, isAsync: boolean, spec: OperatorSpec): void {
      let entry = `{"name":${jsonQuote(name)}`;
      if (isAsync) {
        entry += ',"async":true';
      }
      if (spec) {
        const rendered: string[] = [];
        for (let i = 0; i < spec.operands.length; i++) {
          rendered.push(jsonQuote(spec.operands[i]));
        }
        entry += `,"operands":${jsonArray(rendered)},"returns":${jsonQuote(spec.returns)}`;
      }
      this.operatorEntries[this.packIndex(pack)].push(`${entry}}`);
    }

    /**
     * Write the catalog entry of the icon `pack` gives the core tile
     * `tileId`. An icon the encoder cannot render is left out of the entry
     * and recorded under {@link CATALOG_ICON_UNENCODABLE} against `tileId`
     * and `pack`.
     *
     * @param pack - Pack that gave the icon.
     * @param tileId - Id of the core tile, as the Wendoo editor holds it.
     * @param icon - Opaque icon value, as the pack gave it.
     */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    coreTileIcon(pack: string, tileId: string, icon: any): void {
      const entry = `{"tileId":${jsonQuote(tileId)}${this.iconText(icon, tileId, pack, "")}}`;
      this.coreTileIconEntries[this.packIndex(pack)].push(entry);
    }

    /**
     * Write the catalog entry of the icon `pack` gives the core type
     * `typeName`. An icon the encoder cannot render is left out of the entry
     * and recorded under {@link CATALOG_ICON_UNENCODABLE} against `typeName`
     * and `pack`.
     *
     * @param pack - Pack that gave the icon.
     * @param typeName - Name of the core type, as the catalog names it.
     * @param icon - Opaque icon value, as the pack gave it.
     */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    coreTypeIcon(pack: string, typeName: string, icon: any): void {
      const entry = `{"type":${jsonQuote(typeName)}${this.iconText(icon, typeName, pack, "")}}`;
      this.coreTypeIconEntries[this.packIndex(pack)].push(entry);
    }

    /**
     * The rendered payload: every pack written so far, and the diagnostics
     * on record -- the registration log first, then the problems this
     * writer found.
     */
    render(): string {
      const packs: string[] = [];
      for (let i = 0; i < this.packNames.length; i++) {
        let entry = `{"name":${jsonQuote(this.packNames[i])}`;
        if (this.typeEntries[i].length > 0) {
          entry += `,"types":${jsonArray(this.typeEntries[i])}`;
        }
        if (this.tileEntries[i].length > 0) {
          entry += `,"tiles":${jsonArray(this.tileEntries[i])}`;
        }
        if (this.operatorEntries[i].length > 0) {
          entry += `,"operators":${jsonArray(this.operatorEntries[i])}`;
        }
        if (this.coreTileIconEntries[i].length > 0) {
          entry += `,"coreTileIcons":${jsonArray(this.coreTileIconEntries[i])}`;
        }
        if (this.coreTypeIconEntries[i].length > 0) {
          entry += `,"coreTypeIcons":${jsonArray(this.coreTypeIconEntries[i])}`;
        }
        packs.push(`${entry}}`);
      }
      let out = `{"packs":${jsonArray(packs)}`;
      const diagnostics: string[] = [];
      const recorded = registrationDiagnostics();
      for (let i = 0; i < recorded.length; i++) {
        diagnostics.push(diagnosticText(recorded[i]));
      }
      for (let i = 0; i < this.problems.length; i++) {
        diagnostics.push(diagnosticText(this.problems[i]));
      }
      if (diagnostics.length > 0) {
        out += `,"diagnostics":${jsonArray(diagnostics)}`;
      }
      return `${out}}`;
    }
  }

  /**
   * The catalog payload of the current registration set, as one JSON
   * document in the grammar this file describes. Reads the registration
   * state and changes nothing, so two calls over one state return
   * byte-identical text.
   *
   * A registration whose icon `icons` cannot render is written without one,
   * and the payload's diagnostics record it under
   * {@link CATALOG_ICON_UNENCODABLE}; serialization itself never fails.
   *
   * @param icons - Icon encoder of the host target.
   */
  export function serializeCatalog(icons: CatalogIconEncoder): string {
    const catalog = new CatalogWriter(icons);
    writeCatalogEntries(catalog);
    return catalog.render();
  }
}
