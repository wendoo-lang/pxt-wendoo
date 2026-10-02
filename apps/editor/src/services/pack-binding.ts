import type { BrainActionCallSpec, ITileMetadata, WendooModule, WendooModuleApi } from "@wendoo/core/app";
import {
  bag,
  choice,
  conditional,
  createHostActuator,
  createHostSensor,
  List,
  mkCallDef,
  mod,
  NIL_VALUE,
  optional,
  param,
  repeated,
  TilePlacement,
  VOID_VALUE,
} from "@wendoo/core/app";
import { BrainTileModifierDef, BrainTileOperatorDef, BrainTileParameterDef } from "@wendoo/core/brain/tiles";
import type {
  ActionOutputSpec,
  BrainActionArgRange,
  BrainActionCallArgSpec,
  BrainProgramValueJson,
  HostAsyncFn,
  HostSyncFn,
  OpParse,
  TypeId,
  UserArgIdentity,
  Value,
} from "@wendoo/core/runtime";
import {
  brainValueFromJson,
  CoreTypeIds,
  CoreTypeNames,
  mkAnonParameterId,
  mkPrivateArgId,
  mkTypeId,
  NativeType,
} from "@wendoo/core/runtime";
import type { MakeCodeIdManifest } from "@wendoo/makecode-session";
import type { CatalogArgNode, CatalogArgSlot, CatalogOperator, CatalogPack, CatalogTile, CatalogType } from "./catalog";

/**
 * Stable codes of the problems found binding a catalog pack's entries into
 * an authoring environment. An entry carrying one is left out of the
 * environment; the rest of its pack is bound.
 */
export const PackBindingCode = {
  /** An entry refers to a type that is neither a core type nor one the catalog declares; the token is the type name. */
  TYPE_UNKNOWN: "CATALOG_TYPE_UNKNOWN",
  /** A slot declares a default that is not a tagged value. */
  DEFAULT_UNREADABLE: "CATALOG_DEFAULT_UNREADABLE",
  /** A shared slot tile is declared with another type than its first declaration; the token is the slot's tile identity. */
  SHARED_TILE_CONFLICT: "CATALOG_SHARED_TILE_CONFLICT",
  /** An operator takes other than one or two operands, or declares no result type. */
  OPERATOR_SHAPE_UNSUPPORTED: "CATALOG_OPERATOR_SHAPE_UNSUPPORTED",
  /** The entry could not be bound: the language model refused it, or the allocation holds no id for it. */
  TILE_REJECTED: "CATALOG_TILE_REJECTED",
} as const;

/** Union of all {@link PackBindingCode} values. */
export type PackBindingCode = (typeof PackBindingCode)[keyof typeof PackBindingCode];

/** One problem found binding a pack entry. */
export interface PackBindingProblem {
  /** What the problem is. */
  readonly code: PackBindingCode;
  /** Name of the pack holding the entry. */
  readonly pack: string;
  /** Name of the entry. */
  readonly name: string;
  /** The offending token where the code names one. */
  readonly token?: string;
}

/** Fragment prefix of a parameter tile every pack and tile declaring it shares. */
const SHARED_PARAMETER_PREFIX = "parameter.";

/** Fragment prefix of a modifier tile every pack and tile declaring it shares. */
const SHARED_MODIFIER_PREFIX = "modifier.";

/** Precedence of a pack's infix operator: the additive tier. */
const INFIX_OPERATOR_PARSE: OpParse = { fixity: "infix", precedence: 120, assoc: "left" };

/** Precedence of a pack's prefix operator: the unary tier. */
const PREFIX_OPERATOR_PARSE: OpParse = { fixity: "prefix", precedence: 150 };

/** Every core type a catalog may refer to, by its catalog name. */
const CORE_TYPE_IDS: ReadonlyMap<string, TypeId> = new Map([
  [CoreTypeNames.Unknown, CoreTypeIds.Unknown],
  [CoreTypeNames.Void, CoreTypeIds.Void],
  [CoreTypeNames.Nil, CoreTypeIds.Nil],
  [CoreTypeNames.Boolean, CoreTypeIds.Boolean],
  [CoreTypeNames.Number, CoreTypeIds.Number],
  [CoreTypeNames.String, CoreTypeIds.String],
  [CoreTypeNames.Any, CoreTypeIds.Any],
  [CoreTypeNames.Function, CoreTypeIds.Function],
  [CoreTypeNames.Buffer, CoreTypeIds.Buffer],
]);

/** The value tags a slot default's tagged value may carry. */
const VALUE_TAGS: ReadonlySet<unknown> = new Set([...Object.values(NativeType), "handle"]);

/** Thrown while binding one entry: the problem that leaves it out. */
class EntryProblem {
  constructor(
    readonly code: PackBindingCode,
    readonly token?: string
  ) {}
}

/** A parameter tile one slot needs. */
interface ParameterTile {
  readonly id: string;
  readonly dataType: TypeId;
  readonly label: string;
  readonly hidden: boolean;
  readonly userArg?: UserArgIdentity;
  readonly anonType?: { readonly localName: string };
}

/** A modifier tile one slot needs. */
interface ModifierTile {
  readonly id: string;
  readonly label: string;
  readonly userArg?: UserArgIdentity;
}

/** The slot tiles one tile's grammar needs, collected while its call spec is built. */
interface SlotTiles {
  readonly parameters: ParameterTile[];
  readonly modifiers: ModifierTile[];
}

/** The label of the tile filling `slot`: the label the slot carries, or its declared fragment after the last dot when it carries none. */
function slotLabel(slot: CatalogArgSlot): string {
  return slot.label ?? slot.tileId.slice(slot.tileId.lastIndexOf(".") + 1);
}

/** The default `json` declares, read as a value. Throws an {@link EntryProblem} when it is not a tagged value. */
function defaultValueOf(json: unknown): Value {
  if (typeof json !== "object" || json === null || !VALUE_TAGS.has((json as { t?: unknown }).t)) {
    throw new EntryProblem(PackBindingCode.DEFAULT_UNREADABLE);
  }
  return brainValueFromJson(json as BrainProgramValueJson);
}

/**
 * Binds a session catalog's packs into an authoring environment, through the
 * language model's own builders: each struct type, each tile -- with the
 * parameter and modifier tiles its grammar's slots need -- and each operator,
 * under the ids `ids` allocates. An entry the model cannot take is left out
 * and reported, and the rest is bound.
 */
class PackBinder {
  private readonly typeIds = new Map<string, TypeId>(CORE_TYPE_IDS);
  private readonly sharedParameters = new Map<string, TypeId>();

  constructor(
    private readonly api: WendooModuleApi,
    private readonly ids: MakeCodeIdManifest,
    private readonly report: (problem: PackBindingProblem) => void
  ) {}

  /** Binds every entry of `packs`: every pack's types first, so any pack's entry may refer to them, then each pack's tiles and operators. */
  bind(packs: readonly CatalogPack[]): void {
    const declared = packs.flatMap((pack) => pack.types.map((type) => ({ pack, type })));
    for (const { type } of declared) {
      this.typeIds.set(type.name, mkTypeId(NativeType.Struct, type.name));
    }
    for (const { pack, type } of declared) {
      this.attempt(pack.name, type.name, () => {
        this.bindType(type);
      });
    }
    let nextFunctionId = this.ids.next.operator;
    for (const pack of packs) {
      for (const tile of pack.tiles) {
        if (tile.grammar === undefined || (tile.kind !== "sensor" && tile.kind !== "actuator")) continue;
        const fnId = nextFunctionId++;
        this.attempt(pack.name, tile.name, () => {
          this.bindTile(pack.name, tile, fnId);
        });
      }
      for (const operator of pack.operators) {
        this.attempt(pack.name, operator.name, () => {
          this.bindOperator(operator);
        });
      }
    }
  }

  /** Runs `bind`, reporting the problem that leaves the entry `name` out, as the model's refusal when it throws anything else. */
  private attempt(pack: string, name: string, bind: () => void): void {
    try {
      bind();
    } catch (error) {
      if (error instanceof EntryProblem) {
        this.report({ code: error.code, pack, name, ...(error.token === undefined ? {} : { token: error.token }) });
      } else {
        this.report({ code: PackBindingCode.TILE_REJECTED, pack, name });
      }
    }
  }

  /** The TypeId of the type the catalog names `name`. Throws an {@link EntryProblem} when it names none. */
  private typeOf(name: string): TypeId {
    const typeId = this.typeIds.get(name);
    if (typeId === undefined) throw new EntryProblem(PackBindingCode.TYPE_UNKNOWN, name);
    return typeId;
  }

  /** Registers `type` under its allocated atom, each field at the id the allocation gives it. */
  private bindType(type: CatalogType): void {
    const entry = this.ids.types.find((allocated) => allocated.name === type.name);
    if (entry === undefined) throw new EntryProblem(PackBindingCode.TILE_REJECTED);
    const fields = type.fields.map((field) => ({
      name: field.name,
      typeId: this.typeOf(field.type),
      fieldIndex: entry.fields.indexOf(field.name),
      ...(field.readOnly ? { readOnly: true } : {}),
    }));
    this.api.defineType({
      coreType: NativeType.Struct,
      typeId: mkTypeId(NativeType.Struct, type.name),
      name: type.name,
      atomId: entry.atom,
      fields: List.from(fields),
    });
  }

  /** The call spec of the slot `slot` of the tile `tile` of the pack `pack`, recording the slot tile it needs in `tiles`. */
  private slotSpec(pack: string, tile: string, slot: CatalogArgSlot, tiles: SlotTiles): BrainActionCallArgSpec {
    if (slot.modifier) {
      const shared = slot.tileId.startsWith(SHARED_MODIFIER_PREFIX);
      const id = shared ? slot.tileId : mkPrivateArgId(pack, tile, slot.tileId);
      tiles.modifiers.push({
        id,
        label: slotLabel(slot),
        ...(shared ? {} : { userArg: { namespace: pack, actionId: tile, argName: slot.tileId } }),
      });
      return { ...mod(id), ...this.slotOptions(slot) };
    }
    const typeName = slot.type ?? "";
    const dataType = this.typeOf(typeName);
    let parameter: ParameterTile;
    if (slot.anonymous) {
      parameter = {
        id: mkAnonParameterId(typeName),
        dataType,
        label: slot.label ?? typeName,
        hidden: true,
        anonType: { localName: typeName },
      };
    } else if (slot.tileId.startsWith(SHARED_PARAMETER_PREFIX)) {
      parameter = { id: slot.tileId, dataType, label: slotLabel(slot), hidden: false };
      const declared = this.sharedParameters.get(slot.tileId);
      if (declared !== undefined && declared !== dataType) {
        throw new EntryProblem(PackBindingCode.SHARED_TILE_CONFLICT, slot.tileId);
      }
    } else {
      parameter = {
        id: mkPrivateArgId(pack, tile, slot.tileId),
        dataType,
        label: slotLabel(slot),
        hidden: false,
        userArg: { namespace: pack, actionId: tile, argName: slot.tileId },
      };
    }
    tiles.parameters.push(parameter);
    return param(parameter.id, this.slotOptions(slot));
  }

  /** The argument options `slot` declares, in the model's shape. */
  private slotOptions(slot: CatalogArgSlot): Omit<BrainActionCallArgSpec, "type" | "tileId"> {
    const options: {
      name?: string;
      required?: boolean;
      anonymous?: boolean;
      default?: Value;
      derived?: true;
      range?: BrainActionArgRange;
      unit?: string;
    } = {};
    if (slot.name !== undefined) options.name = slot.name;
    if (slot.required !== undefined) options.required = slot.required;
    if (slot.anonymous) options.anonymous = true;
    if (slot.default !== undefined) options.default = defaultValueOf(slot.default);
    if (slot.derived) options.derived = true;
    if (slot.range !== undefined) options.range = slot.range;
    if (slot.unit !== undefined) options.unit = slot.unit;
    return options;
  }

  /** The call spec of the grammar node `node`, recording the slot tiles it needs in `tiles`. */
  private nodeSpec(pack: string, tile: string, node: CatalogArgNode, tiles: SlotTiles): BrainActionCallSpec {
    const named = node.name === undefined ? {} : { name: node.name };
    switch (node.kind) {
      case "arg":
        return this.slotSpec(pack, tile, node, tiles);
      case "seq":
        return { type: "seq", ...named, items: node.items.map((item) => this.nodeSpec(pack, tile, item, tiles)) };
      case "bag":
        return { ...bag(...node.items.map((item) => this.nodeSpec(pack, tile, item, tiles))), ...named };
      case "choice":
        return { ...choice(...node.options.map((option) => this.nodeSpec(pack, tile, option, tiles))), ...named };
      case "optional":
        return { ...optional(this.nodeSpec(pack, tile, node.item, tiles)), ...named };
      case "repeat":
        return { ...repeated(this.nodeSpec(pack, tile, node.item, tiles), { min: node.min, max: node.max }), ...named };
      case "conditional":
        return {
          ...conditional(
            node.condition,
            this.nodeSpec(pack, tile, node.then, tiles),
            node.else === undefined ? undefined : this.nodeSpec(pack, tile, node.else, tiles)
          ),
          ...named,
        };
    }
  }

  /** Registers the tile `tile` of the pack `pack` as a host sensor or actuator under its allocated action id, and the slot tiles its grammar needs. */
  private bindTile(pack: string, tile: CatalogTile, fnId: number): void {
    const actionId = this.ids.actions.find((entry) => entry.name === tile.name)?.id;
    if (actionId === undefined) throw new EntryProblem(PackBindingCode.TILE_REJECTED);
    const tiles: SlotTiles = { parameters: [], modifiers: [] };
    const items = (tile.grammar ?? []).map((node) => this.nodeSpec(pack, tile.name, node, tiles));
    const callDef = mkCallDef(bag(...items));
    const outputs: ActionOutputSpec[] = tile.outputs.map((output) => ({
      name: output.name,
      type: this.typeOf(output.type),
    }));
    const consumesWhenResult = tile.consumesWhenResult === undefined ? undefined : this.typeOf(tile.consumesWhenResult);
    const metadata: ITileMetadata = {
      label: tile.label ?? tile.name,
      ...(tile.docs === undefined ? {} : { docsMarkdown: tile.docs }),
    };
    const common = {
      key: tile.name,
      actionId,
      fnId,
      callDef,
      metadata,
      ...(consumesWhenResult === undefined ? {} : { consumesWhenResult }),
      ...(outputs.length === 0 ? {} : { outputs }),
    };
    if (tile.kind === "sensor") {
      const outputType = tile.returns === undefined ? CoreTypeIds.Void : this.typeOf(tile.returns);
      const definition = tile.async
        ? createHostSensor({ ...common, outputType, isAsync: true, fn: inertAsync(NIL_VALUE) })
        : createHostSensor({ ...common, outputType, fn: inertSync(NIL_VALUE) });
      this.registerSlotTiles(tiles);
      this.api.registerHostSensor(definition);
    } else {
      const definition = tile.async
        ? createHostActuator({ ...common, isAsync: true, fn: inertAsync(VOID_VALUE) })
        : createHostActuator({ ...common, fn: inertSync(VOID_VALUE) });
      this.registerSlotTiles(tiles);
      this.api.registerHostActuator(definition);
    }
  }

  /** Registers each slot tile in `tiles` the environment does not hold yet. */
  private registerSlotTiles(tiles: SlotTiles): void {
    const catalog = this.api.brainServices.edit.tiles;
    for (const parameter of tiles.parameters) {
      if (parameter.id.startsWith(SHARED_PARAMETER_PREFIX)) {
        this.sharedParameters.set(parameter.id, parameter.dataType);
      }
      const tile = new BrainTileParameterDef(parameter.id, parameter.dataType, {
        hidden: parameter.hidden,
        metadata: { label: parameter.label },
        ...(parameter.userArg === undefined ? {} : { userArg: parameter.userArg }),
        ...(parameter.anonType === undefined ? {} : { anonType: parameter.anonType }),
      });
      if (!catalog.has(tile.tileId)) this.api.registerTile(tile);
    }
    for (const modifier of tiles.modifiers) {
      const tile = new BrainTileModifierDef(modifier.id, {
        metadata: { label: modifier.label },
        ...(modifier.userArg === undefined ? {} : { userArg: modifier.userArg }),
      });
      if (!catalog.has(tile.tileId)) this.api.registerTile(tile);
    }
  }

  /** Registers `operator` as an operator of its own under its allocated host-function id, with its operator tile. */
  private bindOperator(operator: CatalogOperator): void {
    const fnId = this.ids.operators.find((entry) => entry.name === operator.name)?.id;
    if (fnId === undefined) throw new EntryProblem(PackBindingCode.TILE_REJECTED);
    const arity = operator.operands.length;
    if ((arity !== 1 && arity !== 2) || operator.returns === undefined) {
      throw new EntryProblem(PackBindingCode.OPERATOR_SHAPE_UNSUPPORTED);
    }
    const argTypes = operator.operands.map((operand) => this.typeOf(operand));
    const resultType = this.typeOf(operator.returns);
    const fn = operator.async ? inertAsync(NIL_VALUE) : inertSync(NIL_VALUE);
    this.api.registerOperator({
      spec: { id: operator.name, parse: arity === 1 ? PREFIX_OPERATOR_PARSE : INFIX_OPERATOR_PARSE },
      overloads: [{ argTypes, resultType, fnId, fn, isAsync: operator.async }],
    });
    this.api.registerTile(
      new BrainTileOperatorDef(
        operator.name,
        { placement: TilePlacement.EitherSide, metadata: { label: operator.name } },
        this.api.brainServices
      )
    );
  }
}

/** A synchronous host body that returns `result` and has no other effect. */
function inertSync(result: Value): HostSyncFn {
  return { exec: () => result };
}

/** An asynchronous host body that settles its handle with `result` immediately and has no other effect. */
function inertAsync(result: Value): HostAsyncFn {
  return {
    exec: (_ctx, _args, handle) => {
      handle.resolve(result);
    },
  };
}

/**
 * The module binding `packs` -- every struct type, tile and operator a
 * session catalog's packs declare -- into an environment, under the ids
 * `ids` allocates; `ids` must allocate every name the packs declare. Pack
 * actions run nothing in the editor: a sensor reads nil and an actuator does
 * nothing. Each entry the language model cannot take is passed to `report`
 * and left out; installing the module never throws on catalog content.
 *
 * @param packs - The catalog's packs, read.
 * @param ids - The allocation the entries are bound under.
 * @param report - Receives each problem found binding an entry, in catalog order.
 */
export function packModule(
  packs: readonly CatalogPack[],
  ids: MakeCodeIdManifest,
  report: (problem: PackBindingProblem) => void
): WendooModule {
  return {
    id: "makecode-packs",
    install(api) {
      new PackBinder(api, ids, report).bind(packs);
    },
  };
}
