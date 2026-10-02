import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IBrainTileDef, WendooEnvironment } from "@wendoo/core/app";
import {
  BrainDef,
  BrainTileLiteralDef,
  CoreHostActions,
  CoreTypeIds,
  mkActuatorTileId,
  mkModifierTileId,
  mkOperatorTileId,
  mkParameterTileId,
  mkSensorTileId,
} from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import type { StructTypeDef } from "@wendoo/core/runtime";
import { mkPrivateArgId, Op } from "@wendoo/core/runtime";
import type { MakeCodeIdManifest } from "@wendoo/makecode-session";
import { buildAuthoringEnvironment, CATALOG_PACK_UNBOUND, PackBindingCode } from "./authoring-environment.js";
import { CATALOG_UNREADABLE, CatalogProblemCode, parseCatalog } from "./catalog.js";
import { allocateIds, emptyIdManifest } from "./id-allocation.js";

/**
 * A catalog in the VM extension serializer's grammar: a type whose fields
 * are declared in another order than allocated, a sensor, an actuator with
 * private and shared slots, a tile one shared parameter tile fills twice, an
 * operator, and a second pack with an anonymous slot of the first pack's type.
 */
const PACK_CATALOG = JSON.stringify({
  packs: [
    {
      name: "beacon",
      types: [
        {
          name: "Beacon",
          native: true,
          fields: [
            { name: "y", type: "number" },
            { name: "x", type: "number", readOnly: true },
          ],
        },
      ],
      tiles: [
        {
          name: "sensor.beacon.reading",
          kind: "sensor",
          returns: "string",
          label: "beacon reading",
          docs: "# Reading",
        },
        {
          name: "actuator.beacon.ring",
          kind: "actuator",
          args: [
            { tileId: "times", type: "number", optional: true },
            { tileId: "loudly", modifier: true, optional: true },
            { tileId: "parameter.beacon.pitch", type: "number", optional: true, default: { t: 3, v: 2 } },
          ],
        },
        {
          name: "actuator.beacon.travel",
          kind: "actuator",
          call: [
            {
              kind: "seq",
              items: [
                { kind: "arg", name: "from", tileId: "parameter.beacon.place", type: "number" },
                { kind: "arg", name: "to", tileId: "parameter.beacon.place", type: "number" },
              ],
            },
          ],
        },
      ],
      operators: [{ name: "beacon.combine", operands: ["Beacon", "Beacon"], returns: "Beacon" }],
    },
    {
      name: "motion",
      tiles: [
        {
          name: "actuator.motion.face",
          kind: "actuator",
          args: [{ tileId: "toward", type: "Beacon", anonymous: true, optional: true }],
          consumesWhenResult: "number",
        },
      ],
    },
  ],
});

/** The project's manifest for {@link PACK_CATALOG}, allocated when the type declared x before y. */
const PACK_MANIFEST: MakeCodeIdManifest = {
  actions: [
    { name: "sensor.beacon.reading", id: 1030 },
    { name: "actuator.beacon.ring", id: 1031 },
    { name: "actuator.beacon.travel", id: 1032 },
    { name: "actuator.motion.face", id: 1033 },
  ],
  operators: [{ name: "beacon.combine", id: 1040 }],
  types: [{ name: "Beacon", atom: 1050, fields: ["x", "retired", "y"] }],
  next: { action: 1034, operator: 1041, atom: 1051 },
};

/** Whether any of `environment`'s tile catalogs holds the tile `tileId`. */
function hasTile(environment: WendooEnvironment, tileId: string): boolean {
  return environment.tileCatalogs().some((catalog) => catalog.has(tileId));
}

/** The tile `tileId` from `environment`'s catalogs. Fails the spec when none holds it. */
function tile(environment: WendooEnvironment, tileId: string): IBrainTileDef {
  for (const catalog of environment.tileCatalogs()) {
    const found = catalog.get(tileId);
    if (found !== undefined) return found;
  }
  assert.fail(`no tile ${tileId}`);
}

/** Asserts `environment` carries the core vocabulary a brain is authored from. */
function assertCoreVocabulary(environment: WendooEnvironment): void {
  assert.ok(hasTile(environment, mkSensorTileId(CoreHostActions.OnPageEntered.key)));
  assert.ok(hasTile(environment, mkActuatorTileId(CoreHostActions.SwitchPage.key)));
}

/** A one-rule brain whose DO side is `tiles`, compiled in `environment`; returns the actions its program dispatches by id. */
function compiledActionIds(environment: WendooEnvironment, tiles: (brain: BrainDef) => IBrainTileDef[]): number[] {
  const brainDef = BrainDef.emptyBrainDef(environment.brainServices, "test");
  const page = brainDef.pages().get(0)! as BrainPageDef;
  const rule = page.children().get(0)! as BrainRuleDef;
  for (const placed of tiles(brainDef)) rule.do().appendTile(placed);
  const built = environment.linkBrain(brainDef);
  assert.deepEqual(
    built.diagnostics.toArray().map((diagnostic) => diagnostic.message),
    [],
    "the brain compiles clean"
  );
  const ids: number[] = [];
  const functions = built.program!.program.functions;
  for (let f = 0; f < functions.size(); f++) {
    const code = functions.get(f)!.code;
    for (let i = 0; i < code.size(); i++) {
      const ins = code.get(i)!;
      if (ins.op === Op.HOST_ACTION_CALL || ins.op === Op.HOST_ACTION_CALL_ASYNC) ids.push(ins.a!);
    }
  }
  return ids;
}

/** A number literal registered in `brainDef`'s catalog. */
function numberLiteral(environment: WendooEnvironment, brainDef: BrainDef, value: number): IBrainTileDef {
  const literal = new BrainTileLiteralDef(CoreTypeIds.Number, value, {}, environment.brainServices);
  brainDef.catalog().registerTileDef(literal);
  return literal;
}

describe("buildAuthoringEnvironment", () => {
  it("builds the core vocabulary environment when no catalog has arrived", () => {
    const built = buildAuthoringEnvironment(undefined, undefined);

    assertCoreVocabulary(built.environment);
    assert.deepEqual(built.diagnostics, []);
  });

  it("leaves every pack unbound while no allocation is held, keeping the core vocabulary", () => {
    const built = buildAuthoringEnvironment(PACK_CATALOG, undefined);

    assertCoreVocabulary(built.environment);
    assert.equal(hasTile(built.environment, mkSensorTileId("sensor.beacon.reading")), false);
    assert.deepEqual(built.diagnostics, [
      { code: CATALOG_PACK_UNBOUND, pack: "beacon" },
      { code: CATALOG_PACK_UNBOUND, pack: "motion" },
    ]);
  });

  it("binds every pack's tiles with the allocation's action ids, as host sensors and actuators", () => {
    const built = buildAuthoringEnvironment(PACK_CATALOG, PACK_MANIFEST);
    const { environment } = built;

    assertCoreVocabulary(environment);
    assert.deepEqual(built.diagnostics, []);
    const reading = tile(environment, mkSensorTileId("sensor.beacon.reading"));
    assert.equal(reading.metadata?.label, "beacon reading");
    assert.equal(reading.metadata?.docsMarkdown, "# Reading");
    assert.ok(hasTile(environment, mkActuatorTileId("actuator.beacon.ring")));
    assert.ok(hasTile(environment, mkActuatorTileId("actuator.motion.face")));
    assert.equal(actionIdOf(environment, "sensor.beacon.reading"), 1030);
    assert.equal(actionIdOf(environment, "actuator.motion.face"), 1033);
  });

  it("makes a private slot's tile scoped by its pack and tile, a shared one unscoped, an anonymous one by its type", () => {
    const { environment } = buildAuthoringEnvironment(PACK_CATALOG, PACK_MANIFEST);

    assert.ok(hasTile(environment, mkParameterTileId(mkPrivateArgId("beacon", "actuator.beacon.ring", "times"))));
    assert.ok(hasTile(environment, mkModifierTileId(mkPrivateArgId("beacon", "actuator.beacon.ring", "loudly"))));
    assert.ok(hasTile(environment, mkParameterTileId("parameter.beacon.pitch")));
    assert.ok(hasTile(environment, mkParameterTileId("parameter.beacon.place")));
    assert.ok(hasTile(environment, mkParameterTileId("anon.Beacon")));
  });

  it("registers a struct type under the allocation's atom, its layout taken from the allocation, never declaration order", () => {
    const { environment } = buildAuthoringEnvironment(PACK_CATALOG, PACK_MANIFEST);
    const types = environment.brainServices.runtime.types;

    const beacon = types.get(types.resolveByName("Beacon")!) as StructTypeDef;
    assert.equal(beacon.atomId, 1050);
    assert.deepEqual(
      beacon.fields.toArray().map((field) => [field.name, field.fieldIndex, field.readOnly === true]),
      [
        ["y", 2, false],
        ["x", 0, true],
      ]
    );
  });

  it("registers each operator under the allocation's host-function id, with its operator tile", () => {
    const { environment } = buildAuthoringEnvironment(PACK_CATALOG, PACK_MANIFEST);

    assert.ok(hasTile(environment, mkOperatorTileId("beacon.combine")));
    assert.ok(environment.brainServices.runtime.functions.getSyncById(1040) !== undefined);
  });

  it("compiles a brain placing a pack tile to a dispatch of the tile's allocated action id", () => {
    const { environment } = buildAuthoringEnvironment(PACK_CATALOG, PACK_MANIFEST);

    const ids = compiledActionIds(environment, (brainDef) => [
      tile(environment, mkActuatorTileId("actuator.beacon.ring")),
      tile(environment, mkParameterTileId(mkPrivateArgId("beacon", "actuator.beacon.ring", "times"))),
      numberLiteral(environment, brainDef, 3),
      tile(environment, mkModifierTileId(mkPrivateArgId("beacon", "actuator.beacon.ring", "loudly"))),
    ]);

    assert.deepEqual(ids, [1031]);
  });

  it("compiles one shared tile filling two named slots", () => {
    const { environment } = buildAuthoringEnvironment(PACK_CATALOG, PACK_MANIFEST);
    const place = tile(environment, mkParameterTileId("parameter.beacon.place"));

    const ids = compiledActionIds(environment, (brainDef) => [
      tile(environment, mkActuatorTileId("actuator.beacon.travel")),
      place,
      numberLiteral(environment, brainDef, 1),
      place,
      numberLiteral(environment, brainDef, 2),
    ]);

    assert.deepEqual(ids, [1032]);
  });

  it("allocates for names the held allocation lacks before binding, so a newer catalog still binds whole", () => {
    const { environment, diagnostics } = buildAuthoringEnvironment(PACK_CATALOG, emptyIdManifest());

    assert.deepEqual(diagnostics, []);
    assert.equal(
      actionIdOf(environment, "actuator.motion.face"),
      allocateIds(emptyIdManifest(), parseCatalog(PACK_CATALOG)).actions.find(
        (entry) => entry.name === "actuator.motion.face"
      )?.id
    );
  });

  it("reports the catalog's problems by stable code, binding the rest of the pack", () => {
    const text = JSON.stringify({
      packs: [
        {
          name: "motion",
          tiles: [
            { name: "move", kind: "actutor" },
            { name: "stop", kind: "actuator" },
          ],
        },
      ],
    });

    const built = buildAuthoringEnvironment(text, emptyIdManifest());

    assert.deepEqual(built.diagnostics, [
      { code: CatalogProblemCode.TILE_KIND_UNKNOWN, pack: "motion", name: "move", token: "actutor" },
    ]);
    assert.ok(hasTile(built.environment, mkActuatorTileId("stop")));
    assert.equal(hasTile(built.environment, mkActuatorTileId("move")), false);
  });

  it("diagnoses a type reference naming no type, skipping the entry", () => {
    const text = JSON.stringify({
      packs: [
        {
          name: "motion",
          types: [{ name: "Path", fields: [{ name: "via", type: "Waypoint" }] }],
          tiles: [
            { name: "aim", kind: "actuator", args: [{ tileId: "at", type: "Vec" }] },
            { name: "seek", kind: "sensor", returns: "Vec" },
            { name: "stop", kind: "actuator" },
          ],
          operators: [{ name: "add", operands: ["Vec", "number"], returns: "number" }],
        },
      ],
    });

    const built = buildAuthoringEnvironment(text, emptyIdManifest());

    assert.deepEqual(built.diagnostics, [
      { code: PackBindingCode.TYPE_UNKNOWN, pack: "motion", name: "Path", token: "Waypoint" },
      { code: PackBindingCode.TYPE_UNKNOWN, pack: "motion", name: "aim", token: "Vec" },
      { code: PackBindingCode.TYPE_UNKNOWN, pack: "motion", name: "seek", token: "Vec" },
      { code: PackBindingCode.TYPE_UNKNOWN, pack: "motion", name: "add", token: "Vec" },
    ]);
    assert.ok(hasTile(built.environment, mkActuatorTileId("stop")));
  });

  it("diagnoses a slot default that is not a tagged value", () => {
    const text = JSON.stringify({
      packs: [
        {
          name: "motion",
          tiles: [
            { name: "move", kind: "actuator", args: [{ tileId: "speed", type: "number", default: { t: "fast" } }] },
          ],
        },
      ],
    });

    assert.deepEqual(buildAuthoringEnvironment(text, emptyIdManifest()).diagnostics, [
      { code: PackBindingCode.DEFAULT_UNREADABLE, pack: "motion", name: "move" },
    ]);
  });

  it("diagnoses a shared parameter tile declared with another type, keeping the first declaration", () => {
    const text = JSON.stringify({
      packs: [
        {
          name: "motion",
          tiles: [
            { name: "move", kind: "actuator", args: [{ tileId: "parameter.speed", type: "number" }] },
            { name: "say", kind: "actuator", args: [{ tileId: "parameter.speed", type: "string" }] },
          ],
        },
      ],
    });

    const built = buildAuthoringEnvironment(text, emptyIdManifest());

    assert.deepEqual(built.diagnostics, [
      { code: PackBindingCode.SHARED_TILE_CONFLICT, pack: "motion", name: "say", token: "parameter.speed" },
    ]);
    assert.ok(hasTile(built.environment, mkActuatorTileId("move")));
    assert.equal(hasTile(built.environment, mkActuatorTileId("say")), false);
  });

  it("diagnoses an operator taking other than one or two operands", () => {
    const text = JSON.stringify({
      packs: [
        { name: "math", operators: [{ name: "clamp3", operands: ["number", "number", "number"], returns: "number" }] },
      ],
    });

    assert.deepEqual(buildAuthoringEnvironment(text, emptyIdManifest()).diagnostics, [
      { code: PackBindingCode.OPERATOR_SHAPE_UNSUPPORTED, pack: "math", name: "clamp3" },
    ]);
  });

  it("diagnoses a tile the language model refuses, keeping the environment", () => {
    const text = JSON.stringify({
      packs: [{ name: "motion", tiles: [{ name: CoreHostActions.Timeout.key, kind: "sensor", returns: "boolean" }] }],
    });

    const built = buildAuthoringEnvironment(text, emptyIdManifest());

    assertCoreVocabulary(built.environment);
    assert.deepEqual(built.diagnostics, [
      { code: PackBindingCode.TILE_REJECTED, pack: "motion", name: CoreHostActions.Timeout.key },
    ]);
  });

  it("reads a catalog declaring no packs as the core environment with no diagnostics", () => {
    const built = buildAuthoringEnvironment('{"packs":[]}', emptyIdManifest());

    assertCoreVocabulary(built.environment);
    assert.deepEqual(built.diagnostics, []);
  });

  it("reports unreadable catalog text by its stable code and still builds the core environment", () => {
    const built = buildAuthoringEnvironment("not a catalog", emptyIdManifest());

    assertCoreVocabulary(built.environment);
    assert.deepEqual(built.diagnostics, [{ code: CATALOG_UNREADABLE }]);
  });

  it("builds a fresh environment for every call", () => {
    assert.notEqual(
      buildAuthoringEnvironment(PACK_CATALOG, PACK_MANIFEST).environment,
      buildAuthoringEnvironment(PACK_CATALOG, PACK_MANIFEST).environment
    );
  });

  it("mints document ids from an entropy-seeded stream, so two environments mint different ids", () => {
    const first = BrainDef.emptyBrainDef(
      buildAuthoringEnvironment(undefined, undefined).environment.brainServices,
      "a"
    );
    const second = BrainDef.emptyBrainDef(
      buildAuthoringEnvironment(undefined, undefined).environment.brainServices,
      "a"
    );

    assert.notEqual(first.id(), second.id());
  });
});

/** The host-action id `environment` registers the action `key` under. Fails the spec when it registers none. */
function actionIdOf(environment: WendooEnvironment, key: string): number {
  const action = environment.brainServices.runtime.actions.getByKey(key);
  assert.ok(action?.binding === "host", `no host action ${key}`);
  return action.id;
}
