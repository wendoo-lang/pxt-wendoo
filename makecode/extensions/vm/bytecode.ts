/**
 * Bytecode opcode numbers and the operand layout the binary program artifact
 * encodes each one with.
 */
namespace wendoo {
  /** Brain VM bytecode opcodes, at their wire-stable numbers. */
  export enum Op {
    PUSH_CONST_VAL = 0,
    POP = 1,
    DUP = 2,
    SWAP = 3,
    PUSH_CONST_NUM = 4,
    PUSH_CONST_STR = 5,
    STACK_SET_REL = 6,
    LOAD_VAR_SLOT = 10,
    STORE_VAR_SLOT = 11,
    LOAD_SYSTEM_VAR = 12,
    STORE_SYSTEM_VAR = 13,
    JMP = 20,
    JMP_IF_FALSE = 21,
    JMP_IF_TRUE = 22,
    CALL = 30,
    RET = 31,
    SPAWN_RULE = 32,
    HOST_CALL = 40,
    HOST_CALL_ASYNC = 41,
    ACTION_CALL = 42,
    ACTION_CALL_ASYNC = 43,
    HOST_ACTION_CALL = 44,
    HOST_ACTION_CALL_ASYNC = 45,
    AWAIT = 50,
    YIELD = 51,
    TRY = 60,
    END_TRY = 61,
    THROW = 62,
    WHEN_START = 70,
    WHEN_END = 71,
    DO_START = 72,
    DO_END = 73,
    WHEN_END_PRESENT = 74,
    LIST_NEW = 90,
    LIST_PUSH = 91,
    LIST_GET = 92,
    LIST_SET = 93,
    LIST_LEN = 94,
    LIST_POP = 95,
    LIST_SHIFT = 96,
    LIST_REMOVE = 97,
    LIST_INSERT = 98,
    LIST_SWAP = 99,
    MAP_NEW = 100,
    MAP_SET = 101,
    MAP_GET = 102,
    MAP_HAS = 103,
    MAP_DELETE = 104,
    STRUCT_NEW = 110,
    RESERVED_111 = 111,
    RESERVED_112 = 112,
    STRUCT_COPY_EXCEPT = 113,
    STRUCT_GET_FIELD = 114,
    STRUCT_SET_FIELD = 115,
    STRUCT_DEEP_COPY = 116,
    GET_FIELD = 120,
    SET_FIELD = 121,
    LOAD_LOCAL = 130,
    STORE_LOCAL = 131,
    LOAD_CALLSITE_VAR = 140,
    STORE_CALLSITE_VAR = 141,
    TYPE_CHECK = 150,
    INSTANCE_OF = 151,
    CALL_INDIRECT = 160,
    CALL_INDIRECT_ARGS = 161,
    MAKE_CLOSURE = 170,
    LOAD_CAPTURE = 171,
    WHEN_END_CHAIN = 172,
    WHEN_END_PRESENT_CHAIN = 173,
  }

  /**
   * Operand layout of one opcode in the binary instruction encoding. Every
   * operand is a contiguous `a, b, c` prefix; the variants below are the only
   * shapes the contract uses.
   */
  export enum OperandSchema {
    /** The opcode has no operand-schema entry: an unknown opcode number. */
    Unknown = -1,
    /** No operands. */
    None = 0,
    /** One unsigned var-int operand in `a`. */
    U = 1,
    /** One zigzag-signed var-int operand in `a`: a relative jump offset. */
    S = 2,
    /** Two unsigned var-int operands, in `a` and `b`. */
    UU = 3,
    /** Three unsigned var-int operands, in `a`, `b` and `c`. */
    UUU = 4,
    /** An unsigned var-int in `a` and an optional, sentinel-biased unsigned var-int in `b`. */
    UOptU = 5,
  }

  /**
   * The operand layout `op` is encoded with, or {@link OperandSchema.Unknown}
   * when the number is not an opcode this contract assigns.
   *
   * @param op - Opcode number read off the wire.
   */
  export function operandSchemaOf(op: number): OperandSchema {
    switch (op) {
      case Op.POP:
      case Op.DUP:
      case Op.SWAP:
      case Op.RET:
      case Op.AWAIT:
      case Op.YIELD:
      case Op.END_TRY:
      case Op.THROW:
      case Op.WHEN_START:
      case Op.DO_START:
      case Op.DO_END:
      case Op.LIST_PUSH:
      case Op.LIST_GET:
      case Op.LIST_SET:
      case Op.LIST_LEN:
      case Op.LIST_POP:
      case Op.LIST_SHIFT:
      case Op.LIST_REMOVE:
      case Op.LIST_INSERT:
      case Op.LIST_SWAP:
      case Op.MAP_SET:
      case Op.MAP_GET:
      case Op.MAP_HAS:
      case Op.MAP_DELETE:
      case Op.RESERVED_111:
      case Op.RESERVED_112:
      case Op.STRUCT_DEEP_COPY:
      case Op.GET_FIELD:
      case Op.SET_FIELD:
        return OperandSchema.None;
      case Op.PUSH_CONST_VAL:
      case Op.PUSH_CONST_NUM:
      case Op.PUSH_CONST_STR:
      case Op.STACK_SET_REL:
      case Op.LOAD_VAR_SLOT:
      case Op.STORE_VAR_SLOT:
      case Op.LOAD_SYSTEM_VAR:
      case Op.STORE_SYSTEM_VAR:
      case Op.SPAWN_RULE:
      case Op.STRUCT_GET_FIELD:
      case Op.STRUCT_SET_FIELD:
      case Op.LOAD_LOCAL:
      case Op.STORE_LOCAL:
      case Op.LOAD_CALLSITE_VAR:
      case Op.STORE_CALLSITE_VAR:
      case Op.TYPE_CHECK:
      case Op.INSTANCE_OF:
      case Op.CALL_INDIRECT:
      case Op.CALL_INDIRECT_ARGS:
      case Op.LOAD_CAPTURE:
        return OperandSchema.U;
      case Op.JMP:
      case Op.JMP_IF_FALSE:
      case Op.JMP_IF_TRUE:
      case Op.TRY:
      case Op.WHEN_END:
      case Op.WHEN_END_PRESENT:
      case Op.WHEN_END_CHAIN:
      case Op.WHEN_END_PRESENT_CHAIN:
        return OperandSchema.S;
      case Op.CALL:
      case Op.MAKE_CLOSURE:
        return OperandSchema.UU;
      case Op.HOST_CALL:
      case Op.HOST_CALL_ASYNC:
      case Op.ACTION_CALL:
      case Op.ACTION_CALL_ASYNC:
      case Op.HOST_ACTION_CALL:
      case Op.HOST_ACTION_CALL_ASYNC:
        return OperandSchema.UUU;
      case Op.LIST_NEW:
      case Op.MAP_NEW:
      case Op.STRUCT_NEW:
      case Op.STRUCT_COPY_EXCEPT:
        return OperandSchema.UOptU;
      default:
        return OperandSchema.Unknown;
    }
  }

  /** Operand value standing for an absent optional operand. */
  export const NO_OPERAND = -1;

  /** One decoded instruction: an opcode plus up to three operands. */
  export class Instr {
    /** Opcode number. */
    op: number;
    /** First operand, or {@link NO_OPERAND} when the opcode takes none. */
    a: number;
    /** Second operand, or {@link NO_OPERAND} when absent. */
    b: number;
    /** Third operand, or {@link NO_OPERAND} when absent. */
    c: number;

    constructor(op: number, a: number, b: number, c: number) {
      this.op = op;
      this.a = a;
      this.b = b;
      this.c = c;
    }
  }
}
