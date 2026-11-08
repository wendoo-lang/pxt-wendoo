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
          variableFactory: true,
          fields: [
            { name: "x", type: "number" },
            { name: "y", type: "number", readOnly: true },
          ],
          literals: [
            {
              key: "home",
              label: "home beacon",
              fields: [
                { name: "x", value: { t: 3, v: 0 } },
                { name: "y", value: { t: 3, v: 0 } },
              ],
            },
            { key: "east", fields: [{ name: "x", value: { t: 3, v: 3 } }] },
          ],
          label: "Beacon",
          iconUrl: "data:image/svg+xml;base64,YmVhY29u",
        },
        {
          name: "Snapshot",
          asset: "image",
          fields: [{ name: "asset", type: "string", readOnly: true }],
        },
        {
          name: "Roster",
          brain: true,
          fields: [{ name: "id", type: "string", readOnly: true }],
        },
      ],
      tiles: [
        {
          name: "sensor.beacon.reading",
          kind: "sensor",
          async: true,
          returns: "string",
          outputs: [
            { name: "position", type: "Beacon" },
            {
              name: "strength",
              type: "number",
              label: "signal strength",
              docs: "# Strength",
              iconUrl: "data:image/svg+xml;base64,c3RyZW5ndGg=",
            },
          ],
          label: "beacon reading",
          group: "Beacons",
          docs: "# Beacon reading",
          iconUrl: "data:image/svg+xml;base64,cmVhZGluZw==",
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
            {
              tileId: "modifier.loudly",
              modifier: true,
              repeated: true,
              min: 1,
              label: "nice and loud",
              iconUrl: "data:image/svg+xml;base64,bG91ZA==",
            },
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
 * A catalog whose tiles and slots carry sentence words: a sensor declaring
 * every word, a modifier slot in flat form declaring a form, a parameter
 * slot in flat form declaring a form, and a modifier slot in a call tree
 * declaring every word.
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
  it("reads the sentence words of a tile, of a modifier slot and of a parameter slot, flat or in a call tree", () => {
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
        item: {
          kind: "arg",
          tileId: "count",
          modifier: false,
          type: "number",
          anonymous: false,
          derived: false,
          language: WORDS.count,
        },
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

  it("drops a type's literal carrying no key, and a literal's field value carrying no field name or no value", () => {
    const text = JSON.stringify({
      packs: [
        {
          name: "beacon",
          types: [
            {
              name: "Beacon",
              fields: [{ name: "x", type: "number" }],
              literals: [
                { label: "keyless", fields: [{ name: "x", value: { t: 3, v: 1 } }] },
                {
                  key: "home",
                  fields: [{ value: { t: 3, v: 1 } }, { name: "x" }, { name: "x", value: { t: 3, v: 2 } }],
                },
              ],
            },
          ],
        },
      ],
    });

    const [type] = parseCatalog(text).packs[0].types;

    assert.deepEqual(type.literals, [{ key: "home", fields: [{ name: "x", value: { t: 3, v: 2 } }] }]);
  });

  it("reads a type's variable initial key, and none from a type declaring none", () => {
    const text = JSON.stringify({
      packs: [
        {
          name: "beacon",
          types: [
            {
              name: "Beacon",
              fields: [{ name: "x", type: "number" }],
              literals: [{ key: "home", fields: [{ name: "x", value: { t: 3, v: 0 } }] }],
              variableInitial: "home",
            },
            { name: "Plain", fields: [{ name: "x", type: "number" }] },
          ],
        },
      ],
    });

    const [beacon, plain] = parseCatalog(text).packs[0].types;

    assert.equal(beacon.variableInitial, "home");
    assert.equal("variableInitial" in plain, false);
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
          literals: [
            {
              key: "home",
              label: "home beacon",
              fields: [
                { name: "x", value: { t: 3, v: 0 } },
                { name: "y", value: { t: 3, v: 0 } },
              ],
            },
            { key: "east", fields: [{ name: "x", value: { t: 3, v: 3 } }] },
          ],
          label: "Beacon",
          iconUrl: "data:image/svg+xml;base64,YmVhY29u",
          variableFactory: true,
        },
        {
          name: "Snapshot",
          native: false,
          asset: "image",
          fields: [{ name: "asset", type: "string", readOnly: true }],
          literals: [],
        },
        {
          name: "Roster",
          native: false,
          brain: true,
          fields: [{ name: "id", type: "string", readOnly: true }],
          literals: [],
        },
      ],
      tiles: [
        {
          name: "sensor.beacon.reading",
          kind: "sensor",
          async: true,
          grammar: [],
          returns: "string",
          outputs: [
            { name: "position", type: "Beacon" },
            {
              name: "strength",
              type: "number",
              label: "signal strength",
              docs: "# Strength",
              iconUrl: "data:image/svg+xml;base64,c3RyZW5ndGg=",
            },
          ],
          label: "beacon reading",
          group: "Beacons",
          docs: "# Beacon reading",
          iconUrl: "data:image/svg+xml;base64,cmVhZGluZw==",
        },
      ],
      operators: [{ name: "beacon.combine", async: false, operands: ["number", "number"], returns: "number" }],
      overloads: [],
      coreTileIcons: [],
      coreTypeIcons: [],
    });
  });

  it("reads a field's accessor metadata, an empty accessor as one, and no accessor where none or a non-object is carried", () => {
    const text = JSON.stringify({
      packs: [
        {
          name: "lookout",
          types: [
            {
              name: "Spot",
              fields: [
                {
                  name: "place",
                  type: "Point",
                  accessor: {
                    label: "place",
                    group: "Spots",
                    docs: "# Place",
                    iconUrl: "data:image/svg+xml;base64,cA==",
                  },
                },
                { name: "x", type: "number", readOnly: true, accessor: {} },
                { name: "id", type: "number", readOnly: true },
                { name: "odd", type: "number", accessor: "place" },
              ],
            },
          ],
        },
      ],
    });

    const { packs, problems } = parseCatalog(text);

    assert.deepEqual(problems, []);
    assert.deepEqual(packs[0]?.types[0]?.fields, [
      {
        name: "place",
        type: "Point",
        readOnly: false,
        accessor: { label: "place", group: "Spots", docs: "# Place", iconUrl: "data:image/svg+xml;base64,cA==" },
      },
      { name: "x", type: "number", readOnly: true, accessor: {} },
      { name: "id", type: "number", readOnly: true },
      { name: "odd", type: "number", readOnly: false },
    ]);
  });

  it("reads a field's routed flag when true, and none otherwise", () => {
    const text = JSON.stringify({
      packs: [
        {
          name: "lookout",
          types: [
            {
              name: "Gauge",
              native: true,
              fields: [
                { name: "level", type: "number", routed: true },
                { name: "index", type: "number", readOnly: true },
                { name: "odd", type: "number", routed: "yes" },
              ],
            },
          ],
        },
      ],
    });

    const { packs, problems } = parseCatalog(text);

    assert.deepEqual(problems, []);
    assert.deepEqual(packs[0]?.types[0]?.fields, [
      { name: "level", type: "number", readOnly: false, routed: true },
      { name: "index", type: "number", readOnly: true },
      { name: "odd", type: "number", readOnly: false },
    ]);
  });

  it("reads a tile's inline and writable-result flags when true, and neither otherwise", () => {
    const text = JSON.stringify({
      packs: [
        {
          name: "lookout",
          tiles: [
            { name: "sensor.lookout.here", kind: "sensor", inline: true, writableResult: true, returns: "number" },
            { name: "sensor.lookout.there", kind: "sensor", inline: "yes", writableResult: false, returns: "number" },
          ],
        },
      ],
    });

    const [here, there] = parseCatalog(text).packs[0]?.tiles ?? [];

    assert.equal(here?.inline, true);
    assert.equal(here?.writableResult, true);
    assert.equal(there !== undefined && "inline" in there, false);
    assert.equal(there !== undefined && "writableResult" in there, false);
  });

  it("reads an output's writable-result flag when true, and none otherwise", () => {
    const text = JSON.stringify({
      packs: [
        {
          name: "lookout",
          tiles: [
            {
              name: "sensor.lookout.here",
              kind: "sensor",
              returns: "boolean",
              outputs: [
                { name: "open", type: "number", writableResult: true },
                { name: "shut", type: "number", writableResult: false },
                { name: "odd", type: "number", writableResult: "yes" },
                { name: "plain", type: "number" },
              ],
            },
          ],
        },
      ],
    });

    const [open, shut, odd, plain] = parseCatalog(text).packs[0]?.tiles[0]?.outputs ?? [];

    assert.equal(open?.writableResult, true);
    for (const output of [shut, odd, plain]) {
      assert.equal(output !== undefined && "writableResult" in output, false, output?.name);
    }
  });

  it("reads each pack's core tile icons in declaration order, dropping an entry missing its tile id or its icon, or no object", () => {
    const text = JSON.stringify({
      packs: [
        {
          name: "beacon",
          coreTileIcons: [
            { tileId: "tile.op->and", iconUrl: "data:image/svg+xml;base64,YW5k" },
            null,
            "tile.op->not",
            { tileId: "tile.op->or" },
            { iconUrl: "data:image/svg+xml;base64,bm9uZQ==" },
            { tileId: "tile.op->and", iconUrl: "data:image/svg+xml;base64,YWdhaW4=" },
          ],
        },
        { name: "chime" },
      ],
    });

    const { packs, problems } = parseCatalog(text);

    assert.deepEqual(problems, []);
    assert.deepEqual(packs[0].coreTileIcons, [
      { tileId: "tile.op->and", iconUrl: "data:image/svg+xml;base64,YW5k" },
      { tileId: "tile.op->and", iconUrl: "data:image/svg+xml;base64,YWdhaW4=" },
    ]);
    assert.deepEqual(packs[1].coreTileIcons, []);
  });

  it("reads each pack's core type icons in declaration order, dropping an entry missing its type or its icon, or no object", () => {
    const text = JSON.stringify({
      packs: [
        {
          name: "beacon",
          coreTypeIcons: [
            { type: "number", iconUrl: "data:image/svg+xml;base64,bnVtYmVy" },
            null,
            "boolean",
            { type: "string" },
            { iconUrl: "data:image/svg+xml;base64,bm9uZQ==" },
            { type: "number", iconUrl: "data:image/svg+xml;base64,YWdhaW4=" },
          ],
        },
        { name: "chime" },
      ],
    });

    const { packs, problems } = parseCatalog(text);

    assert.deepEqual(problems, []);
    assert.deepEqual(packs[0].coreTypeIcons, [
      { typeName: "number", iconUrl: "data:image/svg+xml;base64,bnVtYmVy" },
      { typeName: "number", iconUrl: "data:image/svg+xml;base64,YWdhaW4=" },
    ]);
    assert.deepEqual(packs[1].coreTypeIcons, []);
  });

  it("reads each pack's overloads of core operators in registration order, dropping an entry missing its name or its operator", () => {
    const text = JSON.stringify({
      packs: [
        {
          name: "beacon",
          overloads: [
            { name: "eq(Beacon,Beacon)", operator: "eq", operands: ["Beacon", "Beacon"], returns: "boolean" },
            null,
            { operator: "eq", operands: ["Beacon", "Beacon"], returns: "boolean" },
            { name: "ne(Beacon,Beacon)", operands: ["Beacon", "Beacon"], returns: "boolean" },
            { name: "not(Beacon)", operator: "not", async: true, operands: ["Beacon", 7] },
          ],
        },
        { name: "chime" },
      ],
    });

    const { packs, problems } = parseCatalog(text);

    assert.deepEqual(problems, []);
    assert.deepEqual(packs[0].overloads, [
      {
        name: "eq(Beacon,Beacon)",
        operator: "eq",
        async: false,
        operands: ["Beacon", "Beacon"],
        returns: "boolean",
      },
      { name: "not(Beacon)", operator: "not", async: true, operands: ["Beacon"] },
    ]);
    assert.deepEqual(packs[1].overloads, []);
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
          iconUrl: "data:image/svg+xml;base64,bG91ZA==",
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
