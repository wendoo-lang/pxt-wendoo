/**
 * Pins that every page of the arcade base pack's docs content, read from the
 * pack's source tree, draws and links to what it names over the environment
 * binding the arcade selftest's catalog: each page is the content of the docs
 * entry of every registration it documents, opened in session by that
 * entry's tile id; the tile and type pages are listed and the output and
 * accessor pages are not; every page documenting a sensor or an actuator holds
 * an `assistant` fence; every `brain` fence parses and names only tile ids
 * the environment or the fence's own catalog holds; every `tile:` reference
 * names a tile with a docs entry; and every `concept:` reference names a
 * registered concept page. Also records which pages the standalone docs
 * route, which binds no session catalog, resolves: the core pages, and none
 * of the pack's.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, describe, test } from "node:test";
import type { WendooEnvironment } from "@wendoo/core/app";
import { mkActuatorTileId, mkSensorTileId, mkVariableFactoryTileId } from "@wendoo/core/app";
import { mkAccessorTileId } from "@wendoo/core/brain";
import { mkOutputTileId, mkTypeId, NativeType } from "@wendoo/core/runtime";
import type { DocsRegistry } from "@wendoo/docs";
import {
  type BrainFenceRule,
  buildBrainFenceCatalog,
  parseBrainFence,
  resolveBrainFenceTiles,
} from "@wendoo/docs/brain-fence";
import { kTileIdPlaceholder } from "@wendoo/docs/DocsRegistry";
import { buildAuthoringEnvironment } from "../services/authoring-environment.js";
import type { ParsedCatalog } from "../services/catalog.js";
import { parseCatalog } from "../services/catalog.js";
import { absolutePath, arcadeCatalog, arcadeIds } from "../test-support/vm-programs.js";
import { createDocsTileCatalog, createEditorDocsRegistry } from "./docs-registry.js";

/** The arcade base pack's docs content for its one locale, relative to the repository root. */
const CONTENT_DIR = "makecode/extensions/arcade-base/docs/content/en";

/** Directory, under {@link CONTENT_DIR}, of the pages each documenting the tile its file is named for, or, named `output.<name>`, the output. */
const TILE_PAGE_DIR = "tiles";

/** Directory, under {@link CONTENT_DIR}, of the pages each documenting the struct type its file is named for. */
const TYPE_PAGE_DIR = "types";

/** Directory, under {@link CONTENT_DIR}, of the pages each named `accessor.<field>`, documenting the accessors of fields of that name. */
const ACCESSOR_PAGE_DIR = "accessors";

/** A ```brain fence, capturing the body inside its info line and its closing line. */
const BRAIN_FENCE_RE = /^```brain[^\n]*\n([\s\S]*?)\n```$/gm;

/** An ```assistant fence: its info line, its body and its closing line. */
const ASSISTANT_FENCE_RE = /^```assistant\n[\s\S]*?\n```$/m;

/** An inline `tile:<id>` code span, capturing the id. */
const TILE_REF_RE = /`tile:([^`]*)`/g;

/** An inline `concept:<id>` code span, capturing the id. */
const CONCEPT_REF_RE = /`concept:([^`]*)`/g;

/** Whether a page's entry is listed in the docs sidebar, or opened only by its tile id. */
type Listing = "listed" | "unlisted";

/** One page of the pack's docs content as the docs entry of one registration it documents, its markdown as the registry holds it. */
interface ContentPage {
  /** Path of the page, relative to {@link CONTENT_DIR}. */
  file: string;
  /** Tile id of the docs entry the page is the content of. */
  entryTileId: string;
  /** Whether the entry is listed. */
  listing: Listing;
  /** The page's markdown, its tile-id placeholder resolved to {@link ContentPage.entryTileId}. */
  markdown: string;
}

/** The docs entries a page documents: each entry's tile id, and whether it is listed. */
type PageEntries = (name: string) => { tileId: string; listing: Listing }[];

/** Key prefix of an output page. */
const OUTPUT_PAGE_PREFIX = "output.";

/** Key prefix of an accessor page. */
const ACCESSOR_PAGE_PREFIX = "accessor.";

/** `key` without `prefix`, which it must start with. */
function unprefixed(key: string, prefix: string): string {
  assert.ok(key.startsWith(prefix), `${key} starts with ${prefix}`);
  return key.slice(prefix.length);
}

/** The arcade selftest's catalog, parsed. */
function arcadeCatalogParsed(): ParsedCatalog {
  return parseCatalog(arcadeCatalog());
}

/**
 * The entry the page keyed `key` under {@link TILE_PAGE_DIR} documents: for
 * `output.<name>`, the output named `<name>` some tile of the arcade
 * selftest's catalog declares, under the struct type it declares, unlisted;
 * else the tile named `key`, listed.
 */
function tilePageEntries(key: string): { tileId: string; listing: Listing }[] {
  const tiles = arcadeCatalogParsed().packs.flatMap((pack) => pack.tiles);
  if (key.startsWith(OUTPUT_PAGE_PREFIX)) {
    const name = unprefixed(key, OUTPUT_PAGE_PREFIX);
    const output = tiles.flatMap((entry) => entry.outputs).find((entry) => entry.name === name);
    assert.ok(output, `the catalog declares an output named ${name}`);
    return [{ tileId: mkOutputTileId(mkTypeId(NativeType.Struct, output.type), name), listing: "unlisted" }];
  }
  const tile = tiles.find((entry) => entry.name === key);
  assert.ok(tile, `the catalog declares a tile named ${key}`);
  return [{ tileId: tile.kind === "sensor" ? mkSensorTileId(key) : mkActuatorTileId(key), listing: "listed" }];
}

/** The entry a page under {@link TYPE_PAGE_DIR} documents: the variable factory of the struct type `name`, listed. */
function typePageEntries(name: string): { tileId: string; listing: Listing }[] {
  return [{ tileId: mkVariableFactoryTileId(mkTypeId(NativeType.Struct, name)), listing: "listed" }];
}

/**
 * The entries the page keyed `accessor.<field>` under
 * {@link ACCESSOR_PAGE_DIR} documents: the accessor tile of every field named
 * `<field>` a struct type of the arcade selftest's catalog gives one, each
 * unlisted.
 */
function accessorPageEntries(key: string): { tileId: string; listing: Listing }[] {
  const name = unprefixed(key, ACCESSOR_PAGE_PREFIX);
  const entries = arcadeCatalogParsed()
    .packs.flatMap((pack) => pack.types)
    .filter((type) => type.fields.some((field) => field.name === name && field.accessor !== undefined))
    .map((type) => ({
      tileId: mkAccessorTileId(mkTypeId(NativeType.Struct, type.name), name),
      listing: "unlisted" as const,
    }));
  assert.ok(entries.length > 0, `the catalog declares an accessor named ${name}`);
  return entries;
}

/** The pages under `dir`, each as the entry of every registration `entries` gives for its file's name. */
function pagesIn(dir: string, entries: PageEntries): ContentPage[] {
  const root = absolutePath(`${CONTENT_DIR}/${dir}`);
  return fs
    .readdirSync(root)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .flatMap((file) => {
      const raw = fs.readFileSync(path.join(root, file), "utf8");
      return entries(path.basename(file, ".md")).map(({ tileId, listing }) => ({
        file: `${dir}/${file}`,
        entryTileId: tileId,
        listing,
        markdown: raw.split(kTileIdPlaceholder).join(tileId),
      }));
    });
}

/** Every page of the pack's docs content. */
function contentPages(): ContentPage[] {
  return [
    ...pagesIn(TILE_PAGE_DIR, tilePageEntries),
    ...pagesIn(TYPE_PAGE_DIR, typePageEntries),
    ...pagesIn(ACCESSOR_PAGE_DIR, accessorPageEntries),
  ];
}

/** Every capture of `re`'s first group in every page, each named by its page. */
function referencesIn(pages: readonly ContentPage[], re: RegExp): { file: string; id: string }[] {
  return pages.flatMap((page) => [...page.markdown.matchAll(re)].map((match) => ({ file: page.file, id: match[1] })));
}

/** Every tile id a fence rule names, its own sides first, then its children's. */
function ruleTileIds(rule: BrainFenceRule): string[] {
  return [...(rule.when ?? []), ...(rule.do ?? []), ...(rule.children ?? []).flatMap(ruleTileIds)];
}

let environment: WendooEnvironment;
let registry: DocsRegistry;
let pages: ContentPage[];

before(() => {
  environment = buildAuthoringEnvironment(arcadeCatalog(), arcadeIds()).environment;
  registry = createEditorDocsRegistry(environment, new Set());
  pages = contentPages();
});

describe("the arcade base pack's docs pages", () => {
  test("are found in every page directory, so an empty sweep cannot pass as a clean one", () => {
    for (const dir of [TILE_PAGE_DIR, TYPE_PAGE_DIR, ACCESSOR_PAGE_DIR]) {
      assert.ok(
        pages.some((page) => page.file.startsWith(`${dir}/`)),
        `no pages found under ${CONTENT_DIR}/${dir}`
      );
    }
  });

  test("are each the content of the docs entry of every registration they document, opened in session by its tile id", () => {
    for (const page of pages) {
      const entry = registry.tiles.get(page.entryTileId);
      assert.ok(entry, `${page.file}: no docs entry for ${page.entryTileId}`);
      assert.equal(
        entry.content,
        page.markdown,
        `${page.file}: the entry for ${page.entryTileId} carries another page`
      );
    }
  });

  test("are listed for each tile and type, and unlisted for each output and accessor", () => {
    for (const listing of ["listed", "unlisted"] as const) {
      assert.ok(
        pages.some((page) => page.listing === listing),
        `no ${listing} pages found`
      );
    }
    for (const page of pages) {
      const category = registry.tiles.get(page.entryTileId)?.category;
      assert.equal(
        category !== undefined,
        page.listing === "listed",
        `${page.file}: ${page.entryTileId} is not ${page.listing}`
      );
    }
  });

  test("hold an assistant fence wherever they document a sensor or an actuator", () => {
    const tiles = arcadeCatalogParsed().packs.flatMap((pack) => pack.tiles);
    for (const kind of ["sensor", "actuator"] as const) {
      const tileIds = new Set(
        tiles
          .filter((entry) => entry.kind === kind)
          .map((entry) => (kind === "sensor" ? mkSensorTileId(entry.name) : mkActuatorTileId(entry.name)))
      );
      const documented = pages.filter((page) => tileIds.has(page.entryTileId));
      assert.ok(documented.length > 0, `no ${kind} pages found`);
      for (const page of documented) {
        assert.match(page.markdown, ASSISTANT_FENCE_RE, `${page.file}: no assistant fence`);
      }
    }
  });

  test("hold brain fences that each parse in one of the shapes the fence grammar names", () => {
    let fences = 0;
    for (const page of pages) {
      for (const match of page.markdown.matchAll(BRAIN_FENCE_RE)) {
        fences += 1;
        assert.ok(parseBrainFence(match[1]), `${page.file}: fence ${fences} parses in no fence shape`);
      }
    }
    assert.ok(fences > 0, "no brain fences found");
  });

  test("name in their brain fences only tile ids the environment or the fence's own catalog holds", () => {
    const tileCatalog = createDocsTileCatalog(environment);
    const unresolved: string[] = [];
    for (const page of pages) {
      for (const match of page.markdown.matchAll(BRAIN_FENCE_RE)) {
        const parsed = parseBrainFence(match[1]);
        if (!parsed) continue;
        const localCatalog = buildBrainFenceCatalog(parsed.catalogEntries, environment.brainServices);
        const tileIds = parsed.kind === "tiles" ? parsed.tileIds : parsed.rules.flatMap(ruleTileIds);
        for (const tileId of tileIds) {
          if (resolveBrainFenceTiles([tileId], tileCatalog, localCatalog).length === 0) {
            unresolved.push(`${page.file}: ${tileId}`);
          }
        }
      }
    }
    assert.deepEqual(unresolved, []);
  });

  test("reference only tiles that have a docs entry", () => {
    const refs = referencesIn(pages, TILE_REF_RE);
    assert.ok(refs.length > 0, "no tile references found");
    const unresolved = refs.filter((ref) => !registry.tiles.has(ref.id)).map((ref) => `${ref.file}: ${ref.id}`);
    assert.deepEqual(unresolved, []);
  });

  test("reference only registered concept pages", () => {
    const refs = referencesIn(pages, CONCEPT_REF_RE);
    assert.ok(refs.length > 0, "no concept references found");
    const unresolved = refs.filter((ref) => !registry.concepts.has(ref.id)).map((ref) => `${ref.file}: ${ref.id}`);
    assert.deepEqual(unresolved, []);
  });
});

describe("the standalone docs route, which binds no session catalog", () => {
  test("resolves every core tile page and none of the pack's pages", () => {
    const standalone = createEditorDocsRegistry(buildAuthoringEnvironment(undefined).environment, new Set());
    for (const [tileId, entry] of standalone.tiles) {
      assert.equal(registry.tiles.has(tileId), true, `${tileId} resolves standalone and in session alike`);
      assert.equal(typeof entry.content, "string");
    }
    const resolved = pages.filter((page) => standalone.tiles.has(page.entryTileId)).map((page) => page.file);
    assert.deepEqual(resolved, []);
  });
});
