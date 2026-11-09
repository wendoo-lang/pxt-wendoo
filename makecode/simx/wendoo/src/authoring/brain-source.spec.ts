import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { List } from "@wendoo/core";
import type { WendooEnvironment } from "@wendoo/core/app";
import { BrainDef, CoreHostActions, encodePersistedBrainJson, mkActuatorTileId } from "@wendoo/core/app";
import type { BrainBuildDiagnostic } from "@wendoo/core/brain";
import { ParseDiagCode } from "@wendoo/core/brain/compiler";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { buildAuthoringEnvironment } from "./authoring-environment.js";
import {
  BRAIN_SOURCE_NAMESPACE,
  checkBrainSource,
  compileBrainSource,
  readBrainSource,
  serializeBrainSource,
  wireDiagnostics,
} from "./brain-source.js";

/** The source of a brain named `name` whose first rule places the actuator `actuator` on its WHEN side. */
function sourcePlacing(environment: WendooEnvironment, name: string, actuator: string): string {
  const definition = BrainDef.emptyBrainDef(environment.brainServices, name);
  const rule = (definition.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
  for (const catalog of environment.tileCatalogs()) {
    const tile = catalog.get(mkActuatorTileId(actuator));
    if (tile) rule.when().appendTile(tile);
  }
  return serializeBrainSource(definition);
}

describe("brain source", () => {
  it("serializes a brain as its upstream persisted brain JSON", () => {
    const { environment } = buildAuthoringEnvironment(undefined);
    const definition = BrainDef.emptyBrainDef(environment.brainServices, "Chaser");

    const source = serializeBrainSource(definition);

    assert.deepEqual(JSON.parse(source), encodePersistedBrainJson(definition, BRAIN_SOURCE_NAMESPACE));
  });

  it("reads a source back into a document with the same id, in the environment given", () => {
    const authored = buildAuthoringEnvironment(undefined).environment;
    const reading = buildAuthoringEnvironment(undefined).environment;
    const definition = BrainDef.emptyBrainDef(authored.brainServices, "Chaser");
    const source = serializeBrainSource(definition);

    const read = readBrainSource(reading, source);

    assert.equal(read.id(), definition.id());
    assert.equal(read.servicesTypeRegistry(), reading.brainServices.runtime.types);
    assert.equal(serializeBrainSource(read), source);
  });

  it("checks a source as its compile does, without encoding a program", () => {
    const { environment } = buildAuthoringEnvironment(undefined);
    const clean = serializeBrainSource(BrainDef.emptyBrainDef(environment.brainServices, "Chaser"));
    const broken = sourcePlacing(environment, "Broken", CoreHostActions.SwitchPage.key);

    const checkedClean = checkBrainSource(environment, clean);
    const checkedBroken = checkBrainSource(environment, broken);

    assert.deepEqual(checkedClean, { diagnostics: [], linked: true, unresolvedTiles: [] });
    assert.equal(checkedBroken.linked, false);
    assert.deepEqual(
      checkedBroken.diagnostics.map((diagnostic) => diagnostic.code),
      compileBrainSource(environment, broken).diagnostics.map((diagnostic) => diagnostic.code)
    );
    assert.ok(
      checkedBroken.diagnostics.some((diagnostic) => diagnostic.code === ParseDiagCode.TilePlacementSideMismatch)
    );
  });

  it("carries diagnostics in their wire form, each param a text, a number or a list of texts", () => {
    const diagnostics: BrainBuildDiagnostic[] = [
      {
        code: ParseDiagCode.TilePlacementSideMismatch,
        severity: "error",
        message: "misplaced",
        params: { tileId: "tile.a", conversionCost: 2, expectedTypeIds: List.from(["number", "string"]) },
      },
      { code: ParseDiagCode.TilePlacementSideMismatch, severity: "warning", message: "plain" },
    ];

    assert.deepEqual(wireDiagnostics(diagnostics), [
      {
        code: ParseDiagCode.TilePlacementSideMismatch,
        severity: "error",
        message: "misplaced",
        params: { tileId: "tile.a", conversionCost: 2, expectedTypeIds: ["number", "string"] },
      },
      { code: ParseDiagCode.TilePlacementSideMismatch, severity: "warning", message: "plain" },
    ]);
  });
});
