import { SIMX_CHANNEL } from "../sim-channel.js";

/** One program-update frame as the program's Wendoo extension reads it off the channel. */
export interface ReadProgramUpdate {
  /** The channel version the frame's first line declares. */
  readonly version: number;
  readonly documentId: string;
  readonly name: string;
  readonly sourceHash: string;
  readonly bytecode: Uint8Array;
}

/**
 * Reads a program-update frame the way the program's Wendoo extension does:
 * the channel version in decimal and a line feed, then the document id, the
 * name, and the source hash, each a ULEB128 byte length and that many UTF-8
 * bytes, then the program's byte length as a ULEB128 and the program bytes.
 * Throws when `data` is not one whole frame.
 *
 * @param data - The message bytes.
 */
export function readProgramUpdateFrame(data: Uint8Array): ReadProgramUpdate {
  let pos = data.indexOf(0x0a);
  if (pos < 1) throw new Error("no channel version line");
  const version = Number(new TextDecoder().decode(data.subarray(0, pos)));
  pos++;
  const varUint = (): number => {
    let result = 0;
    let weight = 1;
    for (;;) {
      if (pos >= data.length) throw new Error("frame truncated");
      const byte = data[pos++];
      result += (byte & 0x7f) * weight;
      if ((byte & 0x80) === 0) return result;
      weight *= 128;
    }
  };
  const bytes = (): Uint8Array => {
    const length = varUint();
    if (pos + length > data.length) throw new Error("frame truncated");
    const out = data.subarray(pos, pos + length);
    pos += length;
    return out;
  };
  const text = (): string => new TextDecoder().decode(bytes());
  const documentId = text();
  const name = text();
  const sourceHash = text();
  const bytecode = bytes();
  if (pos !== data.length) throw new Error("bytes after the frame");
  return { version, documentId, name, sourceHash, bytecode: Uint8Array.from(bytecode) };
}

/**
 * The program-update frames among `posted`, the messages a simulator
 * extension posted to MakeCode, in posting order: every message on
 * `channel` carrying bytes, read by {@link readProgramUpdateFrame}.
 */
export function postedProgramUpdates(posted: readonly unknown[], channel = SIMX_CHANNEL): ReadProgramUpdate[] {
  return posted.flatMap((message) => {
    const packet = message as { type?: unknown; channel?: unknown; data?: unknown };
    if (packet.type !== "messagepacket" || packet.channel !== channel || !(packet.data instanceof Uint8Array))
      return [];
    if (packet.data.length === 0) return [];
    return [readProgramUpdateFrame(packet.data)];
  });
}
