import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrainDef, mkLiteralTileId } from "@wendoo/core/app";
import { brainSourceHash, type MakeCodeManifestReading } from "@wendoo/makecode-session";
import { buildAuthoringEnvironment } from "../authoring/authoring-environment.js";
import { serializeBrainSource } from "../authoring/brain-source.js";
import {
  ASSET_CATALOG,
  assetCatalogIds,
  PICTURE_TYPE,
  picture,
  pictureBrainSource,
} from "../editor/test-support/asset-catalog.js";
import { BRAIN_CATALOG, brainCatalogIds, kinBrainSource, kinTileId } from "../editor/test-support/brain-catalog.js";
import { BrainEngine } from "./brain-engine.js";
import type { CompiledBrainEntry } from "./brains-module.js";

/** Document id of the brain compiled. */
const BRAIN_ID = "enginebrain00001";

/** Document id of the brain another one names. */
const NAMED_ID = "namedbrain000001";

/** No held brains. */
const NO_BRAINS = new Map<string, { readonly name: string }>();

/** The manifest reading holding `manifest`. */
function readingOf(manifest: MakeCodeManifestReading["manifest"]): MakeCodeManifestReading {
  return { manifest };
}

/** The program bytes of `registration`, failing the spec when there is none. */
function bytesOf(registration: CompiledBrainEntry | undefined): Uint8Array {
  assert.ok(registration, "expected a registration");
  return registration.bytecode;
}

/** The source of the brain {@link BRAIN_ID} placing the picture `img1` on both sides. */
function pictureSource(): string {
  const built = buildAuthoringEnvironment(ASSET_CATALOG, assetCatalogIds());
  built.assetLiterals.applySnapshot([picture("img1", "hero")]);
  return pictureBrainSource(built.environment, mkLiteralTileId(PICTURE_TYPE, "img1")).replace(
    /"id": "[^"]+"/,
    `"id": "${BRAIN_ID}"`
  );
}

describe("brain engine", () => {
  it("compiles core-only before any catalog, reading pack tiles as unresolved", () => {
    const engine = new BrainEngine();
    const source = pictureSource();

    const compiled = engine.compile(BRAIN_ID, "Gallery", source, undefined, NO_BRAINS);

    assert.equal(compiled.registration, undefined);
    assert.equal(compiled.outcome.compiled, null);
    assert.equal(compiled.outcome.sourceHash, brainSourceHash(source));
    assert.ok(compiled.outcome.unresolvedTiles.length > 0);
  });

  it("reports a rebuild only when the catalog, the allocation or the snapshot changes", () => {
    const engine = new BrainEngine();
    const snapshot = [picture("img1", "hero")];

    assert.equal(engine.adoptCatalog(ASSET_CATALOG, readingOf(assetCatalogIds())), true);
    assert.equal(engine.adoptCatalog(ASSET_CATALOG, readingOf(assetCatalogIds())), false);
    assert.equal(engine.adoptManifest(readingOf(assetCatalogIds())), false);
    assert.equal(engine.adoptManifest(readingOf(null)), true);
    assert.equal(engine.adoptAssets(snapshot), true);
    assert.equal(engine.adoptAssets(snapshot), false);
  });

  it("compiles a brain placing an asset to the same program whether or not the snapshot lists the asset", () => {
    const engine = new BrainEngine();
    engine.adoptCatalog(ASSET_CATALOG, readingOf(assetCatalogIds()));
    const source = pictureSource();
    const unlisted = engine.compile(BRAIN_ID, "Gallery", source, undefined, NO_BRAINS);

    engine.adoptAssets([picture("img1", "hero")]);
    const listed = engine.compile(BRAIN_ID, "Gallery", source, undefined, NO_BRAINS);
    engine.adoptAssets([picture("img2", "other")]);
    const deleted = engine.compile(BRAIN_ID, "Gallery", source, undefined, NO_BRAINS);

    assert.deepEqual(listed.outcome.diagnostics, []);
    assert.deepEqual(bytesOf(unlisted.registration), bytesOf(listed.registration));
    assert.deepEqual(bytesOf(deleted.registration), bytesOf(listed.registration));
  });

  it("compiles a brain naming another to the same program whether or not the named brain is held", () => {
    const engine = new BrainEngine();
    engine.adoptCatalog(BRAIN_CATALOG, readingOf(brainCatalogIds()));
    const built = buildAuthoringEnvironment(BRAIN_CATALOG, brainCatalogIds());
    built.brainLiterals.applyBrains(new Map([[NAMED_ID, { name: "Chaser" }]]));
    const source = kinBrainSource(built.environment, kinTileId(NAMED_ID), BRAIN_ID);

    const held = engine.compile(BRAIN_ID, "Seeker", source, undefined, new Map([[NAMED_ID, { name: "Chaser" }]]));
    const removed = engine.compile(BRAIN_ID, "Seeker", source, undefined, NO_BRAINS);

    assert.deepEqual(held.outcome.diagnostics, []);
    assert.deepEqual(bytesOf(removed.registration), bytesOf(held.registration));
  });

  it("keeps the held registration under the brain's name for a compile producing no program", () => {
    const engine = new BrainEngine();
    const held: CompiledBrainEntry = {
      id: BRAIN_ID,
      name: "Gallery",
      sourceHash: "00000000",
      bytecode: Uint8Array.from([1]),
    };

    const compiled = engine.compile(BRAIN_ID, "Renamed", pictureSource(), held, NO_BRAINS);

    assert.deepEqual(compiled.registration, { ...held, name: "Renamed" });
    assert.deepEqual(compiled.outcome.compiled, { sourceHash: "00000000" });
  });

  it("compiles a text that is not a brain document to nothing, keeping the held registration", () => {
    const engine = new BrainEngine();
    const held: CompiledBrainEntry = {
      id: BRAIN_ID,
      name: "Gallery",
      sourceHash: "00000000",
      bytecode: Uint8Array.from([1]),
    };

    const compiled = engine.compile(BRAIN_ID, "Gallery", "not json {", held, NO_BRAINS);

    assert.deepEqual(compiled.outcome, {
      sourceHash: brainSourceHash("not json {"),
      compiled: { sourceHash: "00000000" },
      diagnostics: [],
      unresolvedTiles: [],
    });
    assert.deepEqual(compiled.registration, held);
  });

  it("mints an empty one-page brain under a fresh id, as the editor serializes one", () => {
    const engine = new BrainEngine();

    const first = engine.mint("Chaser");
    const second = engine.mint("Chaser");

    assert.notEqual(first.id, second.id);
    const document = JSON.parse(first.source);
    assert.equal(document.id, first.id);
    assert.equal(document.name, "Chaser");
    assert.equal(document.pages.length, 1);
    const reference = BrainDef.emptyBrainDef(buildAuthoringEnvironment(undefined).environment.brainServices, "Chaser");
    assert.equal(Object.keys(document).join(), Object.keys(JSON.parse(serializeBrainSource(reference))).join());
  });
});
