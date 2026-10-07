/*
 * Reads the serialized catalog out of a capture and compares payloads: the
 * `CATALOG <payload>` line a run prints, the framed messages it posts on a
 * simulator message channel, a canonical form under which two parsed
 * payloads can be compared field for field, and the structural listing of a
 * payload's registration structure, under which a payload is pinned without
 * its display content.
 */

/** Line prefix a run prints its serialized catalog under. */
const CATALOG_PREFIX = "CATALOG ";

/**
 * The payload of the capture's one `CATALOG` line, verbatim, or null when
 * the capture carries none or more than one.
 *
 * @param log The captured bytes of one run.
 */
function payloadOf(log) {
  const lines = log.split("\n").filter((line) => line.startsWith(CATALOG_PREFIX));
  if (lines.length !== 1) return null;
  return lines[0].slice(CATALOG_PREFIX.length);
}

/**
 * The messages a run posted on simulator message channels, in posting order,
 * read from the capture's simulator message log: one `{channel, data}` JSON
 * line per message, `data` the message bytes in base64.
 *
 * @param simxLog The text of the simulator message log.
 * @returns One `{ channel, text }` per message, `text` its bytes read as UTF-8.
 */
function channelMessages(simxLog) {
  return simxLog
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const message = JSON.parse(line);
      return { channel: message.channel, text: Buffer.from(message.data, "base64").toString("utf8") };
    });
}

/** A channel version declaration: a decimal integer from 1, without leading zeros. */
const VERSION_DECLARATION = /^[1-9][0-9]*$/;

/**
 * The parts of one message the extension posts on a simulator message
 * channel: the channel version its first line declares, the payload after
 * that line, and the frame's kind -- `"ping"` for the empty payload of the
 * ping the extension posts at startup, `"catalog"` for any other payload.
 *
 * @param text The message's bytes read as UTF-8.
 * @returns `{ version, payload, kind }`, or null when `text` does not begin
 *   with a version declaration line.
 */
function frameOf(text) {
  const lineEnd = text.indexOf("\n");
  if (lineEnd < 0 || !VERSION_DECLARATION.test(text.slice(0, lineEnd))) return null;
  const payload = text.slice(lineEnd + 1);
  return { version: Number(text.slice(0, lineEnd)), payload, kind: payload.length === 0 ? "ping" : "catalog" };
}

/**
 * The canonical form of a parsed JSON value: every object's keys sorted, so
 * two values serialize identically exactly when they hold the same fields.
 *
 * @param value A parsed JSON value.
 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}

/**
 * Whether two parsed JSON values hold the same fields, order of object keys
 * aside.
 */
function sameJson(actual, expected) {
  return JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected));
}

/**
 * JSON text of `value` with every code unit outside printable ASCII escaped
 * to a lowercase `\uXXXX`, as the catalog serializer escapes it.
 */
function asciiJson(value) {
  return JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}

/**
 * One value of a structural listing as a token: a string of printable
 * non-space ASCII verbatim, an array of such strings joined by commas, and
 * anything else as {@link asciiJson} of its {@link canonical} form.
 */
function structuralValue(value) {
  const plain = (item) => typeof item === "string" && /^[\x21-\x7e]+$/.test(item);
  if (plain(value)) return value;
  if (Array.isArray(value) && value.length > 0 && value.every(plain)) return value.join(",");
  return asciiJson(canonical(value));
}

/**
 * The tokens of the fields `keys` that `entry` carries, in the order of
 * `keys`: a boolean field as its key when true and `key=false` when false,
 * any other field as `key=<value>`. A field the entry does not carry yields
 * no token.
 */
function fieldTokens(entry, keys) {
  const tokens = [];
  for (const key of keys) {
    const value = entry[key];
    if (value === undefined) continue;
    tokens.push(typeof value === "boolean" ? (value ? key : `${key}=false`) : `${key}=${structuralValue(value)}`);
  }
  return tokens;
}

/** The listing token for `entry`'s icon: `["icon"]` when `entry` carries an icon, else an empty array. */
function iconToken(entry) {
  return entry.icon === undefined ? [] : ["icon"];
}

/** The fields of a grammar slot that are registration structure, in listing order. */
const SLOT_KEYS = [
  "name",
  "type",
  "anonymous",
  "derived",
  "optional",
  "required",
  "modifier",
  "repeated",
  "default",
  "range",
];

/** The fields of a grammar construct that are registration structure, in listing order. */
const CONSTRUCT_KEYS = ["name", "condition", "min", "max"];

/**
 * The listing lines of the grammar node `node` and the nodes under it,
 * indented by `indent`: a slot (kind `arg`, or no kind in a flat `args`
 * list) as `arg <tileId>` and its structural fields, a construct as its kind
 * and its structural fields, then its children one level deeper -- a
 * conditional's branches each under a `then` or `else` line.
 */
function grammarLines(node, indent) {
  const kind = node.kind ?? "arg";
  if (kind === "arg") {
    return [`${indent}${["arg", node.tileId, ...fieldTokens(node, SLOT_KEYS), ...iconToken(node)].join(" ")}`];
  }
  const lines = [`${indent}${[kind, ...fieldTokens(node, CONSTRUCT_KEYS)].join(" ")}`];
  const deeper = `${indent}  `;
  for (const child of [...(node.items || []), ...(node.options || []), ...(node.item ? [node.item] : [])]) {
    lines.push(...grammarLines(child, deeper));
  }
  for (const branch of ["then", "else"]) {
    if (node[branch] === undefined) continue;
    lines.push(`${deeper}${branch}`, ...grammarLines(node[branch], `${deeper}  `));
  }
  return lines;
}

/**
 * The structural listing of the parsed catalog payload `payload`: every fact
 * that is registration structure, one entry per line, in payload order, and
 * nothing that is display. Each pack lists its types (with their fields,
 * each field's accessor by presence), tiles (with their outputs and their
 * argument grammar), operators, overloads, core tile icon entries and core
 * type icon entries; then the payload's diagnostics. Names, ids, kinds, type
 * references, flags, operands, grammar shapes and default values are listed;
 * an icon is listed by its presence alone. Labels, docs, palette groups,
 * slot units, sentence words and icon bytes are not listed, and neither is
 * any field this listing does not name.
 *
 * @param payload The parsed catalog payload.
 * @returns The listing's text, one line per entry, each line ending in a newline.
 */
function structuralListing(payload) {
  const lines = [];
  const line = (depth, ...tokens) => lines.push(`${"  ".repeat(depth)}${tokens.join(" ")}`);
  for (const pack of payload.packs || []) {
    line(0, "pack", pack.name);
    for (const type of pack.types || []) {
      line(
        1,
        "type",
        type.name,
        ...fieldTokens(type, ["native", "asset", "brain", "variableFactory"]),
        ...iconToken(type)
      );
      for (const field of type.fields || []) {
        const accessor =
          field.accessor === undefined ? [] : ["accessor", ...iconToken(field.accessor).map(() => "accessor-icon")];
        line(2, "field", field.name, field.type, ...fieldTokens(field, ["readOnly"]), ...accessor);
      }
    }
    for (const tile of pack.tiles || []) {
      const flags = fieldTokens(tile, ["returns", "inline", "writableResult", "async", "consumesWhenResult"]);
      line(1, "tile", tile.kind, tile.name, ...flags, ...iconToken(tile));
      for (const output of tile.outputs || []) {
        line(2, "output", output.name, output.type, ...fieldTokens(output, ["writableResult"]), ...iconToken(output));
      }
      for (const container of ["args", "call"]) {
        if (tile[container] === undefined) continue;
        line(2, container);
        for (const node of tile[container]) lines.push(...grammarLines(node, "      "));
      }
    }
    for (const operator of pack.operators || []) {
      line(1, "operator", operator.name, ...fieldTokens(operator, ["operands", "returns"]));
    }
    for (const overload of pack.overloads || []) {
      line(1, "overload", overload.name, ...fieldTokens(overload, ["operator", "operands", "returns"]));
    }
    for (const entry of pack.coreTileIcons || []) line(1, "core-tile-icon", entry.tileId, ...iconToken(entry));
    for (const entry of pack.coreTypeIcons || []) line(1, "core-type-icon", entry.type, ...iconToken(entry));
  }
  for (const diagnostic of payload.diagnostics || []) {
    line(0, "diagnostic", diagnostic.code, ...fieldTokens(diagnostic, ["name", "pack", "spec", "otherPack"]));
  }
  return lines.map((entry) => `${entry}\n`).join("");
}

module.exports = {
  CATALOG_PREFIX,
  payloadOf,
  channelMessages,
  frameOf,
  canonical,
  sameJson,
  asciiJson,
  structuralListing,
};
