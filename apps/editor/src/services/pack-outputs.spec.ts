import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { List } from "@wendoo/core";
import type { IBrainTileDef } from "@wendoo/core/app";
import { BrainDef, CoreTypeIds, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import { RuleSide } from "@wendoo/core/brain";
import {
  buildInsertionContext,
  collectRuleHierarchyOutputKeys,
  suggestTiles,
} from "@wendoo/core/brain/language-service";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { mkOutputTileId, mkOutputVarKey } from "@wendoo/core/runtime";
import { catalogTile } from "../test-support/asset-catalog.js";
import type { AuthoringEnvironment } from "./authoring-environment.js";
import { buildAuthoringEnvironment } from "./authoring-environment.js";
import { compileBrainSource, serializeBrainSource } from "./brain-source.js";
import { parseCatalog } from "./catalog.js";
import { allocateIds, emptyIdManifest } from "./id-allocation.js";

/** The icon {@link OUTPUT_CATALOG} carries on the `seen` output. */
const SEEN_ICON = "data:image/svg+xml;base64,c2Vlbg==";

/** Name of the sensor declaring the `seen` output with its label, docs and icon. */
const PEEK = "sensor.lookout.peek";

/** Name of the sensor declaring the `seen` output again, with another label, and the unlabeled `count` output. */
const GLANCE = "sensor.lookout.glance";

/** Name of the actuator taking an optional number. */
const SAY = "actuator.lookout.say";

/**
 * A catalog in the rendered form the simx publishes: two sensors declaring
 * one output under the same identity, the first with a label, docs and an
 * icon, the second with another label and a second, unlabeled output; and an
 * actuator taking a number.
 */
const OUTPUT_CATALOG = JSON.stringify({
  packs: [
    {
      name: "lookout",
      tiles: [
        {
          name: PEEK,
          kind: "sensor",
          returns: "boolean",
          outputs: [{ name: "seen", type: "number", label: "what I saw", docs: "# Seen", iconUrl: SEEN_ICON }],
          label: "peek",
        },
        {
          name: GLANCE,
          kind: "sensor",
          returns: "boolean",
          outputs: [
            { name: "seen", type: "number", label: "another word" },
            { name: "count", type: "number" },
          ],
          label: "glance",
        },
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

/** The output tile id of the number output `name`. */
function outputTileId(name: string): string {
  return mkOutputTileId(CoreTypeIds.Number, name);
}

/** A fresh environment binding {@link OUTPUT_CATALOG} under the allocation a project holding none gets. */
function environment(): AuthoringEnvironment {
  return buildAuthoringEnvironment(OUTPUT_CATALOG, allocateIds(emptyIdManifest(), parseCatalog(OUTPUT_CATALOG)));
}

/** A one-rule brain in `built`: its WHEN side the tiles `when` holds, its DO side the tiles `act` holds; and its rule. */
function brainOf(built: AuthoringEnvironment, when: readonly IBrainTileDef[], act: readonly IBrainTileDef[]) {
  const brain = BrainDef.emptyBrainDef(built.environment.brainServices, "lookout");
  const rule = (brain.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
  for (const tile of when) rule.when().appendTile(tile);
  for (const tile of act) rule.do().appendTile(tile);
  return { brain, rule };
}

/** Whether the suggestion oracle offers `tileId` at the end of the DO side of `rule`, given the outputs the rule's hierarchy provides, as the brain editor gives them. */
function offeredOnDo(built: AuthoringEnvironment, rule: BrainRuleDef, tileId: string): boolean {
  const tileSet = rule.do();
  const context = buildInsertionContext({
    side: RuleSide.Do,
    expr: tileSet.expr(),
    ruleDef: rule,
    existingTiles: tileSet.tiles(),
    availableOutputKeys: collectRuleHierarchyOutputKeys(rule),
  });
  const result = suggestTiles(context, List.from(built.environment.tileCatalogs()), built.environment.brainServices);
  const has = (suggestions: typeof result.exact) =>
    suggestions.findIndex((suggestion) => suggestion.tileDef.tileId === tileId) !== -1;
  return has(result.exact) || has(result.withConversion);
}

describe("pack tile outputs", () => {
  it("binds each declared output as an output tile carrying the label, docs and icon its catalog entry carries", () => {
    const built = environment();

    const seen = catalogTile(built.environment, outputTileId("seen"));

    assert.deepEqual(built.diagnostics, []);
    assert.equal(seen.kind, "output");
    assert.equal(seen.metadata?.label, "what I saw");
    assert.equal(seen.metadata?.docsMarkdown, "# Seen");
    assert.equal(seen.metadata?.iconUrl, SEEN_ICON);
  });

  it("keeps an output identity two tiles declare as one tile, the first declaration's", () => {
    const built = environment();

    assert.equal(catalogTile(built.environment, outputTileId("seen")).metadata?.label, "what I saw");
  });

  it("shows an unlabeled output by its name", () => {
    const built = environment();

    assert.equal(catalogTile(built.environment, outputTileId("count")).metadata?.label, "count");
  });

  it("makes each declaring tile provide its outputs' keys", () => {
    const built = environment();

    const provided = catalogTile(built.environment, mkSensorTileId(GLANCE)).providedOutputs?.().toArray();
    assert.deepEqual(provided, [
      mkOutputVarKey(CoreTypeIds.Number, "seen"),
      mkOutputVarKey(CoreTypeIds.Number, "count"),
    ]);
  });

  it("offers an output tile on the DO side of a rule whose WHEN declares it, and not of one whose WHEN does not", () => {
    const built = environment();
    const tile = (tileId: string) => catalogTile(built.environment, tileId);

    const declared = brainOf(built, [tile(mkSensorTileId(PEEK))], [tile(mkActuatorTileId(SAY))]).rule;
    const undeclared = brainOf(built, [], [tile(mkActuatorTileId(SAY))]).rule;

    assert.ok(offeredOnDo(built, declared, outputTileId("seen")));
    assert.equal(offeredOnDo(built, undeclared, outputTileId("seen")), false);
  });

  it("compiles a rule reading its WHEN's output on its DO side and in a child rule to reads of the output's key", () => {
    const built = environment();
    const tile = (tileId: string) => catalogTile(built.environment, tileId);
    const { brain, rule } = brainOf(
      built,
      [tile(mkSensorTileId(PEEK))],
      [tile(mkActuatorTileId(SAY)), tile(outputTileId("seen"))]
    );
    const child = rule.appendNewRule();
    child.do().appendTile(tile(mkActuatorTileId(SAY)));
    child.do().appendTile(tile(outputTileId("seen")));

    const compiled = compileBrainSource(built.environment, serializeBrainSource(brain));

    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.bytecode);
    const text = new TextDecoder().decode(compiled.bytecode);
    assert.ok(text.includes(mkOutputVarKey(CoreTypeIds.Number, "seen")));
  });
});
