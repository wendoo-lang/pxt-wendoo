/**
 * The observable trace: a deterministic, line-oriented ASCII record of one VM
 * run's externally visible effects under a scripted input schedule. Two VM
 * implementations fed the same program and the same schedule render
 * byte-identical traces.
 *
 * Format version 1 is locked. Integer scalars render as minimal lowercase
 * hexadecimal of their unsigned 32-bit value; brain-observable numbers render
 * as the IEEE-754 bit pattern at the profile's precision; strings render as a
 * double-quoted UTF-8 byte sequence.
 */
namespace wendoo {
  /** Version of the core observable-trace grammar this writer renders. */
  export const OBSERVABLE_TRACE_FORMAT_VERSION = 1;

  const HEX_DIGITS = "0123456789abcdef";

  /** Destination one rendered trace line is handed to. */
  export class TraceSink {
    constructor() {}

    /**
     * Accept one complete trace line, without its terminator.
     *
     * @param text - The line's text.
     */
    line(text: string): void {}
  }

  /** A {@link TraceSink} that writes each line to the console output. */
  export class ConsoleTraceSink extends TraceSink {
    line(text: string): void {
      console.log(text);
    }
  }

  /** Minimal lowercase hexadecimal of `v` as an unsigned 32-bit integer. */
  export function hexU32(v: number): string {
    let x = v >>> 0;
    if (x === 0) {
      return "0";
    }
    let out = "";
    while (x > 0) {
      out = HEX_DIGITS.charAt(x & 0xf) + out;
      x = x >>> 4;
    }
    return out;
  }

  /** Lowercase two-digit hexadecimal of one byte. */
  function hexByte(v: number): string {
    return HEX_DIGITS.charAt((v >> 4) & 0xf) + HEX_DIGITS.charAt(v & 0xf);
  }

  /**
   * The UTF-8 bytes of `text`, one entry per byte, with surrogate pairs
   * combined into their code point.
   *
   * @param text - Source text.
   */
  function utf8Bytes(text: string): number[] {
    const out: number[] = [];
    let i = 0;
    while (i < text.length) {
      let code = text.charCodeAt(i);
      i++;
      if (code >= 0xd800 && code <= 0xdbff && i < text.length) {
        const low = text.charCodeAt(i);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          i++;
        }
      }
      if (code < 0x80) {
        out.push(code);
      } else if (code < 0x800) {
        out.push(0xc0 | (code >> 6));
        out.push(0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        out.push(0xe0 | (code >> 12));
        out.push(0x80 | ((code >> 6) & 0x3f));
        out.push(0x80 | (code & 0x3f));
      } else {
        out.push(0xf0 | (code >> 18));
        out.push(0x80 | ((code >> 12) & 0x3f));
        out.push(0x80 | ((code >> 6) & 0x3f));
        out.push(0x80 | (code & 0x3f));
      }
    }
    return out;
  }

  function quoted(text: string): string {
    const bytes = utf8Bytes(text);
    let out = '"';
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if (byte === 0x22) {
        out += '\\"';
      } else if (byte === 0x5c) {
        out += "\\\\";
      } else if (byte >= 0x20 && byte <= 0x7e) {
        out += String.fromCharCode(byte);
      } else {
        out += `\\x${hexByte(byte)}`;
      }
    }
    return `${out}"`;
  }

  /**
   * Accumulates observable-trace events and hands each rendered line to a
   * sink. Construction emits the three-line header; each event method emits
   * one line.
   */
  export class ObservableTraceWriter {
    private sink: TraceSink;
    private scratch: Buffer;

    /**
     * @param sink - Destination each rendered line is handed to.
     * @param profileId - Numeric device-profile id of the traced program's envelope.
     */
    constructor(sink: TraceSink, profileId: number) {
      this.sink = sink;
      this.scratch = Buffer.create(8);
      sink.line(`mctrace ${hexU32(OBSERVABLE_TRACE_FORMAT_VERSION)}`);
      sink.line(`profile ${hexU32(profileId)}`);
      sink.line("precision f64");
    }

    /**
     * Record one scheduled think boundary.
     *
     * @param ordinal - 1-based tick ordinal within the schedule.
     * @param time - Cumulative scheduled time stamped on the execution context.
     * @param dt - Time delta stamped on the execution context.
     */
    tick(ordinal: number, time: number, dt: number): void {
      this.sink.line(`tick ${hexU32(ordinal)} time ${this.numberBits(time)} dt ${this.numberBits(dt)}`);
    }

    /**
     * Record one completed synchronous host-bound action dispatch.
     *
     * @param actionId - Stable registry id of the dispatched action.
     * @param callSiteId - Call-site id the dispatch was bound to.
     * @param args - Positional argument buffer as the binding received it.
     * @param result - Value the call returned.
     */
    hostActionCall(actionId: number, callSiteId: number, args: Value[], result: Value): void {
      this.sink.line(`${this.callPrefix("action", actionId, callSiteId, args)} result ${this.valueToken(result)}`);
    }

    /**
     * Record one fiber fault.
     *
     * @param fiberId - Id of the faulted fiber.
     * @param code - Numeric wire-stable fault classifier.
     */
    fiberFault(fiberId: number, code: number): void {
      this.sink.line(`fault ${hexU32(fiberId)} ${hexU32(code)}`);
    }

    private callPrefix(verb: string, id: number, callSiteId: number, args: Value[]): string {
      let text = `${verb} ${hexU32(id)} site ${hexU32(callSiteId)} args ${hexU32(args.length)}`;
      for (let i = 0; i < args.length; i++) {
        text += ` ${this.valueToken(args[i])}`;
      }
      return text;
    }

    /** The IEEE-754 binary64 bit pattern of `v`, most significant byte first. */
    private numberBits(v: number): string {
      this.scratch.setNumber(NumberFormat.Float64LE, 0, v);
      let out = "";
      for (let i = 7; i >= 0; i--) {
        out += hexByte(this.scratch.getNumber(NumberFormat.UInt8LE, i));
      }
      return out;
    }

    private valueToken(v: Value): string {
      if (v.t === NativeType.Void) {
        return "void";
      }
      if (v.t === NativeType.Nil) {
        return "nil";
      }
      if (v.t === NativeType.Boolean) {
        return `bool ${v.b ? "1" : "0"}`;
      }
      if (v.t === NativeType.Number) {
        return `number ${this.numberBits(v.num)}`;
      }
      if (v.t === NativeType.String) {
        return `string ${quoted(v.str)}`;
      }
      return "opaque";
    }
  }

  /** Forwards the VM's visible effects into an {@link ObservableTraceWriter}. */
  export class TraceTap extends VmObserver {
    private writer: ObservableTraceWriter;

    constructor(writer: ObservableTraceWriter) {
      super();
      this.writer = writer;
    }

    onHostActionCall(actionId: number, callSiteId: number, args: Value[], result: Value): void {
      this.writer.hostActionCall(actionId, callSiteId, args, result);
    }

    onFiberFault(fiberId: number, code: number): void {
      this.writer.fiberFault(fiberId, code);
    }
  }
}
