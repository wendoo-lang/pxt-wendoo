import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATALOG_UNREADABLE, CatalogProblemCode, parseCatalog } from "./catalog.js";

/** A catalog in the VM extension serializer's grammar using flat args, a call tree, every construct and every slot option. */
const FULL_CATALOG = JSON.stringify({
  packs: [
    {
      name: "beacon",
      types: [
        {
          name: "Beacon",
          native: true,
          fields: [
            { name: "x", type: "number" },
            { name: "y", type: "number", readOnly: true },
          ],
          label: "Beacon",
          icon: "img<beacon>",
        },
      ],
      tiles: [
        {
          name: "sensor.beacon.reading",
          kind: "sensor",
          async: true,
          returns: "string",
          outputs: [{ name: "position", type: "Beacon" }],
          label: "beacon reading",
          group: "Beacons",
          docs: "# Beacon reading",
        },
      ],
      operators: [{ name: "beacon.combine", operands: ["number", "number"], returns: "number" }],
    },
    {
      name: "grammar",
      tiles: [
        {
          name: "actuator.grammar.ring",
          kind: "actuator",
          args: [
            { tileId: "times", type: "number", optional: true },
            { tileId: "modifier.loudly", modifier: true, repeated: true, min: 1, label: "nice and loud" },
            { name: "pitch", tileId: "pitch", type: "number", required: false, default: { t: 3, v: 2 } },
          ],
        },
        {
          name: "actuator.grammar.move",
          kind: "actuator",
          call: [
            {
              kind: "optional",
              item: { kind: "arg", tileId: "direction", type: "number", anonymous: true, derived: true },
            },
            {
              kind: "optional",
              item: {
                kind: "choice",
                name: "speed",
                options: [
                  { kind: "repeat", item: { kind: "arg", tileId: "slowly", modifier: true }, min: 1, max: 3 },
                  {
                    kind: "arg",
                    tileId: "speed",
                    type: "number",
                    range: { min: 0, onExceed: "clamp" },
                    unit: "px/s",
                    label: "how fast",
                  },
                ],
              },
            },
            {
              kind: "conditional",
              condition: "speed",
              // biome-ignore lint/suspicious/noThenProperty: a conditional node's branch keys are the reference call spec's then/else.
              then: { kind: "seq", items: [{ kind: "arg", tileId: "far", modifier: true }] },
              else: { kind: "bag", items: [{ kind: "arg", tileId: "near", modifier: true }] },
            },
          ],
          consumesWhenResult: "number",
        },
      ],
    },
  ],
  diagnostics: [{ code: "registration-unmapped-name", name: "x", pack: "grammar" }],
});

/** Sentence words {@link WORDED_CATALOG} declares, keyed by what declares them. */
const WORDS = {
  see: { form: "spot", frame: "state", bare: "something" },
  lion: { form: "a lion" },
  count: { form: "this many" },
  loudly: { form: "loudly", frame: "verb", bare: "always" },
} as const;

/**
 * A catalog whose tiles and modifier slots carry sentence words: a sensor
 * declaring every word, a modifier slot in flat form declaring a form, a
 * modifier slot in a call tree declaring every word, and a parameter slot
 * declaring a form, which the grammar never carries on a parameter slot.
 */
const WORDED_CATALOG = JSON.stringify({
  packs: [
    {
      name: "zoo",
      tiles: [
        {
          name: "sensor.zoo.see",
          kind: "sensor",
          args: [
            { tileId: "modifier.zoo.lion", modifier: true, optional: true, label: "lion", language: WORDS.lion },
            { tileId: "count", type: "number", optional: true, language: WORDS.count },
          ],
          returns: "boolean",
          label: "see",
          language: WORDS.see,
        },
        {
          name: "actuator.zoo.roar",
          kind: "actuator",
          call: [{ kind: "optional", item: { kind: "arg", tileId: "loudly", modifier: true, language: WORDS.loudly } }],
        },
      ],
    },
  ],
});

describe("parseCatalog", () => {
  it("reads the sentence words of a tile and of a modifier slot, flat or in a call tree, and none of a parameter slot", () => {
    const { packs, problems } = parseCatalog(WORDED_CATALOG);
    const [see, roar] = packs[0].tiles;

    assert.deepEqual(problems, []);
    assert.deepEqual(see.language, WORDS.see);
    assert.deepEqual(see.grammar, [
      {
        kind: "optional",
        item: {
          kind: "arg",
          tileId: "modifier.zoo.lion",
          modifier: true,
          anonymous: false,
          derived: false,
          label: "lion",
          language: WORDS.lion,
        },
      },
      {
        kind: "optional",
        item: { kind: "arg", tileId: "count", modifier: false, type: "number", anonymous: false, derived: false },
      },
    ]);
    assert.deepEqual(roar.grammar, [
      {
        kind: "optional",
        item: {
          kind: "arg",
          tileId: "loudly",
          modifier: true,
          anonymous: false,
          derived: false,
          language: WORDS.loudly,
        },
      },
    ]);
  });

  it("diagnoses a sentence frame it does not know, dropping only the frame and keeping the tile's grammar", () => {
    const text = JSON.stringify({
      packs: [
        {
          name: "zoo",
          tiles: [
            {
              name: "sensor.zoo.see",
              kind: "sensor",
              args: [{ tileId: "lion", modifier: true, optional: true, language: { form: "a lion", frame: "noun" } }],
              language: { form: "spot", frame: "stat", bare: "something" },
            },
          ],
        },
      ],
    });

    const parsed = parseCatalog(text);
    const see = parsed.packs[0].tiles[0];

    assert.deepEqual(parsed.problems, [
      { code: CatalogProblemCode.SENTENCE_FRAME_UNKNOWN, pack: "zoo", name: "sensor.zoo.see", token: "noun" },
      { code: CatalogProblemCode.SENTENCE_FRAME_UNKNOWN, pack: "zoo", name: "sensor.zoo.see", token: "stat" },
    ]);
    assert.deepEqual(see.language, { form: "spot", bare: "something" });
    assert.deepEqual(see.grammar, [
      {
        kind: "optional",
        item: {
          kind: "arg",
          tileId: "lion",
          modifier: true,
          anonymous: false,
          derived: false,
          language: { form: "a lion" },
        },
      },
    ]);
  });

  it("reads every pack's types, tiles and operators with their metadata", () => {
    const { packs, problems, errorCode } = parseCatalog(FULL_CATALOG);

    assert.equal(errorCode, undefined);
    assert.deepEqual(problems, []);
    assert.deepEqual(packs[0], {
      name: "beacon",
      types: [
        {
          name: "Beacon",
          native: true,
          fields: [
            { name: "x", type: "number", readOnly: false },
            { name: "y", type: "number", readOnly: true },
          ],
          label: "Beacon",
          icon: "img<beacon>",
        },
      ],
      tiles: [
        {
          name: "sensor.beacon.reading",
          kind: "sensor",
          async: true,
          grammar: [],
          returns: "string",
          outputs: [{ name: "position", type: "Beacon" }],
          label: "beacon reading",
          group: "Beacons",
          docs: "# Beacon reading",
        },
      ],
      operators: [{ name: "beacon.combine", async: false, operands: ["number", "number"], returns: "number" }],
    });
  });

  it("reads flat args as slots, wrapping an optional entry in an optional and a repeated one in a repeat", () => {
    const ring = parseCatalog(FULL_CATALOG).packs[1].tiles[0];

    assert.deepEqual(ring.grammar, [
      {
        kind: "optional",
        item: { kind: "arg", tileId: "times", modifier: false, type: "number", anonymous: false, derived: false },
      },
      {
        kind: "repeat",
        min: 1,
        item: {
          kind: "arg",
          tileId: "modifier.loudly",
          modifier: true,
          anonymous: false,
          derived: false,
          label: "nice and loud",
        },
      },
      {
        kind: "arg",
        name: "pitch",
        tileId: "pitch",
        modifier: false,
        type: "number",
        required: false,
        anonymous: false,
        default: { t: 3, v: 2 },
        derived: false,
      },
    ]);
  });

  it("reads a call tree's every construct and every slot option", () => {
    const move = parseCatalog(FULL_CATALOG).packs[1].tiles[1];

    assert.equal(move.consumesWhenResult, "number");
    assert.deepEqual(move.grammar, [
      {
        kind: "optional",
        item: { kind: "arg", tileId: "direction", modifier: false, type: "number", anonymous: true, derived: true },
      },
      {
        kind: "optional",
        item: {
          kind: "choice",
          name: "speed",
          options: [
            {
              kind: "repeat",
              item: { kind: "arg", tileId: "slowly", modifier: true, anonymous: false, derived: false },
              min: 1,
              max: 3,
            },
            {
              kind: "arg",
              tileId: "speed",
              modifier: false,
              type: "number",
              anonymous: false,
              derived: false,
              range: { min: 0, onExceed: "clamp" },
              unit: "px/s",
              label: "how fast",
            },
          ],
        },
      },
      {
        kind: "conditional",
        condition: "speed",
        // biome-ignore lint/suspicious/noThenProperty: a conditional node's branch keys are the reference call spec's then/else.
        then: {
          kind: "seq",
          items: [{ kind: "arg", tileId: "far", modifier: true, anonymous: false, derived: false }],
        },
        else: {
          kind: "bag",
          items: [{ kind: "arg", tileId: "near", modifier: true, anonymous: false, derived: false }],
        },
      },
    ]);
  });

  it("diagnoses a tile kind it does not know, keeping the tile listed", () => {
    const text =
      '{"packs":[{"name":"motion","tiles":[{"name":"move","kind":"actutor"},{"name":"stop","kind":"actuator"}]}]}';

    const parsed = parseCatalog(text);

    assert.deepEqual(parsed.problems, [
      { code: CatalogProblemCode.TILE_KIND_UNKNOWN, pack: "motion", name: "move", token: "actutor" },
    ]);
    assert.deepEqual(
      parsed.packs[0].tiles.map((tile) => tile.name),
      ["move", "stop"]
    );
  });

  it("diagnoses a tile whose registration declared no shape", () => {
    const parsed = parseCatalog('{"packs":[{"name":"motion","tiles":[{"name":"move"}]}]}');

    assert.deepEqual(parsed.problems, [
      { code: CatalogProblemCode.TILE_SHAPE_UNDECLARED, pack: "motion", name: "move" },
    ]);
  });

  it("diagnoses a grammar construct it does not know, and reads that tile with no grammar", () => {
    const text =
      '{"packs":[{"name":"motion","tiles":[{"name":"move","kind":"actuator","call":[{"kind":"optinal","item":{"kind":"arg","tileId":"x","modifier":true}}]}]}]}';

    const parsed = parseCatalog(text);

    assert.deepEqual(parsed.problems, [
      { code: CatalogProblemCode.CALL_SPEC_KIND_UNKNOWN, pack: "motion", name: "move", token: "optinal" },
    ]);
    assert.equal(parsed.packs[0].tiles[0].grammar, undefined);
  });

  it("diagnoses a range overflow behavior it does not know", () => {
    const text =
      '{"packs":[{"name":"motion","tiles":[{"name":"move","kind":"actuator","args":[{"tileId":"speed","type":"number","range":{"min":0,"onExceed":"clip"}}]}]}]}';

    assert.deepEqual(parseCatalog(text).problems, [
      { code: CatalogProblemCode.ON_EXCEED_UNKNOWN, pack: "motion", name: "move", token: "clip" },
    ]);
  });

  it("diagnoses a slot missing its tile identity as malformed", () => {
    const text = '{"packs":[{"name":"motion","tiles":[{"name":"move","kind":"actuator","args":[{"type":"number"}]}]}]}';

    assert.deepEqual(parseCatalog(text).problems, [
      { code: CatalogProblemCode.ENTRY_MALFORMED, pack: "motion", name: "move" },
    ]);
  });

  it("reads a document without packs as an empty catalog", () => {
    assert.deepEqual(parseCatalog("{}"), { packs: [], problems: [], errorCode: undefined });
    assert.deepEqual(parseCatalog("[]"), { packs: [], problems: [], errorCode: undefined });
  });

  it("drops entries without a name", () => {
    const text = '{"packs":[{"name":"motion","tiles":[42,{"kind":"actuator"},{"name":"move","kind":"actuator"}]},7]}';

    assert.deepEqual(
      parseCatalog(text).packs.map((pack) => pack.tiles.map((tile) => tile.name)),
      [["move"]]
    );
  });

  it("reports text that is not a JSON document by its stable code", () => {
    assert.deepEqual(parseCatalog("not a catalog"), { packs: [], problems: [], errorCode: CATALOG_UNREADABLE });
  });
});
