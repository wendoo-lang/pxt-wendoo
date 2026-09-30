import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkedInText, renderVmPrograms } from "./vm-programs.js";

describe("the MakeCode VM extension's compiled programs", () => {
  for (const file of renderVmPrograms()) {
    it(`checks in ${file.path} as the compile path makes it today`, () => {
      assert.equal(checkedInText(file.path), file.text, "run `npm run gen:vm-programs` in apps/editor");
    });
  }
});
