import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  MakeCodeAsset,
  MakeCodeBrainsChannel,
  MakeCodeEditorSession,
  MakeCodeEditorSessionState,
  MakeCodeProjectInfo,
} from "@wendoo/makecode-session";
import { EditorSessionStore } from "./editor-session-store.js";

/** An editor session driven by the spec in place of a real one. */
class FakeSession implements MakeCodeEditorSession {
  started = 0;
  stopped = 0;
  state: MakeCodeEditorSessionState = { status: "disconnected", errorCode: undefined, target: undefined };
  private readonly _stateListeners = new Set<(state: MakeCodeEditorSessionState) => void>();
  private readonly _catalogListeners = new Set<(content: string) => void>();
  private readonly _assetsListeners = new Set<(assets: MakeCodeAsset[]) => void>();
  private readonly _projectInfoListeners = new Set<(info: MakeCodeProjectInfo) => void>();
  private readonly _brainsChannelListeners = new Set<(channel: MakeCodeBrainsChannel) => void>();

  onStateChange(listener: (state: MakeCodeEditorSessionState) => void): () => void {
    this._stateListeners.add(listener);
    return () => {
      this._stateListeners.delete(listener);
    };
  }

  onCatalog(listener: (content: string) => void): () => void {
    this._catalogListeners.add(listener);
    return () => {
      this._catalogListeners.delete(listener);
    };
  }

  onAssets(listener: (assets: MakeCodeAsset[]) => void): () => void {
    this._assetsListeners.add(listener);
    return () => {
      this._assetsListeners.delete(listener);
    };
  }

  onProjectInfo(listener: (info: MakeCodeProjectInfo) => void): () => void {
    this._projectInfoListeners.add(listener);
    return () => {
      this._projectInfoListeners.delete(listener);
    };
  }

  onBrainsChannel(listener: (channel: MakeCodeBrainsChannel) => void): () => void {
    this._brainsChannelListeners.add(listener);
    return () => {
      this._brainsChannelListeners.delete(listener);
    };
  }

  start(): void {
    this.started += 1;
  }

  stop(): void {
    this.stopped += 1;
  }

  /** The session's state changing by `fields`, reported to its listeners. */
  set(fields: Partial<MakeCodeEditorSessionState>): void {
    this.state = { ...this.state, ...fields };
    for (const listener of this._stateListeners) listener(this.state);
  }

  /** A catalog arriving from the counterpart. */
  deliver(content: string): void {
    for (const listener of this._catalogListeners) listener(content);
  }

  /** An asset snapshot arriving from the counterpart. */
  deliverAssets(assets: MakeCodeAsset[]): void {
    for (const listener of this._assetsListeners) listener(assets);
  }

  /** A reading of the project's facts arriving from the counterpart. */
  deliverProjectInfo(info: MakeCodeProjectInfo): void {
    for (const listener of this._projectInfoListeners) listener(info);
  }

  /** A makecode handshake completing, handing out `channel`. */
  handshake(channel: MakeCodeBrainsChannel): void {
    for (const listener of this._brainsChannelListeners) listener(channel);
  }
}

/** One image asset, as a snapshot lists it. */
const IMAGE_ASSET: MakeCodeAsset = {
  kind: "image",
  id: "img1",
  name: "hero",
  width: 16,
  height: 16,
  previewUrl: "data:,",
};

/** A brains channel whose requests never settle, recording the removals pushed on it. */
function idleChannel(): MakeCodeBrainsChannel & { removed: string[] } {
  const removed: string[] = [];
  return {
    removed,
    listBrains: () => new Promise(() => {}),
    pullBrains: () => new Promise(() => {}),
    pushBrain: (push) => {
      if (push.op === "remove") removed.push(push.brainId);
      return new Promise(() => {});
    },
    readManifest: () => new Promise(() => {}),
    writeManifest: () => new Promise(() => {}),
  };
}

/** A store over a fresh fake session, started, with that session. */
function startedStore(): { store: EditorSessionStore; session: FakeSession } {
  const session = new FakeSession();
  const store = new EditorSessionStore(session);
  store.start();
  return { store, session };
}

describe("editor session store", () => {
  it("starts the session it follows, reporting it disconnected until it connects", () => {
    const session = new FakeSession();
    const store = new EditorSessionStore(session);
    assert.equal(session.started, 0);

    store.start();

    assert.equal(session.started, 1);
    assert.equal(store.getSnapshot().status, "disconnected");
    session.set({ status: "connected" });
    assert.equal(store.getSnapshot().status, "connected");
  });

  it("records whether the session has connected, kept across disconnections", () => {
    const { store, session } = startedStore();
    assert.equal(store.getSnapshot().connectedSinceOpen, false);

    session.set({ status: "connected" });
    assert.equal(store.getSnapshot().connectedSinceOpen, true);

    session.set({ status: "disconnected" });
    assert.equal(store.getSnapshot().connectedSinceOpen, true);
  });

  it("keeps the latest catalog across a disconnection", () => {
    const { store, session } = startedStore();
    session.set({ status: "connected" });

    session.deliver('{"packs":[]}');
    session.set({ status: "disconnected" });

    assert.equal(store.getSnapshot().catalogText, '{"packs":[]}');
  });

  it("holds the latest asset snapshot, none before the first arrives", () => {
    const { store, session } = startedStore();
    session.set({ status: "connected" });
    assert.equal(store.getSnapshot().assets, undefined);

    const first = [IMAGE_ASSET];
    const second = [IMAGE_ASSET, { ...IMAGE_ASSET, id: "img2" }];
    session.deliverAssets(first);
    assert.equal(store.getSnapshot().assets, first);
    session.deliverAssets(second);

    assert.equal(store.getSnapshot().assets, second);
  });

  it("keeps the latest asset snapshot across a disconnection", () => {
    const { store, session } = startedStore();
    session.set({ status: "connected" });
    const assets = [IMAGE_ASSET];
    session.deliverAssets(assets);

    session.set({ status: "disconnected" });

    assert.equal(store.getSnapshot().assets, assets);
  });

  it("holds the latest project name the MakeCode side published, none before the first arrives", () => {
    const { store, session } = startedStore();
    session.set({ status: "connected" });
    assert.equal(store.getSnapshot().projectName, undefined);

    session.deliverProjectInfo({ name: "My Platformer" });
    assert.equal(store.getSnapshot().projectName, "My Platformer");
  });

  it("publishes a rename, notifying subscribers", () => {
    const { store, session } = startedStore();
    session.set({ status: "connected" });
    session.deliverProjectInfo({ name: "My Platformer" });
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });

    session.deliverProjectInfo({ name: "Space Chase" });

    assert.equal(store.getSnapshot().projectName, "Space Chase");
    assert.equal(notified, 1);
  });

  it("keeps the project name across a disconnection", () => {
    const { store, session } = startedStore();
    session.set({ status: "connected" });
    session.deliverProjectInfo({ name: "My Platformer" });

    session.set({ status: "disconnected" });

    assert.equal(store.getSnapshot().projectName, "My Platformer");
  });

  it("exposes the MakeCode target the session reports, unknown while it reports none", () => {
    const { store, session } = startedStore();
    assert.equal(store.getSnapshot().target, undefined);

    session.set({ status: "connected", target: "microbit" });
    assert.equal(store.getSnapshot().target, "microbit");

    session.set({ status: "disconnected" });
    assert.equal(store.getSnapshot().target, "microbit");

    session.set({ status: "connected", target: undefined });
    assert.equal(store.getSnapshot().target, undefined);
  });

  it("stops the session's connection", () => {
    const { store, session } = startedStore();

    store.stop();

    assert.equal(session.stopped, 1);
  });

  it("hands out each handshake's brains channel as the session delivers it", () => {
    const { store, session } = startedStore();
    const channels: MakeCodeBrainsChannel[] = [];
    store.onBrainsChannel((channel) => {
      channels.push(channel);
    });
    const first = idleChannel();
    const second = idleChannel();

    session.handshake(first);
    session.handshake(second);

    assert.deepEqual(channels, [first, second]);
    void channels[0]?.pushBrain({ op: "remove", brainId: "abcdabcdabcdabcd" });
    assert.deepEqual(first.removed, ["abcdabcdabcdabcd"]);
  });
});
