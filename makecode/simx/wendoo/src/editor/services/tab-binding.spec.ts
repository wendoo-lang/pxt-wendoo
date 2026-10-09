import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readTabProject, tabBinding } from "./tab-binding.js";

describe("tab binding", () => {
  it("reads the project the frame URL names, and none from an absent or empty parameter", () => {
    assert.equal(readTabProject("?parentOrigin=https%3A%2F%2Farcade.makecode.com&project=abc-123"), "abc-123");
    assert.equal(readTabProject("?channel=wendoo-lang%2Fpxt-wendoo"), undefined);
    assert.equal(readTabProject("?project="), undefined);
  });

  it("holds the project as its one binding for its life, whatever is saved or cleared", () => {
    const binding = tabBinding("abc-123");

    binding.save("another-token");
    binding.clear();

    assert.equal(binding.has(), true);
    assert.equal(binding.load(), "abc-123");
  });

  it("holds one binding when the frame URL names no project", () => {
    const binding = tabBinding(undefined);

    assert.equal(binding.has(), true);
    assert.equal(binding.load(), undefined);
  });
});
