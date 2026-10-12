import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { MakeCodeAsset } from "@wendoo/makecode-session";
import type { ProjassetsErrorCode } from "../vendor/projassets.js";
import { ImageBufferErrorCode } from "./image-buffer.js";
import { ProjectAssets } from "./project-assets.js";
import type { SimxLog } from "./simx-bridge.js";
import { imageSvg, SvgImageProblemCode } from "./svg-image.js";
import { FakeAssetProvider, listedImage, listedSong } from "./test-support/asset-provider.js";
import { hexToBase64, pixelImage } from "./test-support/image-buffer-encoder.js";

/** Retry and debounce timings short enough for specs, in milliseconds. */
const TIMINGS = { retryDelayMs: 2, maxRetryDelayMs: 8, debounceMs: 5 };

/** How long a wait in these specs lasts before it fails, in milliseconds. */
const WAIT_MS = 2000;

/** Resolves or rejects as `promise` does; rejects naming `what` when `promise` has not settled within {@link WAIT_MS}. */
function within<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timed out waiting for ${what}`));
    }, WAIT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/** Resolves after `ms` milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** A log recording every line written to it, by level. */
class RecordingLog implements SimxLog {
  readonly infos: string[] = [];
  readonly errors: string[] = [];

  info(message: string): void {
    this.infos.push(message);
  }

  error(message: string): void {
    this.errors.push(message);
  }
}

/** The preview the snapshot carries for 4-bit `rows` under `palette`. */
function previewOf(rows: number[][], palette: readonly string[]): string {
  return imageSvg(pixelImage(4, rows), palette).url;
}

describe("project assets", () => {
  let provider: FakeAssetProvider;
  let log: RecordingLog;
  let assets: ProjectAssets | undefined;

  beforeEach(() => {
    provider = new FakeAssetProvider();
    log = new RecordingLog();
  });

  afterEach(() => {
    assets?.dispose();
    assets = undefined;
  });

  function start(): ProjectAssets {
    assets = new ProjectAssets(provider, log, TIMINGS);
    return assets;
  }

  /** Resolves with the next snapshot `subject` announces. */
  function nextSnapshot(subject: ProjectAssets): Promise<readonly MakeCodeAsset[]> {
    return within(
      new Promise((resolve) => {
        const unsubscribe = subject.onSnapshot((snapshot) => {
          unsubscribe();
          resolve(snapshot);
        });
      }),
      "a snapshot"
    );
  }

  /** Resolves with the next project name `subject` announces. */
  function nextName(subject: ProjectAssets): Promise<string> {
    return within(
      new Promise((resolve) => {
        const unsubscribe = subject.onName((name) => {
          unsubscribe();
          resolve(name);
        });
      }),
      "a project name"
    );
  }

  it("lists the project's images and holds them as its snapshot, ordered by id, each with its kind, id, name, size and preview", async () => {
    provider.images = [listedImage("image2", [[1, 2]], "hero"), listedImage("image1", [[3], [0]])];
    provider.answer();
    const subject = start();
    const snapshot = await nextSnapshot(subject);
    assert.deepEqual(snapshot, [
      { kind: "image", id: "image1", width: 1, height: 2, previewUrl: previewOf([[3], [0]], provider.palette) },
      {
        kind: "image",
        id: "image2",
        name: "hero",
        width: 2,
        height: 1,
        previewUrl: previewOf([[1, 2]], provider.palette),
      },
    ]);
    assert.deepEqual(subject.snapshot, snapshot);
    assert.deepEqual(log.errors, []);
  });

  it("lists the project's songs beside its images, holding the images and then the songs, each kind ordered by id", async () => {
    provider.images = [listedImage("image1", [[3]])];
    provider.songs = [listedSong("song2", "theme"), listedSong("song1", "jingle")];
    provider.answer();
    const snapshot = await nextSnapshot(start());
    assert.deepEqual(snapshot, [
      { kind: "image", id: "image1", width: 1, height: 1, previewUrl: previewOf([[3]], provider.palette) },
      { kind: "song", id: "song1", name: "jingle" },
      { kind: "song", id: "song2", name: "theme" },
    ]);
    assert.deepEqual([...new Set(provider.listed)], ["image", "song"]);
    assert.deepEqual(log.errors, []);
  });

  it("holds a song with no name as its kind and id alone", async () => {
    provider.songs = [listedSong("song1")];
    provider.answer();
    const snapshot = await nextSnapshot(start());
    assert.deepEqual(snapshot, [{ kind: "song", id: "song1" }]);
  });

  it("announces a new snapshot when a song is renamed", async () => {
    provider.songs = [listedSong("song1", "theme")];
    provider.answer();
    const subject = start();
    await nextSnapshot(subject);
    await within(
      (async () => {
        while (provider.subscriptions === 0) await delay(1);
      })(),
      "the subscription"
    );
    await delay(20);
    const changed = nextSnapshot(subject);
    provider.songs = [listedSong("song1", "boss fight")];
    provider.change();
    assert.deepEqual(await changed, [{ kind: "song", id: "song1", name: "boss fight" }]);
  });

  it("holds no snapshot until the provider first answers", async () => {
    const subject = start();
    await delay(20);
    assert.equal(subject.snapshot, undefined);
    provider.images = [listedImage("image1", [[1]])];
    const arriving = nextSnapshot(subject);
    provider.answer();
    assert.equal((await arriving).length, 1);
  });

  it("leaves the editor's transparency images out of the snapshot", async () => {
    provider.images = [
      listedImage("transparency16", [[0]]),
      listedImage("image1", [[1]]),
      listedImage("transparency8", [[0]]),
    ];
    provider.answer();
    const snapshot = await nextSnapshot(start());
    assert.deepEqual(
      snapshot.map((asset) => asset.id),
      ["image1"]
    );
  });

  it("leaves out an image whose pixels it cannot read, logging its code and id, and holds the rest", async () => {
    provider.images = [
      { ...listedImage("broken", [[1]]), data: hexToBase64("88040100010000000100") },
      listedImage("image1", [[1]]),
    ];
    provider.answer();
    const snapshot = await nextSnapshot(start());
    assert.deepEqual(
      snapshot.map((asset) => asset.id),
      ["image1"]
    );
    assert.equal(log.errors.length, 1);
    assert.ok(log.errors[0].startsWith(`${ImageBufferErrorCode.MAGIC_UNKNOWN}: `));
    assert.ok(log.errors[0].includes("broken"));
  });

  it("logs an image whose pixels index colors the palette lacks by code, and holds it with those pixels unpainted", async () => {
    provider.palette = ["#000000", "#ffffff"];
    provider.images = [listedImage("image1", [[1, 7]])];
    provider.answer();
    const snapshot = await nextSnapshot(start());
    assert.equal(snapshot[0].previewUrl, previewOf([[1, 7]], ["#000000", "#ffffff"]));
    assert.equal(log.errors.length, 1);
    assert.ok(log.errors[0].startsWith(`${SvgImageProblemCode.COLOR_OUTSIDE_PALETTE}: `));
    assert.ok(log.errors[0].includes("image1"));
  });

  it("re-lists on each change the provider reports, announcing a snapshot only when it differs from the last", async () => {
    provider.images = [listedImage("image1", [[1]])];
    provider.answer();
    const subject = start();
    await nextSnapshot(subject);
    await within(
      (async () => {
        while (provider.subscriptions === 0) await delay(1);
      })(),
      "the subscription"
    );
    const announced: (readonly MakeCodeAsset[])[] = [];
    subject.onSnapshot((snapshot) => announced.push(snapshot));
    const listedBefore = provider.listed.length;
    provider.change();
    await delay(40);
    assert.ok(provider.listed.length > listedBefore);
    assert.equal(announced.length, 0);
    provider.images = [listedImage("image1", [[2]])];
    provider.change();
    await delay(40);
    assert.equal(announced.length, 1);
    assert.equal(announced[0][0].previewUrl, previewOf([[2]], provider.palette));
  });

  it("coalesces a burst of changes into one listing", async () => {
    provider.answer();
    const subject = start();
    await nextSnapshot(subject);
    await delay(20);
    const listedBefore = provider.listed.length;
    for (let i = 0; i < 10; i++) provider.change();
    await delay(40);
    assert.deepEqual(provider.listed.slice(listedBefore), ["image", "song"]);
  });

  it("announces the project's name on the first listing and again only when it changes", async () => {
    provider.answer();
    const subject = start();
    assert.equal(subject.name, undefined);
    assert.equal(await nextName(subject), provider.name);
    assert.equal(subject.name, provider.name);
    await delay(20);
    const announced: string[] = [];
    subject.onName((name) => announced.push(name));
    provider.change();
    await delay(40);
    assert.deepEqual(announced, []);
    provider.name = "Space Chase";
    provider.change();
    await delay(40);
    assert.deepEqual(announced, ["Space Chase"]);
    assert.equal(subject.name, "Space Chase");
  });

  it("keeps retrying a refused or failed listing at a bounded rate until it succeeds, logging each by code and context", async () => {
    const refusals: ProjassetsErrorCode[] = [
      "FAILED",
      "PROJECT_CLOSED",
      "FAILED",
      "FAILED",
      "FAILED",
      "FAILED",
      "FAILED",
    ];
    provider.failLists("image", ...refusals);
    provider.images = [listedImage("image1", [[1]])];
    provider.answer();
    const snapshot = await nextSnapshot(start());
    assert.equal(snapshot.length, 1);
    const listingErrors = log.errors.filter((line) => line.includes("listing the project's images"));
    assert.deepEqual(
      listingErrors.map((line) => line.slice(0, line.indexOf(":"))),
      refusals
    );
  });

  it("keeps retrying a refused subscription until it is acknowledged, then hears changes", async () => {
    provider.failSubscribes("FAILED", "PROJECT_CLOSED", "FAILED");
    provider.answer();
    const subject = start();
    await within(
      (async () => {
        while (provider.subscriptions === 0) await delay(1);
      })(),
      "the subscription"
    );
    assert.equal(provider.subscribes, 4);
    assert.equal(log.errors.filter((line) => line.includes("subscribing to the project's assets")).length, 3);
    await delay(20);
    provider.images = [listedImage("image1", [[3]])];
    const changed = nextSnapshot(subject);
    provider.change();
    assert.equal((await changed)[0].previewUrl, previewOf([[3]], provider.palette));
  });

  it("keeps retrying a refused or failed song listing at a bounded rate, logging each by code and kind, and holds no snapshot until it succeeds", async () => {
    const refusals: ProjassetsErrorCode[] = ["FAILED", "PROJECT_CLOSED", "FAILED", "FAILED", "FAILED"];
    provider.failLists("song", ...refusals);
    provider.images = [listedImage("image1", [[1]])];
    provider.songs = [listedSong("song1", "theme")];
    provider.answer();
    const snapshot = await nextSnapshot(start());
    assert.deepEqual(
      snapshot.map((asset) => [asset.kind, asset.id]),
      [
        ["image", "image1"],
        ["song", "song1"],
      ]
    );
    const songErrors = log.errors.filter((line) => line.includes("listing the project's songs"));
    assert.deepEqual(
      songErrors.map((line) => line.slice(0, line.indexOf(":"))),
      refusals
    );
    assert.equal(log.errors.length, refusals.length);
  });

  it("leaves songs out for good once their listing is refused for good, logging the code once, and holds the images", async () => {
    provider.failLists("song", "UNSUPPORTED_KIND");
    provider.images = [listedImage("image1", [[1]])];
    provider.songs = [listedSong("song1", "theme")];
    provider.answer();
    const subject = start();
    const snapshot = await nextSnapshot(subject);
    assert.deepEqual(
      snapshot.map((asset) => [asset.kind, asset.id]),
      [["image", "image1"]]
    );
    await within(
      (async () => {
        while (provider.subscriptions === 0) await delay(1);
      })(),
      "the subscription"
    );
    await delay(20);
    provider.images = [listedImage("image1", [[2]])];
    const changed = nextSnapshot(subject);
    provider.change();
    assert.deepEqual(
      (await changed).map((asset) => [asset.kind, asset.id]),
      [["image", "image1"]]
    );
    assert.equal(provider.listed.filter((kind) => kind === "song").length, 1);
    assert.equal(log.errors.length, 1);
    assert.ok(log.errors[0].startsWith("UNSUPPORTED_KIND: "));
    assert.ok(log.errors[0].includes("listing the project's songs"));
  });

  for (const code of ["PERMISSION_DENIED", "UNREGISTERED"] as const) {
    it(`surfaces ${code} by code once per request and stops asking, holding no snapshot`, async () => {
      provider.failLists("image", code);
      provider.failLists("song", code);
      provider.failSubscribes(code);
      provider.answer();
      const subject = start();
      await delay(60);
      assert.deepEqual(provider.listed, ["image", "song"]);
      assert.equal(provider.subscribes, 1);
      assert.equal(subject.snapshot, undefined);
      assert.equal(log.errors.length, 3);
      assert.equal(
        log.errors.every((line) => line.startsWith(`${code}: `)),
        true
      );
    });
  }

  it("stops asking and announcing once disposed", async () => {
    provider.failLists("image", "FAILED", "FAILED", "FAILED", "FAILED", "FAILED", "FAILED", "FAILED", "FAILED");
    provider.answer();
    const subject = start();
    let announced = 0;
    subject.onSnapshot(() => announced++);
    await delay(5);
    subject.dispose();
    const listed = provider.listed.length;
    provider.change();
    await delay(60);
    assert.equal(provider.listed.length, listed);
    assert.equal(announced, 0);
  });
});
