import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { List } from "@wendoo/core";
import type { IBrainTileDef } from "@wendoo/core/app";
import {
  BrainDef,
  BrainTileLiteralDef,
  CoreOpId,
  CoreTypeIds,
  mkActuatorTileId,
  mkOperatorTileId,
  mkSensorTileId,
} from "@wendoo/core/app";
import { mkAccessorTileId, RuleSide } from "@wendoo/core/brain";
import { ParseDiagCode } from "@wendoo/core/brain/compiler";
import { buildInsertionContext, suggestTiles } from "@wendoo/core/brain/language-service";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import type { BrainTileAccessorDef } from "@wendoo/core/brain/tiles";
import type { StructTypeDef } from "@wendoo/core/runtime";
import { mkTypeId, NativeType, Op } from "@wendoo/core/runtime";
import { catalogTile } from "../test-support/asset-catalog.js";
import type { AuthoringEnvironment } from "./authoring-environment.js";
import { buildAuthoringEnvironment } from "./authoring-environment.js";
import { parseCatalog } from "./catalog.js";
import { allocateIds, emptyIdManifest } from "./id-allocation.js";

/** The icon {@link ACCESSOR_CATALOG} carries on the `place` accessor. */
const PLACE_ICON = "data:image/svg+xml;base64,cGxhY2U=";

/** Name of the inline sensor whose result a brain may write a field through. */
const HERE = "sensor.lookout.here";

/** Name of the inline sensor whose result is a computed value. */
const THERE = "sensor.lookout.there";

/** Name of the actuator taking an optional number. */
const SAY = "actuator.lookout.say";

/** Type id of {@link ACCESSOR_CATALOG}'s `Spot` type. */
const SPOT_TYPE = mkTypeId(NativeType.Struct, "Spot");

/** Type id of {@link ACCESSOR_CATALOG}'s `Point` type. */
const POINT_TYPE = mkTypeId(NativeType.Struct, "Point");

/**
 * A catalog in the rendered form the simx publishes: a native `Spot` type
 * whose writable `place` field -- of the `Point` type declared after it --
 * carries an accessor with a label, docs and an icon, and whose read-only `id`
 * carries none; a `Point` type whose read-only `x` carries a labeled accessor
 * and whose read-only `y` an empty one; two inline sensors reading a `Spot`,
 * the first's result writable; and an actuator taking a number.
 */
const ACCESSOR_CATALOG = JSON.stringify({
  packs: [
    {
      name: "lookout",
      types: [
        {
          name: "Spot",
          native: true,
          fields: [
            { name: "place", type: "Point", accessor: { label: "place", docs: "# Place", iconUrl: PLACE_ICON } },
            { name: "id", type: "number", readOnly: true },
          ],
        },
        {
          name: "Point",
          fields: [
            { name: "x", type: "number", readOnly: true, accessor: { label: "x" } },
            { name: "y", type: "number", readOnly: true, accessor: {} },
          ],
        },
      ],
      tiles: [
        { name: HERE, kind: "sensor", inline: true, writableResult: true, returns: "Spot", label: "here" },
        { name: THERE, kind: "sensor", inline: true, returns: "Spot", label: "there" },
        {
          name: SAY,
          kind: "actuator",
          args: [{ tileId: "anon.number", type: "number", optional: true, anonymous: true }],
          label: "say",
        },
      ],
    },
  ],
});

/** A fresh environment binding {@link ACCESSOR_CATALOG} under the allocation a project holding none gets. */
function environment(): AuthoringEnvironment {
  return buildAuthoringEnvironment(ACCESSOR_CATALOG, allocateIds(emptyIdManifest(), parseCatalog(ACCESSOR_CATALOG)));
}

/** The accessor tile of the field `field` of the type `typeId` in `built`. Throws when none is bound. */
function accessor(built: AuthoringEnvironment, typeId: string, field: string): BrainTileAccessorDef {
  return catalogTile(built.environment, mkAccessorTileId(typeId, field)) as BrainTileAccessorDef;
}

/** The tiles `entries` name in `built`, in order: a sensor's name, a `Type.field` accessor, `=`, or a number. */
function tilesOf(built: AuthoringEnvironment, brain: BrainDef, entries: readonly (string | number)[]): IBrainTileDef[] {
  return entries.map((entry) => {
    if (typeof entry === "number") {
      const literal = new BrainTileLiteralDef(CoreTypeIds.Number, entry, {}, built.environment.brainServices);
      brain.catalog().registerTileDef(literal);
      return literal;
    }
    if (entry === "=") return catalogTile(built.environment, mkOperatorTileId(CoreOpId.Assign));
    if (entry === SAY) return catalogTile(built.environment, mkActuatorTileId(SAY));
    const dot = entry.indexOf(".");
    if (/^[A-Z]/.test(entry)) {
      return accessor(built, mkTypeId(NativeType.Struct, entry.slice(0, dot)), entry.slice(dot + 1));
    }
    return catalogTile(built.environment, mkSensorTileId(entry));
  });
}

/** A one-rule brain in `built` whose DO side holds the tiles `entries` names, and its rule. */
function brainDoing(built: AuthoringEnvironment, entries: readonly (string | number)[]) {
  const brain = BrainDef.emptyBrainDef(built.environment.brainServices, "lookout");
  const rule = (brain.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
  for (const tile of tilesOf(built, brain, entries)) rule.do().appendTile(tile);
  return { brain, rule };
}

/** The stable codes compiling a one-rule brain whose DO side holds the tiles `entries` names reports, and its opcodes. */
function compiled(built: AuthoringEnvironment, entries: readonly (string | number)[]) {
  const { brain } = brainDoing(built, entries);
  const linked = built.environment.linkBrain(brain);
  const ops: number[] = [];
  const functions = linked.program?.program.functions;
  for (let f = 0; functions !== undefined && f < functions.size(); f++) {
    const code = functions.get(f)!.code;
    for (let i = 0; i < code.size(); i++) ops.push(code.get(i)!.op);
  }
  return { codes: linked.diagnostics.toArray().map((diagnostic) => diagnostic.code), ops };
}

/** Whether the suggestion oracle offers `tileId` at the end of a DO side holding the tiles `entries` names. */
function offeredAfter(built: AuthoringEnvironment, entries: readonly (string | number)[], tileId: string): boolean {
  const { rule } = brainDoing(built, entries);
  const tileSet = rule.do();
  const context = buildInsertionContext({
    side: RuleSide.Do,
    expr: tileSet.expr(),
    ruleDef: rule,
    existingTiles: tileSet.tiles(),
  });
  const result = suggestTiles(context, List.from(built.environment.tileCatalogs()), built.environment.brainServices);
  const has = (suggestions: typeof result.exact) =>
    suggestions.findIndex((suggestion) => suggestion.tileDef.tileId === tileId) !== -1;
  return has(result.exact) || has(result.withConversion);
}

describe("pack type accessors", () => {
  it("binds a field's accessor as an accessor tile carrying the label, docs and icon its catalog entry carries", () => {
    const built = environment();

    const place = accessor(built, SPOT_TYPE, "place");

    assert.deepEqual(built.diagnostics, []);
    assert.equal(place.kind, "accessor");
    assert.equal(place.fieldTypeId, POINT_TYPE);
    assert.equal(place.readOnly, false);
    assert.equal(place.metadata?.label, "place");
    assert.equal(place.metadata?.docsMarkdown, "# Place");
    assert.equal(place.metadata?.iconUrl, PLACE_ICON);
  });

  it("makes a read-only field's accessor read-only, labels an unlabeled accessor by its field, and binds none for a field without one", () => {
    const built = environment();

    assert.equal(accessor(built, POINT_TYPE, "x").readOnly, true);
    assert.equal(accessor(built, POINT_TYPE, "x").metadata?.label, "x");
    assert.equal(accessor(built, POINT_TYPE, "y").metadata?.label, "y");
    assert.equal(accessor(built, POINT_TYPE, "y").metadata?.iconUrl, undefined);
    assert.throws(() => accessor(built, SPOT_TYPE, "id"));
  });

  it("binds a type whose field is of a type declared after it", () => {
    const built = environment();
    const types = built.environment.brainServices.runtime.types;

    const spot = types.get(SPOT_TYPE) as StructTypeDef | undefined;

    assert.deepEqual(built.diagnostics, []);
    assert.deepEqual(
      spot?.fields.toArray().map((field) => [field.name, field.typeId]),
      [
        ["place", POINT_TYPE],
        ["id", CoreTypeIds.Number],
      ]
    );
  });

  it("reads a chain of accessors after an inline sensor as a value filling a slot", () => {
    assert.deepEqual(compiled(environment(), [SAY, HERE, "Spot.place", "Point.x"]).codes, []);
  });

  it("offers a type's accessors after an inline sensor reading the type", () => {
    const built = environment();

    assert.ok(offeredAfter(built, [HERE], mkAccessorTileId(SPOT_TYPE, "place")));
    assert.ok(offeredAfter(built, [HERE, "Spot.place"], mkAccessorTileId(POINT_TYPE, "x")));
  });

  it("assigns a writable field through a writable inline sensor's result, by field id", () => {
    const { codes, ops } = compiled(environment(), [HERE, "Spot.place", "=", THERE, "Spot.place"]);

    assert.deepEqual(codes, []);
    assert.ok(ops.includes(Op.STRUCT_SET_FIELD));
  });

  it("refuses an assignment through a sensor result not declared writable, and to a read-only field", () => {
    const built = environment();

    assert.ok(
      compiled(built, [THERE, "Spot.place", "=", HERE, "Spot.place"]).codes.includes(
        ParseDiagCode.ReadOnlyResultFieldAssignment
      )
    );
    assert.ok(
      compiled(built, [HERE, "Spot.place", "Point.x", "=", 3]).codes.includes(ParseDiagCode.ReadOnlyFieldAssignment)
    );
  });
});
