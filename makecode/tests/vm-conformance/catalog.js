/*
 * Reads the serialized catalog out of a capture and compares payloads: the
 * `CATALOG <payload>` line a run prints, the framed messages it posts on a
 * simulator message channel, and a canonical form under which two parsed
 * payloads can be compared field for field.
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

module.exports = { CATALOG_PREFIX, payloadOf, channelMessages, frameOf, canonical, sameJson };
