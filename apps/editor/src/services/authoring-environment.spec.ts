import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WendooEnvironment } from "@wendoo/core/app";
import { BrainDef, CoreHostActions, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import { buildAuthoringEnvironment, CATALOG_PACK_UNBOUND } from "./authoring-environment.js";
import { CATALOG_UNREADABLE } from "./catalog.js";

/**
 * A catalog in the vm extension serializer's grammar: two packs declaring
 * types, tiles and operators, plus the registration diagnostics the
 * extension records for vocabulary its project mapping does not bind.
 */
const PACK_CATALOG =
  '{"packs":[{"name":"beacon","types":[{"name":"Signal","fields":[{"name":"strength","type":"number","readOnly":true}]}],' +
  '"tiles":[{"name":"say \\"hi\\"","kind":"actuator","docs":"line\\nnext \\u00e9"},{"name":"hear","kind":"sensor","returns":"Signal"}],' +
  '"operators":[{"name":"boost","operands":["Signal","number"],"returns":"Signal"}]},' +
  '{"name":"motion","tiles":[{"name":"move","kind":"actuator","args":[{"name":"speed","type":"number","optional":true}]}]}],' +
  '"diagnostics":[{"code":"registration-unmapped-name","name":"move","pack":"motion"}]}';

/** Whether any of `environment`'s tile catalogs holds the tile `tileId`. */
function hasTile(environment: WendooEnvironment, tileId: string): boolean {
  return environment.tileCatalogs().some((catalog) => catalog.has(tileId));
}

/** Asserts `environment` carries the core vocabulary a brain is authored from. */
function assertCoreVocabulary(environment: WendooEnvironment): void {
  assert.ok(hasTile(environment, mkSensorTileId(CoreHostActions.OnPageEntered.key)));
  assert.ok(hasTile(environment, mkActuatorTileId(CoreHostActions.SwitchPage.key)));
}

describe("buildAuthoringEnvironment", () => {
  it("builds the core vocabulary environment when no catalog has arrived", () => {
    const built = buildAuthoringEnvironment(undefined);

    assertCoreVocabulary(built.environment);
    assert.deepEqual(built.diagnostics, []);
  });

  it("diagnoses each catalog pack's vocabulary as unbound, keeping the core vocabulary", () => {
    const built = buildAuthoringEnvironment(PACK_CATALOG);

    assertCoreVocabulary(built.environment);
    assert.deepEqual(built.diagnostics, [
      { code: CATALOG_PACK_UNBOUND, pack: "beacon" },
      { code: CATALOG_PACK_UNBOUND, pack: "motion" },
    ]);
  });

  it("reads the transport's catalog fixture", () => {
    const built = buildAuthoringEnvironment(
      '{"packs":[{"name":"beacon","tiles":[{"name":"say \\"hi\\"","kind":"actuator","docs":"line\\nnext \\u00e9"}]}]}'
    );

    assert.deepEqual(built.diagnostics, [{ code: CATALOG_PACK_UNBOUND, pack: "beacon" }]);
  });

  it("reads a catalog declaring no packs as the core environment with no diagnostics", () => {
    const built = buildAuthoringEnvironment('{"packs":[]}');

    assertCoreVocabulary(built.environment);
    assert.deepEqual(built.diagnostics, []);
  });

  it("reports unreadable catalog text by its stable code and still builds the core environment", () => {
    const built = buildAuthoringEnvironment("not a catalog");

    assertCoreVocabulary(built.environment);
    assert.deepEqual(built.diagnostics, [{ code: CATALOG_UNREADABLE }]);
  });

  it("builds a fresh environment for every catalog", () => {
    assert.notEqual(
      buildAuthoringEnvironment(PACK_CATALOG).environment,
      buildAuthoringEnvironment(PACK_CATALOG).environment
    );
  });

  it("mints document ids from an entropy-seeded stream, so two environments mint different ids", () => {
    const first = BrainDef.emptyBrainDef(buildAuthoringEnvironment(undefined).environment.brainServices, "a");
    const second = BrainDef.emptyBrainDef(buildAuthoringEnvironment(undefined).environment.brainServices, "a");

    assert.notEqual(first.id(), second.id());
  });
});
