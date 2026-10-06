import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IBrainTileDef, WendooEnvironment } from "@wendoo/core/app";
import {
  BrainDef,
  BrainTileLiteralDef,
  CoreHostActions,
  CoreOpId,
  CoreTypeIds,
  getCatalogFallbackLabel,
  mkActuatorTileId,
  mkLiteralTileId,
  mkModifierTileId,
  mkOperatorTileId,
  mkParameterTileId,
  mkSensorTileId,
} from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import type { StructTypeDef } from "@wendoo/core/runtime";
import { mkPrivateArgId, mkTypeId, NativeType, Op } from "@wendoo/core/runtime";
import type { MakeCodeIdManifest } from "@wendoo/makecode-session";
import {
  ASSET_CATALOG,
  assetCatalogIds,
  BLANK_ICON,
  NEAR,
  SHOW,
  SHOW_ICON,
  SPOT,
  SPOT_ICON,
} from "../test-support/asset-catalog.js";
import { projectedSentence } from "../test-support/sentence-projection.js";
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

/** The display labels {@link LABELED_CATALOG}'s slots carry, keyed by slot. */
const SLOT_LABELS = {
  times: "times rung",
  loudly: "nice and loud",
  hush: "very softly",
  pitch: "bell pitch",
  toward: "facing",
} as const;

/** The fragment of {@link LABELED_CATALOG}'s one unlabeled slot, whose tile's label falls back to the fragment's last segment. */
const UNLABELED_FRAGMENT = "beat.count";

/**
 * A catalog whose slots carry display labels: on a private parameter, a
 * private modifier, a shared modifier and a shared parameter in flat form,
 * and on an anonymous slot in a call tree; one slot carries none. A second
 * tile declares the shared modifier again, unlabeled.
 */
const LABELED_CATALOG = JSON.stringify({
  packs: [
    {
      name: "bell",
      types: [{ name: "Bell" }],
      tiles: [
        {
          name: "actuator.bell.ring",
          kind: "actuator",
          args: [
            { tileId: "times", type: "number", optional: true, label: SLOT_LABELS.times },
            { tileId: "loudly", modifier: true, optional: true, label: SLOT_LABELS.loudly },
            { tileId: "modifier.bell.hush", modifier: true, optional: true, label: SLOT_LABELS.hush },
            { tileId: "parameter.bell.pitch", type: "number", optional: true, label: SLOT_LABELS.pitch },
            { tileId: UNLABELED_FRAGMENT, type: "number", optional: true },
          ],
        },
        {
          name: "actuator.bell.face",
          kind: "actuator",
          call: [
            {
              kind: "optional",
              item: { kind: "arg", tileId: "toward", type: "Bell", anonymous: true, label: SLOT_LABELS.toward },
            },
          ],
        },
        {
          name: "actuator.bell.toll",
          kind: "actuator",
          args: [{ tileId: "modifier.bell.hush", modifier: true, optional: true }],
        },
      ],
    },
  ],
});

/** Sentence words {@link WORDED_CATALOG} declares, keyed by what declares them. */
const WORDS = {
  spot: { form: "spot", frame: "state", bare: "a lion" },
  lion: { form: "a lion" },
  pounce: { form: "pounce on" },
} as const;

/**
 * A catalog whose tiles and modifier slots carry sentence words: a sensor
 * declaring every word and a shared modifier declaring a form, an actuator
 * declaring a form, and a second tile declaring the shared modifier again
 * with no words.
 */
const WORDED_CATALOG = JSON.stringify({
  packs: [
    {
      name: "zoo",
      tiles: [
        {
          name: "sensor.zoo.spot",
          kind: "sensor",
          args: [{ tileId: "modifier.zoo.lion", modifier: true, optional: true, language: WORDS.lion }],
          returns: "boolean",
          label: "spot",
          language: WORDS.spot,
        },
        { name: "actuator.zoo.pounce", kind: "actuator", label: "pounce", language: WORDS.pounce },
        {
          name: "actuator.zoo.watch",
          kind: "actuator",
          args: [{ tileId: "modifier.zoo.lion", modifier: true, optional: true }],
        },
      ],
    },
  ],
});

/** Icons the core tile icon catalog's entries carry, each a distinct data URI. */
const CORE_ICONS = {
  beaconAnd: "data:image/svg+xml;base64,YmVhY29uLWFuZA==",
  beaconTrue: "data:image/svg+xml;base64,YmVhY29uLXRydWU=",
  beaconAndAgain: "data:image/svg+xml;base64,YWdhaW4=",
  beaconUnbound: "data:image/svg+xml;base64,dW5ib3VuZA==",
  beaconReading: "data:image/svg+xml;base64,cmVhZGluZw==",
  beaconOverReading: "data:image/svg+xml;base64,b3Zlcg==",
  chimeAnd: "data:image/svg+xml;base64,Y2hpbWUtYW5k",
  chimeOr: "data:image/svg+xml;base64,Y2hpbWUtb3I=",
};

/** A tile id no environment holds. */
const UNBOUND_CORE_TILE_ID = mkOperatorTileId("no-such-operator");

/**
 * A catalog in the rendered form the simx publishes whose packs give core
 * tiles icons: the AND tile twice in the first pack and once in the second,
 * the true literal, a tile id no environment holds, and the first pack's own
 * sensor, which carries an icon of its own; the second pack also gives the OR
 * tile one.
 */
const CORE_ICON_CATALOG = JSON.stringify({
  packs: [
    {
      name: "beacon",
      tiles: [{ name: "sensor.beacon.reading", kind: "sensor", returns: "string", iconUrl: CORE_ICONS.beaconReading }],
      coreTileIcons: [
        { tileId: mkOperatorTileId(CoreOpId.And), iconUrl: CORE_ICONS.beaconAnd },
        { tileId: mkLiteralTileId(CoreTypeIds.Boolean, "true"), iconUrl: CORE_ICONS.beaconTrue },
        { tileId: mkOperatorTileId(CoreOpId.And), iconUrl: CORE_ICONS.beaconAndAgain },
        { tileId: UNBOUND_CORE_TILE_ID, iconUrl: CORE_ICONS.beaconUnbound },
        { tileId: mkSensorTileId("sensor.beacon.reading"), iconUrl: CORE_ICONS.beaconOverReading },
      ],
    },
    {
      name: "chime",
      coreTileIcons: [
        { tileId: mkOperatorTileId(CoreOpId.And), iconUrl: CORE_ICONS.chimeAnd },
        { tileId: mkOperatorTileId(CoreOpId.Or), iconUrl: CORE_ICONS.chimeOr },
      ],
    },
  ],
});

/** Icons the page icon catalog's packs give the page family, each a distinct data URI. */
const PAGE_ICONS = {
  beacon: "data:image/svg+xml;base64,YmVhY29uLXBhZ2U=",
  beaconAgain: "data:image/svg+xml;base64,YmVhY29uLXBhZ2UtYWdhaW4=",
  chime: "data:image/svg+xml;base64,Y2hpbWUtcGFnZQ==",
};

/**
 * A catalog in the rendered form the simx publishes whose packs give the
 * page family id an icon: twice in the first pack and once in the second.
 */
const PAGE_ICON_CATALOG = JSON.stringify({
  packs: [
    {
      name: "beacon",
      coreTileIcons: [
        { tileId: "tile.page", iconUrl: PAGE_ICONS.beacon },
        { tileId: "tile.page", iconUrl: PAGE_ICONS.beaconAgain },
      ],
    },
    { name: "chime", coreTileIcons: [{ tileId: "tile.page", iconUrl: PAGE_ICONS.chime }] },
  ],
});

/** Icons the type icon catalog's types carry, each a distinct data URI. */
const TYPE_ICONS = {
  bell: "data:image/svg+xml;base64,YmVsbA==",
  bellAgain: "data:image/svg+xml;base64,YmVsbC1hZ2Fpbg==",
  broken: "data:image/svg+xml;base64,YnJva2Vu",
};

/**
 * A catalog in the rendered form the simx publishes whose types carry icons:
 * `Bell` in the first pack and again in the second, `Broken`, whose field
 * names a type no pack declares, and `Plain`, carrying no icon.
 */
const TYPE_ICON_CATALOG = JSON.stringify({
  packs: [
    {
      name: "bells",
      types: [
        { name: "Bell", fields: [{ name: "pitch", type: "number" }], iconUrl: TYPE_ICONS.bell },
        { name: "Broken", fields: [{ name: "part", type: "Nowhere" }], iconUrl: TYPE_ICONS.broken },
        { name: "Plain", fields: [{ name: "n", type: "number" }] },
      ],
    },
    {
      name: "chimes",
      types: [{ name: "Bell", fields: [{ name: "pitch", type: "number" }], iconUrl: TYPE_ICONS.bellAgain }],
    },
  ],
});

/** Icons the core type icon catalog's packs give core types, each a distinct data URI. */
const CORE_TYPE_ICONS = {
  number: "data:image/svg+xml;base64,bnVtYmVy",
  numberAgain: "data:image/svg+xml;base64,bnVtYmVyLWFnYWlu",
  boolean: "data:image/svg+xml;base64,Ym9vbGVhbg==",
  notCore: "data:image/svg+xml;base64,bm90LWNvcmU=",
  bell: "data:image/svg+xml;base64,YmVsbA==",
};

/**
 * A catalog in the rendered form the simx publishes whose packs give core
 * types icons: the number type in the first pack and again in the second,
 * the boolean type, and a name that is no core type -- the first pack's own
 * `Bell` type, which carries an icon of its own.
 */
const CORE_TYPE_ICON_CATALOG = JSON.stringify({
  packs: [
    {
      name: "bells",
      types: [{ name: "Bell", fields: [{ name: "pitch", type: "number" }], iconUrl: CORE_TYPE_ICONS.bell }],
      coreTypeIcons: [
        { type: "number", iconUrl: CORE_TYPE_ICONS.number },
        { type: "Bell", iconUrl: CORE_TYPE_ICONS.notCore },
      ],
    },
    {
      name: "chimes",
      coreTypeIcons: [
        { type: "number", iconUrl: CORE_TYPE_ICONS.numberAgain },
        { type: "boolean", iconUrl: CORE_TYPE_ICONS.boolean },
      ],
    },
  ],
});

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

  it("labels each slot's tile with the label its slot carries", () => {
    const built = buildAuthoringEnvironment(LABELED_CATALOG, emptyIdManifest());
    const { environment } = built;
    const labelOf = (tileId: string) => tile(environment, tileId).metadata?.label;

    assert.deepEqual(built.diagnostics, []);
    assert.equal(labelOf(mkParameterTileId(mkPrivateArgId("bell", "actuator.bell.ring", "times"))), SLOT_LABELS.times);
    assert.equal(labelOf(mkModifierTileId(mkPrivateArgId("bell", "actuator.bell.ring", "loudly"))), SLOT_LABELS.loudly);
    assert.equal(labelOf(mkModifierTileId("modifier.bell.hush")), SLOT_LABELS.hush);
    assert.equal(labelOf(mkParameterTileId("parameter.bell.pitch")), SLOT_LABELS.pitch);
    assert.equal(labelOf(mkParameterTileId("anon.Bell")), SLOT_LABELS.toward);
  });

  it("labels an unlabeled slot's tile with its fragment's last segment", () => {
    const { environment } = buildAuthoringEnvironment(LABELED_CATALOG, emptyIdManifest());
    const tileId = mkParameterTileId(mkPrivateArgId("bell", "actuator.bell.ring", UNLABELED_FRAGMENT));

    assert.equal(
      tile(environment, tileId).metadata?.label,
      UNLABELED_FRAGMENT.slice(UNLABELED_FRAGMENT.lastIndexOf(".") + 1)
    );
  });

  it("keeps a shared slot tile's first declaration's label when a later tile declares it unlabeled", () => {
    const { environment } = buildAuthoringEnvironment(LABELED_CATALOG, emptyIdManifest());

    assert.ok(hasTile(environment, mkActuatorTileId("actuator.bell.toll")));
    assert.equal(tile(environment, mkModifierTileId("modifier.bell.hush")).metadata?.label, SLOT_LABELS.hush);
  });

  it("carries a tile's and a modifier slot's sentence words into the tile's metadata, verbatim", () => {
    const built = buildAuthoringEnvironment(WORDED_CATALOG, emptyIdManifest());
    const { environment } = built;
    const languageOf = (tileId: string) => tile(environment, tileId).metadata?.language;

    assert.deepEqual(built.diagnostics, []);
    assert.deepEqual(languageOf(mkSensorTileId("sensor.zoo.spot")), WORDS.spot);
    assert.deepEqual(languageOf(mkActuatorTileId("actuator.zoo.pounce")), WORDS.pounce);
    assert.deepEqual(languageOf(mkModifierTileId("modifier.zoo.lion")), WORDS.lion);
  });

  it("carries a tile's and a slot's icon into the tile's metadata, verbatim, and none where none is carried", () => {
    const built = buildAuthoringEnvironment(ASSET_CATALOG, assetCatalogIds());
    const { environment } = built;
    const iconOf = (tileId: string) => tile(environment, tileId).metadata?.iconUrl;

    assert.deepEqual(built.diagnostics, []);
    assert.equal(iconOf(mkSensorTileId(SPOT)), SPOT_ICON);
    assert.equal(iconOf(mkActuatorTileId(SHOW)), SHOW_ICON);
    assert.equal(iconOf(mkModifierTileId("modifier.gallery.blank")), BLANK_ICON);
    assert.equal(iconOf(mkSensorTileId(NEAR)), undefined);
  });

  it("gives each core tile a pack gives an icon that icon, keeping the core tile's label and sentence words", () => {
    const built = buildAuthoringEnvironment(CORE_ICON_CATALOG, emptyIdManifest());
    const and = tile(built.environment, mkOperatorTileId(CoreOpId.And));
    const or = tile(built.environment, mkOperatorTileId(CoreOpId.Or));

    assert.deepEqual(built.diagnostics, []);
    assert.deepEqual(and.metadata, { label: "AND", language: { form: "and" }, iconUrl: CORE_ICONS.beaconAnd });
    assert.deepEqual(or.metadata, { label: "OR", language: { form: "or" }, iconUrl: CORE_ICONS.chimeOr });
  });

  it("gives a core tile declaring no display metadata the icon alone, its label left to the tile's own reading", () => {
    const { environment } = buildAuthoringEnvironment(CORE_ICON_CATALOG, emptyIdManifest());
    const literal = tile(environment, mkLiteralTileId(CoreTypeIds.Boolean, "true"));

    assert.equal(literal.metadata?.iconUrl, CORE_ICONS.beaconTrue);
    assert.equal(literal.metadata?.label, getCatalogFallbackLabel(literal));
  });

  it("keeps the first icon given a core tile, across one pack's entries and across packs", () => {
    const { environment } = buildAuthoringEnvironment(CORE_ICON_CATALOG, emptyIdManifest());

    assert.equal(tile(environment, mkOperatorTileId(CoreOpId.And)).metadata?.iconUrl, CORE_ICONS.beaconAnd);
  });

  it("leaves an icon given a tile id the environment does not hold inert, minting no tile and diagnosing nothing", () => {
    const built = buildAuthoringEnvironment(CORE_ICON_CATALOG, emptyIdManifest());

    assert.equal(hasTile(built.environment, UNBOUND_CORE_TILE_ID), false);
    assert.deepEqual(built.diagnostics, []);
  });

  it("gives core tiles alone an icon, a pack's own tile keeping the icon its entry carries", () => {
    const { environment } = buildAuthoringEnvironment(CORE_ICON_CATALOG, emptyIdManifest());

    assert.equal(
      tile(environment, mkSensorTileId("sensor.beacon.reading")).metadata?.iconUrl,
      CORE_ICONS.beaconReading
    );
  });

  it("gives the core tiles of one environment icons without touching another environment's core tiles", () => {
    const iconed = buildAuthoringEnvironment(CORE_ICON_CATALOG, emptyIdManifest());
    const plain = buildAuthoringEnvironment(PACK_CATALOG, PACK_MANIFEST);

    assert.equal(tile(iconed.environment, mkOperatorTileId(CoreOpId.And)).metadata?.iconUrl, CORE_ICONS.beaconAnd);
    assert.equal(tile(plain.environment, mkOperatorTileId(CoreOpId.And)).metadata?.iconUrl, undefined);
  });

  it("binds the icon a pack gives the page family id as the page icon, the first given standing across packs, minting no tile and diagnosing nothing", () => {
    const built = buildAuthoringEnvironment(PAGE_ICON_CATALOG, emptyIdManifest());

    assert.equal(built.pageIcon, PAGE_ICONS.beacon);
    assert.equal(hasTile(built.environment, "tile.page"), false);
    assert.deepEqual(built.diagnostics, []);
  });

  it("binds no page icon while no pack gives the page family one, or while no allocation is held", () => {
    assert.equal(buildAuthoringEnvironment(CORE_ICON_CATALOG, emptyIdManifest()).pageIcon, undefined);
    assert.equal(buildAuthoringEnvironment(PAGE_ICON_CATALOG, undefined).pageIcon, undefined);
  });

  it("binds each bound type's icon to the type, the first declaration of a name standing, an unbound type's icon to nothing", () => {
    const { typeIcons } = buildAuthoringEnvironment(TYPE_ICON_CATALOG, emptyIdManifest());

    assert.deepEqual([...typeIcons], [[mkTypeId(NativeType.Struct, "Bell"), TYPE_ICONS.bell]]);
  });

  it("binds no type icon while no allocation is held", () => {
    assert.equal(buildAuthoringEnvironment(TYPE_ICON_CATALOG, undefined).typeIcons.size, 0);
  });

  it("binds each core type icon to the core type, the first icon given a type standing across packs", () => {
    const { typeIcons } = buildAuthoringEnvironment(CORE_TYPE_ICON_CATALOG, emptyIdManifest());

    assert.equal(typeIcons.get(CoreTypeIds.Number), CORE_TYPE_ICONS.number);
    assert.equal(typeIcons.get(CoreTypeIds.Boolean), CORE_TYPE_ICONS.boolean);
    assert.equal(typeIcons.has(CoreTypeIds.String), false);
  });

  it("reports a core type icon given a name that is no core type by stable code, leaving the declared type's own icon bound", () => {
    const built = buildAuthoringEnvironment(CORE_TYPE_ICON_CATALOG, emptyIdManifest());

    assert.deepEqual(built.diagnostics, [{ code: PackBindingCode.CORE_TYPE_UNKNOWN, pack: "bells", name: "Bell" }]);
    assert.equal(built.typeIcons.get(mkTypeId(NativeType.Struct, "Bell")), CORE_TYPE_ICONS.bell);
  });

  it("binds no core type icon and reports none while no allocation is held", () => {
    const built = buildAuthoringEnvironment(CORE_TYPE_ICON_CATALOG, undefined);

    assert.equal(built.typeIcons.size, 0);
    assert.equal(
      built.diagnostics.some((diagnostic) => diagnostic.code === PackBindingCode.CORE_TYPE_UNKNOWN),
      false
    );
  });

  it("gives a tile and a slot tile declaring no sentence words none", () => {
    const { environment } = buildAuthoringEnvironment(PACK_CATALOG, PACK_MANIFEST);
    const languageOf = (tileId: string) => tile(environment, tileId).metadata?.language;

    assert.equal(languageOf(mkSensorTileId("sensor.beacon.reading")), undefined);
    assert.equal(languageOf(mkModifierTileId(mkPrivateArgId("beacon", "actuator.beacon.ring", "loudly"))), undefined);
    assert.equal(languageOf(mkParameterTileId("parameter.beacon.pitch")), undefined);
  });

  it("keeps a shared modifier tile's first declaration's sentence words when a later tile declares it with none", () => {
    const { environment } = buildAuthoringEnvironment(WORDED_CATALOG, emptyIdManifest());

    assert.ok(hasTile(environment, mkActuatorTileId("actuator.zoo.watch")));
    assert.deepEqual(tile(environment, mkModifierTileId("modifier.zoo.lion")).metadata?.language, WORDS.lion);
  });

  it("projects a worded sensor heading a WHEN side through its frame, with its form, then its bare word or its modifier's form", () => {
    const { environment } = buildAuthoringEnvironment(WORDED_CATALOG, emptyIdManifest());
    const spot = tile(environment, mkSensorTileId("sensor.zoo.spot"));
    const lion = tile(environment, mkModifierTileId("modifier.zoo.lion"));
    const ruleOf = (whenTiles: IBrainTileDef[]) => {
      const brainDef = BrainDef.emptyBrainDef(environment.brainServices, "test");
      const rule = (brainDef.pages().get(0)! as BrainPageDef).children().get(0)! as BrainRuleDef;
      for (const placed of whenTiles) rule.when().appendTile(placed);
      return rule;
    };

    assert.deepEqual(projectedSentence(ruleOf([spot])), {
      frame: WORDS.spot.frame,
      words: [
        { text: WORDS.spot.form, sourceTileIndex: 0 },
        { text: WORDS.spot.bare, sourceTileIndex: 0 },
      ],
    });
    assert.deepEqual(projectedSentence(ruleOf([spot, lion])), {
      frame: WORDS.spot.frame,
      words: [
        { text: WORDS.spot.form, sourceTileIndex: 0 },
        { text: WORDS.lion.form, sourceTileIndex: 1 },
      ],
    });
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
