import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATALOG_UNREADABLE, parseCatalog } from "./catalog.js";

describe("parseCatalog", () => {
  it("reads packs and their tiles, keeping declared kinds", () => {
    const text =
      '{"packs":[{"name":"motion","tiles":[{"name":"move","kind":"actuator"},{"name":"heading"}]},{"name":"empty"}]}';

    assert.deepEqual(parseCatalog(text), {
      packs: [
        {
          name: "motion",
          tiles: [
            { name: "move", kind: "actuator" },
            { name: "heading", kind: undefined },
          ],
        },
        { name: "empty", tiles: [] },
      ],
      errorCode: undefined,
    });
  });

  it("reads a document without packs as an empty catalog", () => {
    assert.deepEqual(parseCatalog("{}"), { packs: [], errorCode: undefined });
    assert.deepEqual(parseCatalog("[]"), { packs: [], errorCode: undefined });
  });

  it("drops entries without the declared shape", () => {
    const text = '{"packs":[{"name":"motion","tiles":[42,{"kind":"actuator"},{"name":"move"}]},7]}';

    assert.deepEqual(parseCatalog(text), {
      packs: [{ name: "motion", tiles: [{ name: "move", kind: undefined }] }],
      errorCode: undefined,
    });
  });

  it("reports text that is not a JSON document by its stable code", () => {
    assert.deepEqual(parseCatalog("not a catalog"), { packs: [], errorCode: CATALOG_UNREADABLE });
  });
});
