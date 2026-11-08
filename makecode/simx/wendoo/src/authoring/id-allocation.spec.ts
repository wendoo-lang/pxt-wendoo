import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MakeCodeIdManifest } from "@wendoo/makecode-session";
import { parseCatalog } from "./catalog.js";
import { allocateIds, emptyIdManifest, ID_SPACE_BASES, mergeIdManifests, sameIdManifest } from "./id-allocation.js";

/** A catalog whose two packs declare a type, tiles and an operator. */
function catalog(packs: object[]): ReturnType<typeof parseCatalog> {
  return parseCatalog(JSON.stringify({ packs }));
}

const TWO_PACKS = catalog([
  {
    name: "beacon",
    types: [
      {
        name: "Beacon",
        fields: [
          { name: "x", type: "number" },
          { name: "y", type: "number" },
        ],
      },
    ],
    tiles: [{ name: "sensor.beacon.reading", kind: "sensor" }],
    operators: [{ name: "beacon.combine", operands: ["number", "number"], returns: "number" }],
  },
  { name: "chime", tiles: [{ name: "actuator.chime.ring", kind: "actuator" }] },
]);

describe("id allocation", () => {
  it("starts every id space at the target partition's base, with nothing allocated", () => {
    assert.deepEqual(emptyIdManifest(), {
      actions: [],
      operators: [],
      types: [],
      next: { action: ID_SPACE_BASES.action, operator: ID_SPACE_BASES.operator, atom: ID_SPACE_BASES.atom },
    });
    assert.deepEqual(ID_SPACE_BASES, { action: 1024, operator: 1024, atom: 1024 });
  });

  it("allocates at first sight, in catalog order: a type's atom and fields, each tile's action id, each operator's id", () => {
    assert.deepEqual(allocateIds(emptyIdManifest(), TWO_PACKS), {
      actions: [
        { name: "sensor.beacon.reading", id: 1024 },
        { name: "actuator.chime.ring", id: 1025 },
      ],
      operators: [{ name: "beacon.combine", id: 1024 }],
      types: [{ name: "Beacon", atom: 1024, fields: ["x", "y"] }],
      next: { action: 1026, operator: 1025, atom: 1025 },
    });
  });

  it("allocates each overload of a core operator a host-function id under its name, after its pack's operators", () => {
    const allocated = allocateIds(emptyIdManifest(), TWO_PACKS);
    const extended = catalog([
      {
        name: "beacon",
        operators: [{ name: "beacon.combine", operands: ["number", "number"], returns: "number" }],
        overloads: [
          { name: "eq(Beacon,Beacon)", operator: "eq", operands: ["Beacon", "Beacon"], returns: "boolean" },
          { name: "ne(Beacon,Beacon)", operator: "ne", operands: ["Beacon", "Beacon"], returns: "boolean" },
        ],
      },
      {
        name: "chime",
        operators: [{ name: "chime.blend", operands: ["number", "number"], returns: "number" }],
      },
    ]);

    const next = allocateIds(allocated, extended);

    assert.deepEqual(next.operators, [
      { name: "beacon.combine", id: 1024 },
      { name: "eq(Beacon,Beacon)", id: 1025 },
      { name: "ne(Beacon,Beacon)", id: 1026 },
      { name: "chime.blend", id: 1027 },
    ]);
    assert.equal(next.next.operator, 1028);
    assert.equal(allocateIds(next, extended), next);
  });

  it("returns the manifest itself when the catalog names nothing new", () => {
    const allocated = allocateIds(emptyIdManifest(), TWO_PACKS);

    assert.equal(allocateIds(allocated, TWO_PACKS), allocated);
  });

  it("never renumbers: a reordered catalog keeps every id, and a reordered type keeps every field id", () => {
    const allocated = allocateIds(emptyIdManifest(), TWO_PACKS);
    const reordered = catalog([
      { name: "chime", tiles: [{ name: "actuator.chime.ring", kind: "actuator" }] },
      {
        name: "beacon",
        types: [
          {
            name: "Beacon",
            fields: [
              { name: "y", type: "number" },
              { name: "x", type: "number" },
            ],
          },
        ],
        tiles: [{ name: "sensor.beacon.reading", kind: "sensor" }],
        operators: [{ name: "beacon.combine", operands: ["number", "number"], returns: "number" }],
      },
    ]);

    assert.equal(allocateIds(allocated, reordered), allocated);
  });

  it("keeps a removed name's id and never hands it out again; a new field appends after a removed one", () => {
    const allocated = allocateIds(emptyIdManifest(), TWO_PACKS);
    const changed = catalog([
      {
        name: "beacon",
        types: [
          {
            name: "Beacon",
            fields: [
              { name: "y", type: "number" },
              { name: "z", type: "number" },
            ],
          },
        ],
        tiles: [{ name: "sensor.beacon.signal", kind: "sensor" }],
      },
    ]);

    const next = allocateIds(allocated, changed);

    assert.deepEqual(next.actions, [
      { name: "sensor.beacon.reading", id: 1024 },
      { name: "actuator.chime.ring", id: 1025 },
      { name: "sensor.beacon.signal", id: 1026 },
    ]);
    assert.deepEqual(next.types, [{ name: "Beacon", atom: 1024, fields: ["x", "y", "z"] }]);
    assert.deepEqual(next.next, { action: 1027, operator: 1025, atom: 1025 });
  });

  it("allocates above the watermark, so an id whose entry was removed by hand is never handed out again", () => {
    const handEdited: MakeCodeIdManifest = {
      actions: [],
      operators: [],
      types: [],
      next: { action: 1030, operator: 1024, atom: 1024 },
    };

    assert.deepEqual(allocateIds(handEdited, TWO_PACKS).actions, [
      { name: "sensor.beacon.reading", id: 1030 },
      { name: "actuator.chime.ring", id: 1031 },
    ]);
  });

  it("allocates above every id an entry holds even when the watermark lags behind it", () => {
    const lagging: MakeCodeIdManifest = {
      actions: [{ name: "actuator.old", id: 1040 }],
      operators: [],
      types: [],
      next: { action: 1024, operator: 1024, atom: 1024 },
    };

    assert.deepEqual(allocateIds(lagging, TWO_PACKS).actions.slice(1), [
      { name: "sensor.beacon.reading", id: 1041 },
      { name: "actuator.chime.ring", id: 1042 },
    ]);
  });

  it("allocates an id for a tile it cannot make a tile of, since the program binds by name", () => {
    const broken = catalog([{ name: "motion", tiles: [{ name: "move", kind: "actutor" }] }]);

    assert.deepEqual(allocateIds(emptyIdManifest(), broken).actions, [{ name: "move", id: 1024 }]);
  });
});

describe("id manifest adoption", () => {
  const project: MakeCodeIdManifest = {
    actions: [{ name: "a", id: 1024 }],
    operators: [],
    types: [{ name: "T", atom: 1024, fields: ["x"] }],
    next: { action: 1025, operator: 1024, atom: 1025 },
  };

  it("adopts the project's manifest when the editor holds none", () => {
    assert.deepEqual(mergeIdManifests(project, undefined), project);
    assert.deepEqual(mergeIdManifests(null, undefined), emptyIdManifest());
  });

  it("lets the project's entries win, keeping the editor's other entries whose ids the project leaves free", () => {
    const held: MakeCodeIdManifest = {
      actions: [
        { name: "a", id: 1030 },
        { name: "b", id: 1025 },
        { name: "c", id: 1024 },
      ],
      operators: [{ name: "op", id: 1024 }],
      types: [
        { name: "T", atom: 1024, fields: ["x", "y"] },
        { name: "U", atom: 1025, fields: [] },
      ],
      next: { action: 1031, operator: 1025, atom: 1026 },
    };

    assert.deepEqual(mergeIdManifests(project, held), {
      actions: [
        { name: "a", id: 1024 },
        { name: "b", id: 1025 },
      ],
      operators: [{ name: "op", id: 1024 }],
      types: [
        { name: "T", atom: 1024, fields: ["x", "y"] },
        { name: "U", atom: 1025, fields: [] },
      ],
      next: { action: 1031, operator: 1025, atom: 1026 },
    });
  });

  it("compares manifests entry for entry", () => {
    assert.equal(sameIdManifest(project, structuredClone(project)), true);
    assert.equal(sameIdManifest(project, { ...project, next: { ...project.next, action: 1026 } }), false);
  });
});
