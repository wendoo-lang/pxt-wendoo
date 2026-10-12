/**
 * Specs for the corners and faces literal and accessor tiles wear in the brain
 * editor over the arcade selftest's catalog, rendered as the simx renders it
 * under the arcade target's icon palette: a core literal's corner is the icon
 * the catalog gives its core type -- a number or text literal carrying no icon
 * of its own and `true` and `false`, which the catalog gives icons of their
 * own, alike -- and a number or text literal's face, as the candidate strip
 * reads it, is that icon too; an image literal wears the `Image` type's icon
 * in its corner and its asset's preview as its face, and the `image` accessor,
 * whose face is that same icon, draws no corner; a song literal, its song
 * carrying no preview, wears the `Song` type's icon as its face and in its
 * corner. Icons are identified by their data URIs and tiles by their ids.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IBrainTileDef } from "@wendoo/core/app";
import { CoreTypeIds, mkLiteralTileId } from "@wendoo/core/app";
import { mkAccessorTileId, RuleSide } from "@wendoo/core/brain";
import { BrainTileLiteralDef } from "@wendoo/core/brain/tiles";
import { mkTypeId, NativeType } from "@wendoo/core/runtime";
import type { MakeCodeAsset } from "@wendoo/makecode-session";
import type { BrainEditorConfig } from "@wendoo/ui";
import { BrainEditorProvider, BrainTile } from "@wendoo/ui";
import { kTileCornerIconAttribute } from "@wendoo/ui/brain-editor/BrainTile";
import { resolveTileVisual } from "@wendoo/ui/brain-editor/tile-visual-utils";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { enrichCatalogIcons } from "../../simx/catalog-icons.js";
import { targetIconPalette } from "../../simx/target-icon-palettes.js";
import { buildAuthoringEnvironment } from "../services/authoring-environment.js";
import { parseCatalog } from "../services/catalog.js";
import { catalogTile, picture } from "../test-support/asset-catalog.js";
import { arcadeCatalog, arcadeIds } from "../test-support/vm-programs.js";
import { buildBrainEditorConfig } from "./editor-config.js";

/** The arcade selftest's catalog with its icons rendered under the arcade target's palette. */
const RENDERED = enrichCatalogIcons(arcadeCatalog(), "arcade", targetIconPalette("arcade"), {
  info: () => {},
  error: () => {},
});

/** The icon the rendered catalog gives the core type named `typeName`. Throws when it gives none. */
function carriedTypeIcon(typeName: string): string {
  const found = parseCatalog(RENDERED)
    .packs.flatMap((pack) => pack.coreTypeIcons)
    .find((icon) => icon.typeName === typeName);
  assert.ok(found, `no icon for core type ${typeName}`);
  return found.iconUrl;
}

/** The icon the rendered catalog's type entry named `typeName` carries. Throws when it carries none. */
function carriedPackTypeIcon(typeName: string): string {
  const found = parseCatalog(RENDERED)
    .packs.flatMap((pack) => pack.types)
    .find((type) => type.name === typeName);
  assert.ok(found?.iconUrl, `no icon for type ${typeName}`);
  return found.iconUrl;
}

/** The icon the rendered catalog gives the core tile `tileId`. Throws when it gives none. */
function carriedTileIcon(tileId: string): string {
  const found = parseCatalog(RENDERED)
    .packs.flatMap((pack) => pack.coreTileIcons)
    .find((icon) => icon.tileId === tileId);
  assert.ok(found, `no icon for core tile ${tileId}`);
  return found.iconUrl;
}

/**
 * The environment binding the rendered catalog under the arcade selftest's
 * allocation, its asset literals minted from `assets`, and its editor config.
 */
function boundEditor(assets: MakeCodeAsset[] = []) {
  const built = buildAuthoringEnvironment(RENDERED, arcadeIds());
  built.assetLiterals.applySnapshot(assets);
  const config = buildBrainEditorConfig(
    built.environment,
    built.assetLiterals.view,
    built.brainLiterals.view,
    built.packLiterals,
    built.typeIcons,
    built.typeLabels,
    built.pageIcon
  );
  return { environment: built.environment, config };
}

/** The `src` of every image a placed `tileDef` draws in its corner under `config`. */
function cornerSources(config: BrainEditorConfig, tileDef: IBrainTileDef): string[] {
  const markup = renderToStaticMarkup(
    createElement(BrainEditorProvider, { config }, createElement(BrainTile, { tileDef, side: RuleSide.Do }))
  );
  return [...markup.matchAll(/<img ([^>]*)>/g)]
    .map((match) => match[1])
    .filter((attributes) => attributes.includes(`${kTileCornerIconAttribute}=`))
    .map((attributes) => attributes.match(/(?:^| )src="([^"]*)"/)?.[1] ?? "");
}

describe("a core literal's corner over the arcade catalog", () => {
  it("is the number type's icon on a number literal", () => {
    const { environment, config } = boundEditor();
    const literal = new BrainTileLiteralDef(CoreTypeIds.Number, 7, {}, environment.brainServices);

    assert.deepEqual(cornerSources(config, literal), [carriedTypeIcon("number")]);
  });

  it("is the text type's icon on a text literal", () => {
    const { environment, config } = boundEditor();
    const literal = new BrainTileLiteralDef(CoreTypeIds.String, "hi", {}, environment.brainServices);

    assert.deepEqual(cornerSources(config, literal), [carriedTypeIcon("string")]);
  });

  it("is the switch type's icon on true and false, over the icons of their own", () => {
    const { environment, config } = boundEditor();
    for (const key of ["true", "false"]) {
      const tileId = mkLiteralTileId(CoreTypeIds.Boolean, key);

      assert.notEqual(carriedTileIcon(tileId), carriedTypeIcon("boolean"), key);
      assert.deepEqual(cornerSources(config, catalogTile(environment, tileId)), [carriedTypeIcon("boolean")], key);
    }
  });
});

describe("a core literal's face over the arcade catalog, as the candidate strip reads it", () => {
  it("is the number type's icon on a number literal and the text type's icon on a text literal", () => {
    const { environment, config } = boundEditor();
    const number = new BrainTileLiteralDef(CoreTypeIds.Number, 7, {}, environment.brainServices);
    const text = new BrainTileLiteralDef(CoreTypeIds.String, "hi", {}, environment.brainServices);

    assert.equal(resolveTileVisual(config, number).iconUrl, carriedTypeIcon("number"));
    assert.equal(resolveTileVisual(config, text).iconUrl, carriedTypeIcon("string"));
  });

  it("is the icon of its own on true and false", () => {
    const { environment, config } = boundEditor();
    for (const key of ["true", "false"]) {
      const tileId = mkLiteralTileId(CoreTypeIds.Boolean, key);

      assert.equal(resolveTileVisual(config, catalogTile(environment, tileId)).iconUrl, carriedTileIcon(tileId), key);
    }
  });
});

describe("the Image type's icon over the arcade catalog", () => {
  const imageType = mkTypeId(NativeType.Struct, "Image");
  const preview = "data:image/svg+xml;base64,aGVybw==";

  it("is an image literal's corner, its asset's preview its face", () => {
    const { environment, config } = boundEditor([picture("image1", "hero", preview)]);
    const literal = catalogTile(environment, mkLiteralTileId(imageType, "image1"));

    assert.equal(resolveTileVisual(config, literal).iconUrl, preview);
    assert.deepEqual(cornerSources(config, literal), [carriedPackTypeIcon("Image")]);
  });

  it("is the image accessor's face, which therefore draws no corner", () => {
    const { environment, config } = boundEditor();
    const accessor = catalogTile(environment, mkAccessorTileId(mkTypeId(NativeType.Struct, "Sprite"), "image"));

    assert.equal(resolveTileVisual(config, accessor).iconUrl, carriedPackTypeIcon("Image"));
    assert.deepEqual(cornerSources(config, accessor), []);
  });
});

describe("the Song type's icon over the arcade catalog", () => {
  const songType = mkTypeId(NativeType.Struct, "Song");
  const theme: MakeCodeAsset = { kind: "song", id: "song1", name: "theme" };

  it("is a song literal's face and corner, its song carrying no preview, its label the song's name", () => {
    const { environment, config } = boundEditor([theme]);
    const literal = catalogTile(environment, mkLiteralTileId(songType, "song1"));
    const visual = resolveTileVisual(config, literal);

    assert.equal(visual.iconUrl, carriedPackTypeIcon("Song"));
    assert.equal(visual.label, "theme");
    assert.deepEqual(cornerSources(config, literal), [carriedPackTypeIcon("Song")]);
  });
});
