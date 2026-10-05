import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enrichCatalogIcons } from "./catalog-icons.js";
import { decodeImageHex, ImageBufferErrorCode } from "./image-buffer.js";
import type { SimxLog } from "./simx-bridge.js";
import { imageSvg } from "./svg-image.js";

const PALETTE = ["#000000", "#ffffff", "#ff2121"];

/** A 4-bit icon, 1 wide and 2 tall: index 1 above index 2. */
const ICON_A = "870401000200000021000000";
/** A 1-bit icon, 1 wide and 1 tall, its pixel set. */
const ICON_B = "870101000100000001";

/** A log recording every line written to it, by level. */
class RecordingLog implements SimxLog {
  readonly infos: string[] = [];
  readonly errors: string[] = [];

  info(message: string): void {
    this.infos.push(message);
  }

  error(message: string): void {
    this.errors.push(message);
  }
}

/** The data URI the catalog carries for the icon `hex` under `palette`. */
function iconUrl(hex: string, palette: readonly string[]): string {
  const reading = decodeImageHex(hex);
  assert.ok(reading.image);
  return imageSvg(reading.image, palette).url;
}

/** A catalog whose type, tile, flat slot and grammar slot carry icons, each written as `icon`. */
function catalogWithIcons(icons: { type: string; tile: string; slot: string; node: string }): string {
  return JSON.stringify({
    packs: [
      {
        name: "arcade",
        types: [{ name: "Image", fields: [], icon: icons.type }],
        tiles: [
          {
            name: "sensor.arcade.dpad",
            kind: "sensor",
            args: [{ name: "up", tileId: "modifier.up", modifier: true, label: "up", icon: icons.slot }],
            label: "dpad",
            icon: icons.tile,
          },
          {
            name: "actuator.arcade.move",
            kind: "actuator",
            call: [
              {
                kind: "choice",
                name: "dir",
                options: [{ kind: "arg", name: "left", tileId: "modifier.left", modifier: true, icon: icons.node }],
              },
            ],
          },
        ],
      },
    ],
  });
}

describe("catalog icon enrichment", () => {
  it("renders every icon to an iconUrl in the icon's place, leaving no icon text behind", () => {
    const log = new RecordingLog();
    const raw = catalogWithIcons({ type: ICON_A, tile: ICON_A, slot: ICON_B, node: ICON_B });
    const enriched = enrichCatalogIcons(raw, PALETTE, log);
    const a = iconUrl(ICON_A, PALETTE);
    const b = iconUrl(ICON_B, PALETTE);
    const expected = JSON.parse(raw.replaceAll('"icon":', '"iconUrl":'), (_key, value: unknown) => {
      if (value === ICON_A) return a;
      if (value === ICON_B) return b;
      return value;
    }) as unknown;
    assert.equal(enriched, JSON.stringify(expected));
    assert.equal(enriched.includes('"icon"'), false);
    assert.deepEqual(log.errors, []);
  });

  it("renders the same catalog and palette to the same text every time", () => {
    const raw = catalogWithIcons({ type: ICON_A, tile: ICON_B, slot: ICON_A, node: ICON_B });
    assert.equal(
      enrichCatalogIcons(raw, PALETTE, new RecordingLog()),
      enrichCatalogIcons(raw, PALETTE, new RecordingLog())
    );
  });

  it("colors the icons from the palette it is given", () => {
    const raw = catalogWithIcons({ type: ICON_A, tile: ICON_A, slot: ICON_A, node: ICON_A });
    const recolored = ["#000000", "#00aa00", "#0000aa"];
    const enriched = JSON.parse(enrichCatalogIcons(raw, recolored, new RecordingLog())) as {
      packs: { tiles: { iconUrl?: string }[] }[];
    };
    assert.equal(enriched.packs[0].tiles[0].iconUrl, iconUrl(ICON_A, recolored));
  });

  it("writes an icon it cannot read without an iconUrl and logs it once by code, and renders the rest", () => {
    const log = new RecordingLog();
    const raw = catalogWithIcons({ type: ICON_A, tile: "8805", slot: ICON_B, node: ICON_B });
    const enriched = JSON.parse(enrichCatalogIcons(raw, PALETTE, log)) as {
      packs: { types: Record<string, unknown>[]; tiles: Record<string, unknown>[] }[];
    };
    const tile = enriched.packs[0].tiles[0];
    assert.equal("icon" in tile, false);
    assert.equal("iconUrl" in tile, false);
    assert.equal(tile.label, "dpad");
    assert.equal(enriched.packs[0].types[0].iconUrl, iconUrl(ICON_A, PALETTE));
    assert.equal(log.errors.length, 1);
    assert.ok(log.errors[0].startsWith(`${ImageBufferErrorCode.MAGIC_UNKNOWN}: `));
    assert.ok(log.errors[0].includes("sensor.arcade.dpad"));
  });

  it("names a core tile icon entry it cannot read by its tile id, and a core type icon entry by its type", () => {
    const log = new RecordingLog();
    const raw = JSON.stringify({
      packs: [
        {
          name: "arcade",
          coreTileIcons: [{ tileId: "tile.op->and", icon: "8805" }],
          coreTypeIcons: [{ type: "number", icon: "8805" }],
        },
      ],
    });
    enrichCatalogIcons(raw, PALETTE, log);
    assert.equal(log.errors.length, 2);
    assert.ok(log.errors[0].includes("arcade/tile.op->and"));
    assert.ok(log.errors[1].includes("arcade/number"));
  });

  it("writes every icon without an iconUrl, logging nothing, while no palette is known", () => {
    const log = new RecordingLog();
    const raw = catalogWithIcons({ type: ICON_A, tile: ICON_A, slot: ICON_B, node: "zz" });
    const enriched = enrichCatalogIcons(raw, undefined, log);
    assert.equal(enriched.includes('"icon"'), false);
    assert.equal(enriched.includes('"iconUrl"'), false);
    assert.deepEqual(log.errors, []);
  });

  it("passes a catalog carrying no icon through verbatim, and text that is no JSON document unchanged", () => {
    const log = new RecordingLog();
    const plain = '{"packs":[{"name":"beacon","tiles":[{"name":"say","docs":"caf\\u00e9"}]}]}';
    assert.equal(enrichCatalogIcons(plain, PALETTE, log), plain);
    const notJson = '{"packs": [ "icon": "87\t';
    assert.equal(enrichCatalogIcons(notJson, PALETTE, log), notJson);
    assert.deepEqual(log.errors, []);
  });
});
