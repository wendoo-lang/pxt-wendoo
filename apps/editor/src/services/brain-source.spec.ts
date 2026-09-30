import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrainDef, encodePersistedBrainJson } from "@wendoo/core/app";
import { buildAuthoringEnvironment } from "./authoring-environment.js";
import { BRAIN_SOURCE_NAMESPACE, brainSourceHash, readBrainSource, serializeBrainSource } from "./brain-source.js";

describe("brain source", () => {
  it("serializes a brain as its upstream persisted brain JSON", () => {
    const { environment } = buildAuthoringEnvironment(undefined);
    const definition = BrainDef.emptyBrainDef(environment.brainServices, "Chaser");

    const source = serializeBrainSource(definition);

    assert.deepEqual(JSON.parse(source), encodePersistedBrainJson(definition, BRAIN_SOURCE_NAMESPACE));
  });

  it("reads a source back into a document with the same id, in the environment given", () => {
    const authored = buildAuthoringEnvironment(undefined).environment;
    const reading = buildAuthoringEnvironment(undefined).environment;
    const definition = BrainDef.emptyBrainDef(authored.brainServices, "Chaser");
    const source = serializeBrainSource(definition);

    const read = readBrainSource(reading, source);

    assert.equal(read.id(), definition.id());
    assert.equal(read.servicesTypeRegistry(), reading.brainServices.runtime.types);
    assert.equal(serializeBrainSource(read), source);
  });

  it("hashes a source to eight lowercase hex digits, the same for the same text", () => {
    const hash = brainSourceHash('{"name":"Chaser"}');

    assert.match(hash, /^[0-9a-f]{8}$/);
    assert.equal(brainSourceHash('{"name":"Chaser"}'), hash);
  });

  it("hashes texts differing in one character differently", () => {
    assert.notEqual(brainSourceHash('{"name":"Chaser"}'), brainSourceHash('{"name":"Chasex"}'));
  });
});
