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
 *   registration order.
 * - A type entry carries `name`, `native` (backed by host objects through
 *   registered hooks), `fields` (each with `name`, `type`, `readOnly`), and
 *   the metadata fields.
 * - A tile entry carries `name`, `kind`, `async`, its argument grammar as
 *   either `args` or `call`, `returns`, `outputs` (each with `name` and
 *   `type`), `consumesWhenResult` (the type name of the WHEN result the tile
 *   requires), and the metadata fields.
 * - A tile's argument grammar is a list of top-level items that match as the
 *   items of one bag. It is written as `args` when every item has a flat
 *   form, and as `call` otherwise.
 * - `args` holds one flat entry per item: the slot's `name`, then its
 *   `tileId` (the identity of the tile that fills it), then `modifier` or
 *   `type`, then `optional` (the item is the slot wrapped in an optional), or
 *   `repeated` and `min` (the slot wrapped in a repeat with no upper bound),
 *   then the slot's argument options. An item has a flat form when it is a
 *   slot, or an unnamed optional or unnamed unbounded repeat directly around
 *   a slot.
 * - `call` holds one grammar node per item. Every node carries `kind` (`arg`,
 *   `seq`, `choice`, `optional`, `repeat`, `bag` or `conditional`) and
 *   `name`. An `arg` node carries `tileId`, then `modifier` or `type`, then
 *   its argument options; `seq` and `bag` carry `items`; `choice` carries `options`;
 *   `optional` carries `item`; `repeat` carries `item`, `min` and `max`; and
 *   `conditional` carries `condition` (the name it tests), `then` and `else`.
 * - The argument options are `required`, `anonymous`, `default` (a tagged
 *   value), `derived`, `range` (`min`, `max` and `onExceed`) and `unit`.
 * - A tagged value is an object holding the value's native type id under
 *   `t`, with `v` for a boolean, number or string; `typeId` and `v` for an
 *   enum symbol; `typeId` and a `v` array of tagged values for a list or a
 *   struct; and `{"t":"handle","id":n}` for a handle.
 * - An operator entry carries `name`, `async`, `operands` and `returns`.
 * - The metadata fields are `label`, `group`, `docs` (markdown text,
 *   verbatim) and `icon` (the encoder's text form).
 * - A diagnostic entry carries `code`, `name`, `pack`, `otherPack` and
 *   `spec` (the call spec within the registration the problem is about).
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
   * Diagnostic code: a registration declares an icon its encoder cannot
   * render, so its entry is written without one.
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

  /** JSON object text of the flat form of `item`, which {@link flatSlotOf} must find a slot for. */
  function flatArgText(item: TileArgSpec): string {
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
    return `${out}${argOptionsText(slot)}}`;
  }

  /** JSON array text of `nodes`, each rendered as a grammar node. */
  function nodeListText(nodes: TileArgSpec[]): string {
    const rendered: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
      rendered.push(nodeText(nodes[i]));
    }
    return jsonArray(rendered);
  }

  /** JSON object text of the grammar node `node` and every node under it. */
  function nodeText(node: TileArgSpec): string {
    let out = `{"kind":${jsonQuote(node.kind)}`;
    if (node.name.length > 0) {
      out += `,"name":${jsonQuote(node.name)}`;
    }
    if (node.kind === CALL_SPEC_ARG) {
      const slot = node as ArgSlotSpec;
      return `${out}${slotKindText(slot)}${argOptionsText(slot)}}`;
    }
    if (node.kind === CALL_SPEC_SEQ || node.kind === CALL_SPEC_BAG) {
      const items = node.kind === CALL_SPEC_SEQ ? (node as SeqSpec).items : (node as BagSpec).items;
      if (items.length > 0) {
        out += `,"items":${nodeListText(items)}`;
      }
    } else if (node.kind === CALL_SPEC_CHOICE) {
      const options = (node as ChoiceSpec).options;
      if (options.length > 0) {
        out += `,"options":${nodeListText(options)}`;
      }
    } else if (node.kind === CALL_SPEC_OPTIONAL) {
      out += `,"item":${nodeText((node as OptionalSpec).item)}`;
    } else if (node.kind === CALL_SPEC_REPEAT) {
      const repeat = node as RepeatSpec;
      out += `,"item":${nodeText(repeat.item)}`;
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
      out += `,"then":${nodeText(conditional.thenItem)}`;
      if (conditional.elseItem) {
        out += `,"else":${nodeText(conditional.elseItem)}`;
      }
    }
    return `${out}}`;
  }

  /**
   * The argument grammar whose top-level items are `items`, rendered as the
   * tile entry's `"args"` field when every item has a flat form and as its
   * `"call"` field otherwise, prefixed by the separating comma; `""` when
   * there are no items.
   */
  function grammarText(items: TileArgSpec[]): string {
    if (items.length === 0) {
      return "";
    }
    let flat = true;
    for (let i = 0; flat && i < items.length; i++) {
      flat = flatSlotOf(items[i]) !== undefined;
    }
    if (!flat) {
      return `,"call":${nodeListText(items)}`;
    }
    const rendered: string[] = [];
    for (let i = 0; i < items.length; i++) {
      rendered.push(flatArgText(items[i]));
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
   * {@link CatalogWriter.tile} and {@link CatalogWriter.operator};
   * {@link CatalogWriter.render} then assembles the document.
   */
  export class CatalogWriter {
    private icons: CatalogIconEncoder;
    private packNames: string[] = [];
    private typeEntries: string[][] = [];
    private tileEntries: string[][] = [];
    private operatorEntries: string[][] = [];
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
      return this.packNames.length - 1;
    }

    /**
     * The metadata fields of `meta`, rendered under the payload's omission
     * conventions, each prefixed by its separating comma. An icon the
     * encoder cannot render is left out and recorded under
     * {@link CATALOG_ICON_UNENCODABLE} against `name` and `pack`.
     */
    private metaText(name: string, pack: string, meta: CatalogMeta): string {
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
      if (meta.icon !== undefined && meta.icon !== null) {
        const iconText = this.icons.encode(meta.icon);
        if (iconText.length > 0) {
          out += `,"icon":${jsonQuote(iconText)}`;
        } else {
          this.problems.push(new RegistrationDiagnostic(CATALOG_ICON_UNENCODABLE, name, pack, "", ""));
        }
      }
      return out;
    }

    /** JSON object text of one declared struct field. */
    private fieldText(spec: StructFieldSpec): string {
      let out = `{"name":${jsonQuote(spec.name)},"type":${jsonQuote(spec.type)}`;
      if (spec.readOnly) {
        out += ',"readOnly":true';
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
     * @param meta - Catalog metadata, or `undefined` when the registration declared none.
     */
    struct(pack: string, name: string, fields: StructFieldSpec[], native: boolean, meta: CatalogMeta): void {
      let entry = `{"name":${jsonQuote(name)}`;
      if (native) {
        entry += ',"native":true';
      }
      if (fields.length > 0) {
        const rendered: string[] = [];
        for (let i = 0; i < fields.length; i++) {
          rendered.push(this.fieldText(fields[i]));
        }
        entry += `,"fields":${jsonArray(rendered)}`;
      }
      entry += this.metaText(name, pack, meta);
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
        entry += grammarText(spec.args);
        if (spec.returns.length > 0) {
          entry += `,"returns":${jsonQuote(spec.returns)}`;
        }
        if (spec.outputs.length > 0) {
          const rendered: string[] = [];
          for (let i = 0; i < spec.outputs.length; i++) {
            const declared = spec.outputs[i];
            rendered.push(`{"name":${jsonQuote(declared.name)},"type":${jsonQuote(declared.type)}}`);
          }
          entry += `,"outputs":${jsonArray(rendered)}`;
        }
        if (spec.consumesWhenResult.length > 0) {
          entry += `,"consumesWhenResult":${jsonQuote(spec.consumesWhenResult)}`;
        }
        entry += this.metaText(name, pack, spec);
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
