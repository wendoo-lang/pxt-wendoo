import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type EditorRequest, EditorRequests } from "./editor-requests.js";

/** A create request for the type `qName`. */
function create(qName: string): EditorRequest {
  return { kind: "create", qName };
}

/** An open request for the instance `qName`. */
function open(qName: string): EditorRequest {
  return { kind: "open", qName };
}

describe("EditorRequests", () => {
  it("holds a request made before any subscriber and hands it to the first to subscribe", () => {
    const requests = new EditorRequests();
    const taken: EditorRequest[] = [];

    requests.request(create("wendoo.CompiledBrainRegistration"));
    requests.take((request) => taken.push(request));

    assert.deepEqual(taken, [create("wendoo.CompiledBrainRegistration")]);
  });

  it("holds only the latest of the requests made before any subscriber", () => {
    const requests = new EditorRequests();
    const taken: EditorRequest[] = [];

    requests.request(create("first.Type"));
    requests.request(create("second.Type"));
    requests.take((request) => taken.push(request));

    assert.deepEqual(taken, [create("second.Type")]);
  });

  it("hands a held request to one subscriber only", () => {
    const requests = new EditorRequests();
    const first: EditorRequest[] = [];
    const second: EditorRequest[] = [];

    requests.request(create("wendoo.CompiledBrainRegistration"));
    const stop = requests.take((request) => first.push(request));
    stop();
    requests.take((request) => second.push(request));

    assert.deepEqual(first, [create("wendoo.CompiledBrainRegistration")]);
    assert.deepEqual(second, []);
  });

  it("hands each request made while subscribed to the subscriber at once, holding none", () => {
    const requests = new EditorRequests();
    const taken: EditorRequest[] = [];
    const later: EditorRequest[] = [];
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
    const unsubscribed: EditorRequest[] = [];
    const next: EditorRequest[] = [];

    requests.take((request) => unsubscribed.push(request))();
    requests.request(create("wendoo.CompiledBrainRegistration"));
    requests.take((request) => next.push(request));

    assert.deepEqual(unsubscribed, []);
    assert.deepEqual(next, [create("wendoo.CompiledBrainRegistration")]);
  });

  it("holds an open request made before any subscriber and hands it to the first to subscribe", () => {
    const requests = new EditorRequests();
    const taken: EditorRequest[] = [];

    requests.request(open("wendooBrains.p_abcdabcdabcdabcd"));
    requests.take((request) => taken.push(request));

    assert.deepEqual(taken, [open("wendooBrains.p_abcdabcdabcdabcd")]);
  });

  it("holds the latest request of either kind, an open replacing a held create and a create a held open", () => {
    const openLast = new EditorRequests();
    const createLast = new EditorRequests();
    const openTaken: EditorRequest[] = [];
    const createTaken: EditorRequest[] = [];

    openLast.request(create("wendoo.CompiledBrainRegistration"));
    openLast.request(open("wendooBrains.p_abcdabcdabcdabcd"));
    openLast.take((request) => openTaken.push(request));
    createLast.request(open("wendooBrains.p_abcdabcdabcdabcd"));
    createLast.request(create("wendoo.CompiledBrainRegistration"));
    createLast.take((request) => createTaken.push(request));

    assert.deepEqual(openTaken, [open("wendooBrains.p_abcdabcdabcdabcd")]);
    assert.deepEqual(createTaken, [create("wendoo.CompiledBrainRegistration")]);
  });
});
