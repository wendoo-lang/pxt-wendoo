import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type CreateRequest, EditorRequests } from "./editor-requests.js";

/** A create request for the type `qName`. */
function create(qName: string): CreateRequest {
  return { qName };
}

describe("EditorRequests", () => {
  it("holds a request made before any subscriber and hands it to the first to subscribe", () => {
    const requests = new EditorRequests();
    const taken: CreateRequest[] = [];

    requests.request(create("wendoo.CompiledBrainRegistration"));
    requests.take((request) => taken.push(request));

    assert.deepEqual(taken, [create("wendoo.CompiledBrainRegistration")]);
  });

  it("holds only the latest of the requests made before any subscriber", () => {
    const requests = new EditorRequests();
    const taken: CreateRequest[] = [];

    requests.request(create("first.Type"));
    requests.request(create("second.Type"));
    requests.take((request) => taken.push(request));

    assert.deepEqual(taken, [create("second.Type")]);
  });

  it("hands a held request to one subscriber only", () => {
    const requests = new EditorRequests();
    const first: CreateRequest[] = [];
    const second: CreateRequest[] = [];

    requests.request(create("wendoo.CompiledBrainRegistration"));
    const stop = requests.take((request) => first.push(request));
    stop();
    requests.take((request) => second.push(request));

    assert.deepEqual(first, [create("wendoo.CompiledBrainRegistration")]);
    assert.deepEqual(second, []);
  });

  it("hands each request made while subscribed to the subscriber at once, holding none", () => {
    const requests = new EditorRequests();
    const taken: CreateRequest[] = [];
    const later: CreateRequest[] = [];
    const stop = requests.take((request) => taken.push(request));

    requests.request(create("first.Type"));
    requests.request(create("second.Type"));
    stop();
    requests.take((request) => later.push(request));

    assert.deepEqual(taken, [create("first.Type"), create("second.Type")]);
    assert.deepEqual(later, []);
  });

  it("holds a request made after the subscriber unsubscribed for the next one", () => {
    const requests = new EditorRequests();
    const unsubscribed: CreateRequest[] = [];
    const next: CreateRequest[] = [];

    requests.take((request) => unsubscribed.push(request))();
    requests.request(create("wendoo.CompiledBrainRegistration"));
    requests.take((request) => next.push(request));

    assert.deepEqual(unsubscribed, []);
    assert.deepEqual(next, [create("wendoo.CompiledBrainRegistration")]);
  });
});
