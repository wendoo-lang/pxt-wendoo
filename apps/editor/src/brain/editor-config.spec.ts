import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CoreTypeIds } from "@wendoo/core/app";
import { buildAuthoringEnvironment } from "../services/authoring-environment.js";
import { BRAIN_SOURCE_NAMESPACE } from "../services/brain-source.js";
import { buildBrainEditorConfig } from "./editor-config.js";

describe("buildBrainEditorConfig", () => {
  it("reads the environment's brain services, localizer and tile catalogs", () => {
    const { environment } = buildAuthoringEnvironment(undefined);

    const config = buildBrainEditorConfig(environment);

    assert.equal(config.brainServices, environment.brainServices);
    assert.equal(config.localizer, environment.appServices.localizer);
    assert.deepEqual(config.tileCatalogs, environment.tileCatalogs());
  });

  it("names each registered type by its registry name, without a qualifier", () => {
    const { environment } = buildAuthoringEnvironment(undefined);
    const types = environment.brainServices.runtime.types;

    const config = buildBrainEditorConfig(environment);

    assert.equal(config.dataTypeNames.get(CoreTypeIds.Number), types.get(CoreTypeIds.Number)?.name);
    assert.equal(config.dataTypeNames.get(CoreTypeIds.String), types.get(CoreTypeIds.String)?.name);
    for (const [typeId] of types.entries()) {
      assert.ok(config.dataTypeNames.has(typeId), `expected a name for ${typeId}`);
      assert.doesNotMatch(config.dataTypeNames.get(typeId) ?? "", /::/);
    }
  });

  it("saves and loads brain files relative to the namespace brain sources are stored in", () => {
    const { environment } = buildAuthoringEnvironment(undefined);

    const config = buildBrainEditorConfig(environment);

    assert.equal(config.projectNamespace, BRAIN_SOURCE_NAMESPACE);
  });

  it("follows a rebuilt environment: a config built from it reads the new environment", () => {
    const first = buildAuthoringEnvironment(undefined).environment;
    const rebuilt = buildAuthoringEnvironment('{"packs":[]}').environment;

    const config = buildBrainEditorConfig(rebuilt);

    assert.notEqual(first, rebuilt);
    assert.equal(config.brainServices, rebuilt.brainServices);
    assert.notEqual(config.brainServices, first.brainServices);
  });
});
