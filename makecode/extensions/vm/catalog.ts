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
 * - A tile entry carries `name`, `kind`, `async`, `args` (each slot with
 *   `name`, then either `modifier` or `type` with `optional`, `repeated`
 *   and `min`), `returns`, `outputs` (each with `name` and `type`), and the
 *   metadata fields.
 * - An operator entry carries `name`, `async`, `operands` and `returns`.
 * - The metadata fields are `label`, `group`, `docs` (markdown text,
 *   verbatim) and `icon` (the encoder's text form).
 * - A diagnostic entry carries `code`, `name`, `pack` and `otherPack`.
 *
 * Omission conventions, applied uniformly: a boolean field is present only
 * when true, a string field only when non-empty, and an array field only
 * when non-empty; `packs` alone is always present. Every type reference is
 * a Wendoo type name -- a primitive name such as `number`, or a registered
 * type's name. The document is rendered byte-identically for one
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

  /** JSON object text of one recorded diagnostic. */
  function diagnosticText(diagnostic: RegistrationDiagnostic): string {
    let out = `{"code":${jsonQuote(diagnostic.code)},"name":${jsonQuote(diagnostic.name)},"pack":${jsonQuote(diagnostic.pack)}`;
    if (diagnostic.otherPack.length > 0) {
      out += `,"otherPack":${jsonQuote(diagnostic.otherPack)}`;
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
          this.problems.push(new RegistrationDiagnostic(CATALOG_ICON_UNENCODABLE, name, pack, ""));
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

    /** JSON object text of one declared argument slot. */
    private argText(spec: TileArgSpec): string {
      let out = `{"name":${jsonQuote(spec.name)}`;
      if (spec.isModifier) {
        return `${out},"modifier":true}`;
      }
      out += `,"type":${jsonQuote(spec.type)}`;
      if (spec.optional) {
        out += ',"optional":true';
      }
      if (spec.repeated) {
        out += ',"repeated":true';
        if (spec.minRepeats > 0) {
          out += `,"min":${spec.minRepeats}`;
        }
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
        if (spec.args.length > 0) {
          const rendered: string[] = [];
          for (let i = 0; i < spec.args.length; i++) {
            rendered.push(this.argText(spec.args[i]));
          }
          entry += `,"args":${jsonArray(rendered)}`;
        }
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

  /**
   * Version of the simulator message channel framing this extension speaks,
   * declared in every message {@link publishCatalog} posts.
   */
  export const SIM_CHANNEL_VERSION = 1;

  /**
   * Post the catalog payload of the current registration set on the
   * simulator message channel `channel`, and from then on answer every
   * message the channel delivers by posting a freshly serialized catalog the
   * same way. Each message is one frame, as UTF-8 bytes:
   * {@link SIM_CHANNEL_VERSION} in decimal, a line feed, then the payload.
   * Call it once, right after the registration drain. In the simulator only;
   * on hardware it does nothing.
   *
   * @param icons - Icon encoder of the host target.
   * @param channel - Simulator message channel of the simulator extension that receives the catalog.
   */
  //% shim=TD_NOOP
  export function publishCatalog(icons: CatalogIconEncoder, channel: string): void {
    const post = () => {
      control.simmessages.send(channel, Buffer.fromUTF8(`${SIM_CHANNEL_VERSION}\n${serializeCatalog(icons)}`), false);
    };
    post();
    control.simmessages.onReceived(channel, (request: Buffer) => {
      post();
    });
  }
}
