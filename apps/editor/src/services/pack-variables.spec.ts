import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { List, stream } from "@wendoo/core";
import type { IBrainTileDef } from "@wendoo/core/app";
import { BrainDef, CoreOpId, mkOperatorTileId, mkSensorTileId, mkVariableFactoryTileId } from "@wendoo/core/app";
import { RuleSide } from "@wendoo/core/brain";
import { buildInsertionContext, suggestTiles } from "@wendoo/core/brain/language-service";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import type { BrainTileFactoryDef, BrainTileVariableDef } from "@wendoo/core/brain/tiles";
import {
  linkedBrainProgramFromBytes,
  mkTypeId,
  NativeType,
  NO_VARIABLE_INIT,
  variableInitAt,
} from "@wendoo/core/runtime";
import { buildBrainEditorConfig } from "../brain/editor-config.js";
import { catalogTile } from "../test-support/asset-catalog.js";
import {
  type AuthoringEnvironment,
  buildAuthoringEnvironment,
  MAKECODE_VM_PRECISION,
} from "./authoring-environment.js";
import { compileBrainSource, serializeBrainSource } from "./brain-source.js";
import { parseCatalog } from "./catalog.js";
import { emptyIdManifest } from "./id-allocation.js";

/** Name of the inline sensor reading a `Spot`. */
const HERE = "sensor.lookout.here";

/** Type id of {@link VARIABLE_CATALOG}'s `Spot` type. */
const SPOT_TYPE = mkTypeId(NativeType.Struct, "Spot");

/** Type id of {@link VARIABLE_CATALOG}'s `Point` type. */
const POINT_TYPE = mkTypeId(NativeType.Struct, "Point");

/** Type id of {@link VARIABLE_CATALOG}'s `Plain` type. */
const PLAIN_TYPE = mkTypeId(NativeType.Struct, "Plain");

/**
 * A catalog in the rendered form the simx publishes: a native `Spot` type
 * brains may hold variables of, carrying a label, an icon and docs; a `Point`
 * type brains may hold variables of, carrying none of them; a `Plain` type carrying no
 * variable factory flag; and an inline sensor reading a `Spot`.
 */
const VARIABLE_CATALOG = JSON.stringify({
  packs: [
    {
      name: "lookout",
      types: [
        {
          name: "Spot",
          native: true,
          variableFactory: true,
          fields: [{ name: "place", type: "Point" }],
          label: "spot",
          docs: "# Spot",
          iconUrl: "data:image/svg+xml;base64,c3BvdA==",
        },
        { name: "Point", variableFactory: true, fields: [{ name: "x", type: "number", readOnly: true }] },
        { name: "Plain", fields: [{ name: "x", type: "number" }] },
      ],
      tiles: [{ name: HERE, kind: "sensor", inline: true, returns: "Spot", label: "here" }],
    },
  ],
});

/** The catalog entry of {@link VARIABLE_CATALOG}'s type named `name`. */
function carriedType(name: string) {
  const type = parseCatalog(VARIABLE_CATALOG).packs[0]?.types.find((entry) => entry.name === name);
  if (type === undefined) throw new Error(`no type ${name}`);
  return type;
}

/** A fresh environment binding {@link VARIABLE_CATALOG}. */
function bound(): AuthoringEnvironment {
  return buildAuthoringEnvironment(VARIABLE_CATALOG, emptyIdManifest());
}

/** The variable factory `environment` binds for the type `typeId`, or `undefined` when it binds none. */
function factoryFor(environment: AuthoringEnvironment["environment"], typeId: string): BrainTileFactoryDef | undefined {
  return environment.brainServices.edit.tiles.get(mkVariableFactoryTileId(typeId)) as BrainTileFactoryDef | undefined;
}

/** The variable named `name` the variable factory of the type `typeId` mints, as the brain editor mints one. */
function minted(environment: AuthoringEnvironment["environment"], typeId: string, name: string): BrainTileVariableDef {
  const factory = factoryFor(environment, typeId);
  if (factory === undefined) throw new Error(`no variable factory for ${typeId}`);
  return factory.manufacture(factory, { name }) as BrainTileVariableDef;
}

/** The tile ids the candidate strip offers at the head of an empty DO side in `environment`. */
function offeredAtDoHead(environment: AuthoringEnvironment["environment"]): string[] {
  const brainDef = BrainDef.emptyBrainDef(environment.brainServices, "offer");
  const rule = (brainDef.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
  brainDef.typecheck();
  const context = buildInsertionContext({
    side: RuleSide.Do,
    expr: rule.do().expr(),
    ruleDef: rule,
    existingTiles: rule.do().tiles(),
  });
  const result = suggestTiles(context, List.from(environment.tileCatalogs()), environment.brainServices);
  return [...result.exact.toArray(), ...result.withConversion.toArray()].map((suggestion) => suggestion.tileDef.tileId);
}

describe("binding a catalog type's variable factory", () => {
  it("binds a variable factory for each type carrying the flag, minting variables of that type, and none for a type without it", () => {
    const { environment, diagnostics } = bound();

    assert.deepEqual(diagnostics, []);
    assert.equal(factoryFor(environment, SPOT_TYPE)?.producedDataType, SPOT_TYPE);
    assert.equal(factoryFor(environment, POINT_TYPE)?.producedDataType, POINT_TYPE);
    assert.equal(factoryFor(environment, PLAIN_TYPE), undefined);
    const home = minted(environment, SPOT_TYPE, "home");
    assert.equal(home.kind, "variable");
    assert.equal(home.varName, "home");
    assert.equal(home.varType, SPOT_TYPE);
  });

  it("shows a type's variable factory by the label and icon the type's catalog entry carries, and by the type's name when it carries no label", () => {
    const { environment } = bound();

    assert.equal(factoryFor(environment, SPOT_TYPE)?.metadata?.label, carriedType("Spot").label);
    assert.equal(factoryFor(environment, SPOT_TYPE)?.metadata?.iconUrl, carriedType("Spot").iconUrl);
    assert.equal(factoryFor(environment, POINT_TYPE)?.metadata?.label, carriedType("Point").name);
    assert.equal(factoryFor(environment, POINT_TYPE)?.metadata?.iconUrl, undefined);
  });

  it("carries the docs a type's catalog entry carries on its variable factory, and none for a type carrying none", () => {
    const { environment } = bound();

    assert.equal(factoryFor(environment, SPOT_TYPE)?.metadata?.docsMarkdown, carriedType("Spot").docs);
    assert.equal(factoryFor(environment, POINT_TYPE)?.metadata?.docsMarkdown, undefined);
  });

  it("offers each variable factory at the head of a DO side, and none for a type without the flag", () => {
    const offered = offeredAtDoHead(bound().environment);

    assert.ok(offered.includes(mkVariableFactoryTileId(SPOT_TYPE)));
    assert.ok(offered.includes(mkVariableFactoryTileId(POINT_TYPE)));
    assert.ok(!offered.includes(mkVariableFactoryTileId(PLAIN_TYPE)));
  });

  it("names a type with a variable factory by its factory's label in the brain editor's config, and any other type by its name", () => {
    const built = bound();
    const config = buildBrainEditorConfig(built.environment, new Map(), new Map(), built.typeIcons);

    assert.equal(config.dataTypeNames.get(SPOT_TYPE), factoryFor(built.environment, SPOT_TYPE)?.metadata?.label);
    assert.equal(config.dataTypeNames.get(POINT_TYPE), carriedType("Point").name);
    assert.equal(config.dataTypeNames.get(PLAIN_TYPE), carriedType("Plain").name);
  });

  it("compiles a minted variable assigned the inline sensor's result, its slot starting with no value", () => {
    const { environment } = bound();
    const brainDef = BrainDef.emptyBrainDef(environment.brainServices, "hold");
    const home = minted(environment, SPOT_TYPE, "home");
    brainDef.catalog().registerTileDef(home);
    const rule = (brainDef.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
    const tiles: IBrainTileDef[] = [
      home,
      catalogTile(environment, mkOperatorTileId(CoreOpId.Assign)),
      catalogTile(environment, mkSensorTileId(HERE)),
    ];
    for (const tile of tiles) rule.do().appendTile(tile);

    const compiled = compileBrainSource(environment, serializeBrainSource(brainDef));
    if (compiled.bytecode === undefined) throw new Error("no program");
    const { program } = linkedBrainProgramFromBytes(stream.byteArrayFromUint8Array(compiled.bytecode), {
      precision: MAKECODE_VM_PRECISION,
      typeRegistry: environment.brainServices.runtime.types,
    }).program;

    assert.deepEqual(compiled.diagnostics, []);
    assert.deepEqual(program.variableNames.toArray(), [home.varName]);
    assert.equal(variableInitAt(program, 0), NO_VARIABLE_INIT);
  });
});
