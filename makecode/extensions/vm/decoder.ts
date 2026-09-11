/**
 * Decoder for the binary brain program artifact (`.mcprogram`, format version
 * 4): a 4-byte magic, a 1-byte format version, the numeric device-profile id,
 * a 1-byte section-presence bitmask, then the positional sections `CSTR`,
 * `TYPS`, `CNUM`, `CVAL`, `FUNC`, `VARS`, the present optional sections
 * (`ACTS`, `RULF`, `RANC`, `SYST`), and `PAGE`. Sections carry no tags or
 * lengths; each is self-delimiting by its leading count.
 */
namespace wendoo {
  /** Format version of the binary program artifact this decoder reads. */
  export const BINARY_PROGRAM_FORMAT_VERSION = 4;

  // File magic identifying a binary brain program artifact.
  const MAGIC = [0x89, 0x4d, 0x42, 0x50];

  const NUMBER_DISCRIMINANT_SMALL_INT = 0;
  const NUMBER_DISCRIMINANT_F32 = 1;
  const NUMBER_DISCRIMINANT_F64 = 2;

  const PRESENCE_ACTS = 1;
  const PRESENCE_RULF = 2;
  const PRESENCE_RANC = 4;
  const PRESENCE_SYST = 8;

  const ACTION_FLAG_INITIALIZER = 1;
  const ACTION_FLAG_ACTIVATION = 2;
  const ACTION_FLAG_DEACTIVATION = 4;

  const SYSTEM_FLAG_INIT = 1;
  const SYSTEM_FLAG_THINK = 2;

  const TYPE_ENTRY_TAG_ATOM = 0;
  const TYPE_ENTRY_TAG_LIST = 1;
  const TYPE_ENTRY_TAG_MAP = 2;
  const TYPE_ENTRY_TAG_UNION = 3;
  const TYPE_ENTRY_TAG_FUNCTION = 4;
  const TYPE_ENTRY_TAG_NULLABLE = 5;
  const TYPE_ENTRY_TAG_STRUCT = 6;
  const TYPE_ENTRY_TAG_ENUM = 7;

  const ENUM_VALUE_KIND_NUMBER = 0;
  const ENUM_VALUE_KIND_STRING = 1;

  const CALL_SITE_BINDING_HOST = 0;

  // Place value of each seven-bit ULEB128 group, in wire order.
  const VARUINT_GROUP_WEIGHTS = [1, 128, 16384, 2097152, 268435456];

  /**
   * Sequential reader over the artifact bytes. Every read advances the
   * cursor. A read past the end records `WENDOO_BINARY_CODEC_TRUNCATED` and
   * yields zero; callers test {@link ByteReader.failed} to stop a section
   * loop once a failure is recorded.
   */
  export class ByteReader {
    private bytes: number[];
    private pos: number;
    private scratch: Buffer;
    /** Machine-readable code of the first decode failure, or `""`. */
    errorCode: string;

    constructor(bytes: number[]) {
      this.bytes = bytes;
      this.pos = 0;
      this.scratch = Buffer.create(8);
      this.errorCode = "";
    }

    /** Whether a decode failure has been recorded. */
    failed(): boolean {
      return this.errorCode.length > 0;
    }

    /**
     * Record the first decode failure. Later failures do not overwrite it.
     *
     * @param code - Stable machine-readable failure code.
     */
    fail(code: string): void {
      if (this.errorCode.length === 0) {
        this.errorCode = code;
      }
    }

    /** Reads one raw byte. */
    u8(): number {
      if (this.pos >= this.bytes.length) {
        this.fail(DECODE_ERROR_TRUNCATED);
        return 0;
      }
      const v = this.bytes[this.pos];
      this.pos++;
      return v;
    }

    /** Reads a ULEB128 unsigned integer. */
    varUint(): number {
      let result = 0;
      for (let i = 0; i < 5; i++) {
        const byte = this.u8();
        result = result + (byte & 0x7f) * VARUINT_GROUP_WEIGHTS[i];
        if ((byte & 0x80) === 0) {
          return result;
        }
      }
      this.fail(DECODE_ERROR_VARINT_OVERFLOW);
      return 0;
    }

    /** Reads a zigzag + ULEB128 signed integer. */
    varInt(): number {
      const raw = this.varUint();
      const half = raw >>> 1;
      return (raw & 1) === 1 ? -half - 1 : half;
    }

    /** Reads a raw little-endian IEEE-754 binary32. */
    f32(): number {
      for (let i = 0; i < 4; i++) {
        this.scratch.setNumber(NumberFormat.UInt8LE, i, this.u8());
      }
      return this.scratch.getNumber(NumberFormat.Float32LE, 0);
    }

    /** Reads a raw little-endian IEEE-754 binary64. */
    f64(): number {
      for (let i = 0; i < 8; i++) {
        this.scratch.setNumber(NumberFormat.UInt8LE, i, this.u8());
      }
      return this.scratch.getNumber(NumberFormat.Float64LE, 0);
    }

    /** Reads a byte-length-prefixed UTF-8 string. */
    varString(): string {
      const byteLen = this.varUint();
      let out = "";
      let i = 0;
      while (i < byteLen) {
        const lead = this.u8();
        i++;
        if (lead < 0x80) {
          out += String.fromCharCode(lead);
          continue;
        }
        let extra = 0;
        let code = 0;
        if ((lead & 0xe0) === 0xc0) {
          extra = 1;
          code = lead & 0x1f;
        } else if ((lead & 0xf0) === 0xe0) {
          extra = 2;
          code = lead & 0x0f;
        } else {
          extra = 3;
          code = lead & 0x07;
        }
        for (let k = 0; k < extra; k++) {
          code = (code << 6) | (this.u8() & 0x3f);
          i++;
        }
        if (code > 0xffff) {
          const astral = code - 0x10000;
          out += String.fromCharCode(0xd800 + (astral >> 10));
          out += String.fromCharCode(0xdc00 + (astral & 0x3ff));
        } else {
          out += String.fromCharCode(code);
        }
      }
      return out;
    }
  }

  /** The artifact does not begin with the binary program magic. */
  export const DECODE_ERROR_INVALID_MAGIC = "WENDOO_BINARY_CODEC_INVALID_MAGIC";
  /** The artifact's format version is not the one this decoder reads. */
  export const DECODE_ERROR_UNSUPPORTED_FORMAT_VERSION = "WENDOO_BINARY_CODEC_UNSUPPORTED_FORMAT_VERSION";
  /** A CNUM discriminant byte is not one of `0`, `1` or `2`. */
  export const DECODE_ERROR_INVALID_NUMBER_DISCRIMINANT = "WENDOO_BINARY_CODEC_INVALID_NUMBER_DISCRIMINANT";
  /** A value tag byte is not a value kind this VM models. */
  export const DECODE_ERROR_INVALID_VALUE_TAG = "WENDOO_BINARY_CODEC_INVALID_VALUE_TAG";
  /** An opcode byte has no operand-schema entry. */
  export const DECODE_ERROR_UNKNOWN_OPCODE = "WENDOO_BINARY_CODEC_UNKNOWN_OPCODE";
  /** A TYPS entry tag byte is not a known type-entry tag. */
  export const DECODE_ERROR_INVALID_TYPE_ENTRY_TAG = "WENDOO_BINARY_CODEC_INVALID_TYPE_ENTRY_TAG";
  /** A TYPS enum entry's value-kind byte is not `0` or `1`. */
  export const DECODE_ERROR_INVALID_ENUM_VALUE_KIND = "WENDOO_BINARY_CODEC_INVALID_ENUM_VALUE_KIND";
  /** A read ran past the end of the artifact. */
  export const DECODE_ERROR_TRUNCATED = "WENDOO_BINARY_CODEC_TRUNCATED";
  /** A var-int did not terminate within its five-byte budget. */
  export const DECODE_ERROR_VARINT_OVERFLOW = "WENDOO_BINARY_CODEC_VARINT_OVERFLOW";
  /** The artifact text is not an even-length run of hex digits. */
  export const DECODE_ERROR_INVALID_HEX = "WENDOO_BINARY_CODEC_INVALID_HEX";

  /** Outcome of decoding one binary program artifact. */
  export class DecodedProgram {
    /** Stable machine-readable failure code, or `""` when the decode succeeded. */
    errorCode: string;
    /** Numeric device-profile id from the artifact envelope. */
    profileId: number;
    /** The decoded program, meaningful only when {@link errorCode} is empty. */
    program: Program;

    constructor(errorCode: string, profileId: number, program: Program) {
      this.errorCode = errorCode;
      this.profileId = profileId;
      this.program = program;
    }
  }

  /**
   * Decodes a run of hexadecimal digit pairs into bytes. Returns an empty
   * array when the text is not an even-length run of hex digits.
   *
   * @param hex - Lowercase or uppercase hexadecimal text, two digits per byte.
   */
  function bytesFromHex(hex: string): number[] {
    const out: number[] = [];
    if (hex.length % 2 !== 0) {
      return out;
    }
    for (let i = 0; i < hex.length; i += 2) {
      const hi = hexDigitValue(hex.charCodeAt(i));
      const lo = hexDigitValue(hex.charCodeAt(i + 1));
      if (hi < 0 || lo < 0) {
        return [];
      }
      out.push((hi << 4) | lo);
    }
    return out;
  }

  function hexDigitValue(code: number): number {
    if (code >= 48 && code <= 57) {
      return code - 48;
    }
    if (code >= 97 && code <= 102) {
      return code - 87;
    }
    if (code >= 65 && code <= 70) {
      return code - 55;
    }
    return -1;
  }

  /**
   * Decodes a binary program artifact supplied as hexadecimal text.
   *
   * @param hex - The artifact bytes as hexadecimal digit pairs.
   */
  export function decodeProgramHex(hex: string): DecodedProgram {
    const bytes = bytesFromHex(hex);
    if (bytes.length === 0) {
      return new DecodedProgram(DECODE_ERROR_INVALID_HEX, 0, new Program());
    }
    return decodeProgram(bytes);
  }

  /**
   * Decodes a binary program artifact.
   *
   * @param bytes - The artifact bytes.
   */
  export function decodeProgram(bytes: number[]): DecodedProgram {
    const r = new ByteReader(bytes);
    const program = new Program();

    for (let i = 0; i < MAGIC.length; i++) {
      if (r.u8() !== MAGIC[i]) {
        return new DecodedProgram(DECODE_ERROR_INVALID_MAGIC, 0, program);
      }
    }
    if (r.u8() !== BINARY_PROGRAM_FORMAT_VERSION) {
      return new DecodedProgram(DECODE_ERROR_UNSUPPORTED_FORMAT_VERSION, 0, program);
    }
    const profileId = r.varUint();
    const presence = r.u8();

    const strings = readCstr(r);
    program.constStrings = strings.constStrings;
    program.types = readTyps(r, strings.all);
    program.constNumbers = readCnum(r);
    program.constValues = readCval(r, strings.all);
    program.functions = readFunc(r);
    readVars(r, strings.all, program);
    if ((presence & PRESENCE_ACTS) !== 0) {
      program.actions = readActs(r);
    }
    if ((presence & PRESENCE_RULF) !== 0) {
      program.ruleFuncIds = readCountedVarUints(r);
    }
    if ((presence & PRESENCE_RANC) !== 0) {
      readRanc(r, program);
    }
    if ((presence & PRESENCE_SYST) !== 0) {
      program.systems = readSyst(r, strings.all);
    }
    program.pages = readPage(r, strings.all);

    return new DecodedProgram(r.errorCode, profileId, program);
  }

  /** The artifact's string table and the constant-pool prefix of it. */
  class StringTable {
    /** Every interned string, in wire order. */
    all: string[];
    /** The leading run of {@link all} that opcode string operands index. */
    constStrings: string[];

    constructor(all: string[], constStringCount: number) {
      this.all = all;
      this.constStrings = all.slice(0, constStringCount);
    }
  }

  function readCstr(r: ByteReader): StringTable {
    const total = r.varUint();
    const constStringCount = r.varUint();
    const all: string[] = [];
    for (let i = 0; i < total && !r.failed(); i++) {
      all.push(r.varString());
    }
    return new StringTable(all, constStringCount);
  }

  function stringAt(r: ByteReader, strings: string[], index: number): string {
    if (index < 0 || index >= strings.length) {
      r.fail(DECODE_ERROR_TRUNCATED);
      return "";
    }
    return strings[index];
  }

  function readTyps(r: ByteReader, strings: string[]): ProgramTypeEntry[] {
    const count = r.varUint();
    const entries: ProgramTypeEntry[] = [];
    for (let i = 0; i < count && !r.failed(); i++) {
      const tag = r.u8();
      if (tag === TYPE_ENTRY_TAG_ATOM || tag === TYPE_ENTRY_TAG_LIST || tag === TYPE_ENTRY_TAG_NULLABLE) {
        r.varUint();
      } else if (tag === TYPE_ENTRY_TAG_MAP) {
        r.varUint();
        r.varUint();
      } else if (tag === TYPE_ENTRY_TAG_UNION) {
        const memberCount = r.varUint();
        for (let j = 0; j < memberCount; j++) {
          r.varUint();
        }
      } else if (tag === TYPE_ENTRY_TAG_FUNCTION) {
        const paramCount = r.varUint();
        for (let j = 0; j < paramCount; j++) {
          r.varUint();
        }
        r.varUint();
      } else if (tag === TYPE_ENTRY_TAG_STRUCT) {
        r.varUint();
        r.varUint();
        const fieldCount = r.varUint();
        for (let j = 0; j < fieldCount; j++) {
          r.varUint();
          r.varUint();
        }
      } else if (tag === TYPE_ENTRY_TAG_ENUM) {
        r.varUint();
        const symbolCount = r.varUint();
        if (symbolCount > 0) {
          const valueKind = r.u8();
          if (valueKind !== ENUM_VALUE_KIND_NUMBER && valueKind !== ENUM_VALUE_KIND_STRING) {
            r.fail(DECODE_ERROR_INVALID_ENUM_VALUE_KIND);
            return entries;
          }
          for (let j = 0; j < symbolCount; j++) {
            r.varUint();
            if (valueKind === ENUM_VALUE_KIND_STRING) {
              r.varUint();
            } else {
              readNumberEntry(r);
            }
          }
        }
      } else {
        r.fail(DECODE_ERROR_INVALID_TYPE_ENTRY_TAG);
        return entries;
      }
      entries.push(new ProgramTypeEntry(tag));
    }
    return entries;
  }

  function readNumberEntry(r: ByteReader): number {
    const discriminant = r.u8();
    if (discriminant === NUMBER_DISCRIMINANT_SMALL_INT) {
      return r.varInt();
    }
    if (discriminant === NUMBER_DISCRIMINANT_F32) {
      return r.f32();
    }
    if (discriminant === NUMBER_DISCRIMINANT_F64) {
      return r.f64();
    }
    r.fail(DECODE_ERROR_INVALID_NUMBER_DISCRIMINANT);
    return 0;
  }

  function readCnum(r: ByteReader): number[] {
    const count = r.varUint();
    const numbers: number[] = [];
    for (let i = 0; i < count && !r.failed(); i++) {
      numbers.push(readNumberEntry(r));
    }
    return numbers;
  }

  function readCval(r: ByteReader, strings: string[]): Value[] {
    const count = r.varUint();
    const values: Value[] = [];
    for (let i = 0; i < count && !r.failed(); i++) {
      values.push(readValue(r, strings));
    }
    return values;
  }

  function readValue(r: ByteReader, strings: string[]): Value {
    const raw = r.u8();
    const tag = raw === 255 ? ValueTag.Unknown : raw;
    if (tag === ValueTag.Unknown) {
      return UNKNOWN_VALUE;
    }
    if (tag === ValueTag.Void) {
      return VOID_VALUE;
    }
    if (tag === ValueTag.Nil) {
      return NIL_VALUE;
    }
    if (tag === ValueTag.Boolean) {
      return mkBoolean(r.u8() !== 0);
    }
    if (tag === ValueTag.Number) {
      return mkNumber(readNumberEntry(r));
    }
    if (tag === ValueTag.String) {
      return mkString(stringAt(r, strings, r.varUint()));
    }
    r.fail(DECODE_ERROR_INVALID_VALUE_TAG);
    return NIL_VALUE;
  }

  function readFunc(r: ByteReader): FunctionBytecode[] {
    const count = r.varUint();
    const functions: FunctionBytecode[] = [];
    for (let i = 0; i < count && !r.failed(); i++) {
      const numParams = r.varUint();
      const extraLocals = r.varUint();
      const injectCtxId = r.varUint();
      const instrCount = r.varUint();
      const code: Instr[] = [];
      for (let j = 0; j < instrCount && !r.failed(); j++) {
        code.push(readInstruction(r));
      }
      functions.push(
        new FunctionBytecode(
          code,
          numParams,
          numParams + extraLocals,
          injectCtxId === 0 ? NO_INJECT_CTX : injectCtxId - 1
        )
      );
    }
    return functions;
  }

  function readInstruction(r: ByteReader): Instr {
    const op = r.u8();
    const schema = operandSchemaOf(op);
    if (schema === OperandSchema.Unknown) {
      r.fail(DECODE_ERROR_UNKNOWN_OPCODE);
      return new Instr(op, NO_OPERAND, NO_OPERAND, NO_OPERAND);
    }
    if (schema === OperandSchema.None) {
      return new Instr(op, NO_OPERAND, NO_OPERAND, NO_OPERAND);
    }
    if (schema === OperandSchema.S) {
      return new Instr(op, r.varInt(), NO_OPERAND, NO_OPERAND);
    }
    if (schema === OperandSchema.U) {
      return new Instr(op, r.varUint(), NO_OPERAND, NO_OPERAND);
    }
    if (schema === OperandSchema.UU) {
      const a = r.varUint();
      return new Instr(op, a, r.varUint(), NO_OPERAND);
    }
    if (schema === OperandSchema.UUU) {
      const a = r.varUint();
      const b = r.varUint();
      return new Instr(op, a, b, r.varUint());
    }
    const a = r.varUint();
    const biased = r.varUint();
    return new Instr(op, a, biased === 0 ? NO_OPERAND : biased - 1, NO_OPERAND);
  }

  function readVars(r: ByteReader, strings: string[], program: Program): void {
    const count = r.varUint();
    for (let i = 0; i < count && !r.failed(); i++) {
      program.variableNames.push(stringAt(r, strings, r.varUint()));
      const biased = r.varUint();
      program.variableInitValues.push(biased === 0 ? NO_VARIABLE_INIT : biased - 1);
    }
  }

  function readActs(r: ByteReader): BytecodeAction[] {
    const count = r.varUint();
    const actions: BytecodeAction[] = [];
    for (let i = 0; i < count && !r.failed(); i++) {
      const flags = r.u8();
      const entryFuncId = r.varUint();
      const initializerFuncId = (flags & ACTION_FLAG_INITIALIZER) !== 0 ? r.varUint() : -1;
      const activationFuncId = (flags & ACTION_FLAG_ACTIVATION) !== 0 ? r.varUint() : -1;
      const deactivationFuncId = (flags & ACTION_FLAG_DEACTIVATION) !== 0 ? r.varUint() : -1;
      actions.push(new BytecodeAction(entryFuncId, initializerFuncId, activationFuncId, deactivationFuncId));
    }
    return actions;
  }

  function readCountedVarUints(r: ByteReader): number[] {
    const count = r.varUint();
    const out: number[] = [];
    for (let i = 0; i < count && !r.failed(); i++) {
      out.push(r.varUint());
    }
    return out;
  }

  function readRanc(r: ByteReader, program: Program): void {
    const count = r.varUint();
    for (let i = 0; i < count && !r.failed(); i++) {
      program.ruleChildren.push(r.varUint());
      program.ruleParents.push(r.varUint());
    }
  }

  function readSyst(r: ByteReader, strings: string[]): SystemRegistration[] {
    const count = r.varUint();
    const systems: SystemRegistration[] = [];
    for (let i = 0; i < count && !r.failed(); i++) {
      const flags = r.u8();
      const name = stringAt(r, strings, r.varUint());
      const storeSlot = r.varUint();
      const initFuncId = (flags & SYSTEM_FLAG_INIT) !== 0 ? r.varUint() : -1;
      const thinkFuncId = (flags & SYSTEM_FLAG_THINK) !== 0 ? r.varUint() : -1;
      systems.push(new SystemRegistration(name, storeSlot, initFuncId, thinkFuncId));
    }
    return systems;
  }

  function readPage(r: ByteReader, strings: string[]): PageMetadata[] {
    const count = r.varUint();
    const pages: PageMetadata[] = [];
    for (let i = 0; i < count && !r.failed(); i++) {
      const pageIndex = r.varUint();
      const pageId = stringAt(r, strings, r.varUint());
      const rootRuleFuncIds = readCountedVarUints(r);
      const callSiteCount = r.varUint();
      const callSites: ActionCallSite[] = [];
      for (let c = 0; c < callSiteCount && !r.failed(); c++) {
        const binding = r.u8();
        const callSiteId = r.varUint();
        callSites.push(new ActionCallSite(binding === CALL_SITE_BINDING_HOST, callSiteId, r.varUint()));
      }
      pages.push(new PageMetadata(pageIndex, pageId, rootRuleFuncIds, callSites));
    }
    return pages;
  }
}
