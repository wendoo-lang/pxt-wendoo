/**
 * The brains module: the generated file declaring the project's compiled
 * brains to the Wendoo VM extension, one declaration per brain, which the
 * project compiles with the rest of its code. This module writes it and
 * reads it back.
 *
 * The text is line-structured. After two lines of comment it declares its
 * format as `// wendoo-brains-format <n>`, then a blank line, then the
 * namespace `wendooPrograms` carrying one entry per brain, ordered by id and
 * separated by blank lines:
 *
 * ```ts
 * namespace wendooPrograms {
 *     // source-hash 1a2b3c4d
 *     //% fixedInstance block="Chaser"
 *     export const p_abcdabcdabcdabcd = wendoo.registerCompiledBrain("abcdabcdabcdabcd", "Chaser", hex`
 *         000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
 *     `);
 * }
 * ```
 *
 * The `source-hash` line carries the `brainSourceHash` of the source the
 * program was compiled from. Each entry is a fixed instance of the VM
 * extension's compiled-brain type, which MakeCode lists in the dropdown of a
 * block taking one, labelled by the `block` attribute: the brain's name, or
 * its id when the name is empty. The declaration is named `p_` followed by
 * the id, each character of it outside `[A-Za-z0-9]` written as `_` and four
 * hex digits of its code unit. The id and the name are JSON string literals
 * with every character outside printable ASCII escaped, so the text is ASCII
 * and each literal stays on its line; the label is the same literal with
 * each `"` escaped as `\u0022`. The program's bytes follow as lowercase
 * hex, {@link HEX_BYTES_PER_LINE} bytes per line.
 */

/** Name of the brains module, relative to the simulator extension's folder in the project. */
export const BRAINS_MODULE_FILE = "brains.g.ts";

/** Format of the brains module this build writes, and the newest it reads. */
export const BRAINS_MODULE_FORMAT = 1;

/** How many bytes of a program each hex line of the brains module carries. */
const HEX_BYTES_PER_LINE = 32;

/** One brain's compiled form, as the brains module registers it. */
export interface CompiledBrainEntry {
  /** The brain's document id. */
  readonly id: string;
  /** The brain's display name; any text, including empty. */
  readonly name: string;
  /** `brainSourceHash` of the source the program was compiled from: eight lowercase hex digits. */
  readonly sourceHash: string;
  /** The compiled program in the binary form the MakeCode Wendoo VM loads. */
  readonly bytecode: Uint8Array;
}

/** Stable codes of the problems {@link readBrainsModule} finds. */
export const BrainsModuleProblemCode = {
  /**
   * The text declares no format this build knows: it is not a brains module
   * at all, or has been damaged. No entry is read from it.
   */
  UNREADABLE: "BRAINS_MODULE_UNREADABLE",
  /**
   * The text declares a format newer than {@link BRAINS_MODULE_FORMAT},
   * written by a newer simulator extension. No entry is read from it, and it
   * must not be rewritten by this build.
   */
  FORMAT_NEWER: "BRAINS_MODULE_FORMAT_NEWER",
  /** One entry does not follow the format; it is skipped and the rest are read. */
  ENTRY_MALFORMED: "BRAINS_MODULE_ENTRY_MALFORMED",
} as const;

/** Union of all {@link BrainsModuleProblemCode} values. */
export type BrainsModuleProblemCode = (typeof BrainsModuleProblemCode)[keyof typeof BrainsModuleProblemCode];

/** One problem {@link readBrainsModule} found. */
export interface BrainsModuleProblem {
  /** What the problem is. */
  readonly code: BrainsModuleProblemCode;
  /** The 1-based line the problem was found on, or `undefined` when it concerns the whole text. */
  readonly line: number | undefined;
}

/** What {@link readBrainsModule} read from a brains module. */
export interface BrainsModuleReading {
  /** The format the text declares, or `undefined` when it declares none. */
  readonly format: number | undefined;
  /** The entries read, by id. Of two entries under one id, the first is kept. */
  readonly entries: ReadonlyMap<string, CompiledBrainEntry>;
  /** The problems found, in text order. */
  readonly problems: readonly BrainsModuleProblem[];
}

/** The line declaring the format. */
const FORMAT_LINE = /^\/\/ wendoo-brains-format (\d+)$/;

/** The line carrying an entry's source hash, with its indent removed. */
const HASH_LINE = /^\/\/ source-hash ([0-9a-f]{8})$/;

/** The line opening the namespace the entries are declared in. */
const NAMESPACE_OPEN = "namespace wendooPrograms {";

/** The line closing the namespace the entries are declared in. */
const NAMESPACE_CLOSE = "}";

/** Indent of an entry's lines inside the namespace. */
const ENTRY_INDENT = "    ";

/** Indent of an entry's hex lines inside the namespace. */
const HEX_INDENT = "        ";

/** The start of every line, its indent removed, opening an entry's declaration. */
const DECLARATION_START = "export const p_";

/**
 * A line, its indent removed, opening an entry's declaration: its name's id
 * part, its id and name literals, then the opening of the hex literal.
 */
const DECLARATION_LINE =
  /^export const p_([A-Za-z0-9_]+) = wendoo\.registerCompiledBrain\(("(?:[^"\\]|\\.)*"), ("(?:[^"\\]|\\.)*"), hex`$/;

/** The line, its indent removed, closing an entry's declaration. */
const DECLARATION_END = "`);";

/**
 * The text of the brains module declaring `entries`, ordered by id. The same
 * entries always yield the same text, which {@link readBrainsModule} reads
 * back to the same entries.
 *
 * @param entries - The compiled brains to declare, at most one per id.
 */
export function writeBrainsModule(entries: Iterable<CompiledBrainEntry>): string {
  const lines = [
    "// Generated by the Wendoo simulator extension from the brain sources in brains/.",
    "// Saving a brain in the Wendoo editor rewrites this file.",
    `// wendoo-brains-format ${BRAINS_MODULE_FORMAT}`,
    "",
    NAMESPACE_OPEN,
  ];
  const sorted = [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  sorted.forEach((entry, index) => {
    if (index > 0) lines.push("");
    lines.push(
      `${ENTRY_INDENT}// source-hash ${entry.sourceHash}`,
      `${ENTRY_INDENT}${blockLine(entry.id, entry.name)}`,
      `${ENTRY_INDENT}${DECLARATION_START}${identifierPart(entry.id)} = wendoo.registerCompiledBrain(` +
        `${asciiLiteral(entry.id)}, ${asciiLiteral(entry.name)}, hex\``
    );
    for (let start = 0; start < entry.bytecode.length; start += HEX_BYTES_PER_LINE) {
      lines.push(`${HEX_INDENT}${hexOf(entry.bytecode.subarray(start, start + HEX_BYTES_PER_LINE))}`);
    }
    lines.push(`${ENTRY_INDENT}${DECLARATION_END}`);
  });
  lines.push(NAMESPACE_CLOSE);
  return `${lines.join("\n")}\n`;
}

/**
 * Read the entries of a brains module. Never throws: text that does not
 * follow the format yields the entries that do, and a coded problem for
 * each part that does not. Line ends may be `\n` or `\r\n`.
 *
 * @param text - The module's text.
 */
export function readBrainsModule(text: string): BrainsModuleReading {
  const lines = text.split(/\r?\n/);
  const declared = lines.map((line) => FORMAT_LINE.exec(line)).find((match) => match !== null);
  const format = declared ? Number(declared[1]) : undefined;
  if (format !== BRAINS_MODULE_FORMAT) {
    const code =
      format !== undefined && format > BRAINS_MODULE_FORMAT
        ? BrainsModuleProblemCode.FORMAT_NEWER
        : BrainsModuleProblemCode.UNREADABLE;
    return { format, entries: new Map(), problems: [{ code, line: undefined }] };
  }
  const entries = new Map<string, CompiledBrainEntry>();
  const problems: BrainsModuleProblem[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim().startsWith(DECLARATION_START)) continue;
    const entry = readEntry(lines, index);
    if (entry === undefined) {
      problems.push({ code: BrainsModuleProblemCode.ENTRY_MALFORMED, line: index + 1 });
      continue;
    }
    if (!entries.has(entry.id)) entries.set(entry.id, entry);
  }
  return { format, entries, problems };
}

/**
 * The entry whose declaration opens on `lines[declarationIndex]`, with its
 * block label and source hash from the two lines before, or `undefined` when
 * it does not follow the format.
 */
function readEntry(lines: readonly string[], declarationIndex: number): CompiledBrainEntry | undefined {
  const hash = declarationIndex > 1 ? HASH_LINE.exec(lines[declarationIndex - 2].trim()) : null;
  const declaration = DECLARATION_LINE.exec(lines[declarationIndex].trim());
  if (hash === null || declaration === null) return undefined;
  const id = parseLiteral(declaration[2]);
  const name = parseLiteral(declaration[3]);
  if (id === undefined || name === undefined) return undefined;
  if (declaration[1] !== identifierPart(id) || lines[declarationIndex - 1].trim() !== blockLine(id, name)) {
    return undefined;
  }
  let hex = "";
  for (let index = declarationIndex + 1; index < lines.length; index++) {
    const line = lines[index].trim();
    if (line === DECLARATION_END) {
      const bytecode = bytesOf(hex);
      return bytecode === undefined ? undefined : { id, name, sourceHash: hash[1], bytecode };
    }
    hex += line;
  }
  return undefined;
}

/** The `fixedInstance` annotation line labelling the brain `id` named `name`, its indent removed. */
function blockLine(id: string, name: string): string {
  return `//% fixedInstance block=${asciiLiteral(name === "" ? id : name).replace(/\\(.)/g, (pair, character) =>
    character === '"' ? "\\u0022" : pair
  )}`;
}

/**
 * The part of a declaration's name after `p_` for the brain `id`: the id,
 * with each character outside `[A-Za-z0-9]` written as `_` and four hex
 * digits of its code unit.
 */
function identifierPart(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, (character) => `_${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** `text` as a JSON string literal whose every character outside printable ASCII is escaped. */
function asciiLiteral(text: string): string {
  return JSON.stringify(text).replace(
    /[\u007f-\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}

/** The string the JSON string literal `literal` denotes, or `undefined` when it is not one. */
function parseLiteral(literal: string): string | undefined {
  try {
    const value: unknown = JSON.parse(literal);
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

/** `bytes` as lowercase hex, two digits per byte. */
function hexOf(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** The bytes the lowercase hex `hex` spells, or `undefined` when it spells none. */
function bytesOf(hex: string): Uint8Array | undefined {
  if (!/^(?:[0-9a-f]{2})*$/.test(hex)) return undefined;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
