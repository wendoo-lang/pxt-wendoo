import type { ProjectAssetsProvider } from "../project-assets.js";
import type { ProjassetsErrorCode, ProjassetsImage, ProjassetsKind, ProjassetsListing } from "../vendor/projassets.js";
import { ProjassetsError } from "../vendor/projassets.js";
import { encodeImageHex, hexToBase64, pixelImage } from "./image-buffer-encoder.js";

/** An image as the provider lists it: `id` and `displayName` as given, its pixels the 4-bit `rows`. */
export function listedImage(id: string, rows: number[][], displayName?: string): ProjassetsImage {
  const image: ProjassetsImage = {
    kind: "image",
    id,
    width: rows[0].length,
    height: rows.length,
    data: hexToBase64(encodeImageHex(pixelImage(4, rows))),
  };
  if (displayName !== undefined) image.displayName = displayName;
  return image;
}

/**
 * The editor's asset provider as a simulator extension's projassets client
 * reaches it, driven by a spec in place of MakeCode. Until {@link answer} is
 * called it answers nothing, as an editor that has not replied yet: every
 * request stays pending.
 */
export class FakeAssetProvider implements ProjectAssetsProvider {
  /** The images the project holds, as the provider lists them. */
  images: ProjassetsImage[] = [];
  /** The project's palette, as the provider lists it. */
  palette: string[] = ["#000000", "#ffffff", "#ff2121", "#ff93c4"];
  /** The kind of every list request received, in order. */
  readonly listed: ProjassetsKind[] = [];
  /** How many subscribe requests were received. */
  subscribes = 0;
  private _answering = false;
  private readonly _listFailures: ProjassetsErrorCode[] = [];
  private readonly _subscribeFailures: ProjassetsErrorCode[] = [];
  private readonly _changeListeners: (() => void)[] = [];
  private readonly _requestWatchers = new Set<() => void>();

  /** Starts answering requests, including those already pending. */
  answer(): void {
    this._answering = true;
    for (const watcher of [...this._requestWatchers]) watcher();
  }

  /** Refuses the next list requests, one per code, in order, before answering again. */
  failLists(...codes: ProjassetsErrorCode[]): void {
    this._listFailures.push(...codes);
  }

  /** Refuses the next subscribe requests, one per code, in order, before answering again. */
  failSubscribes(...codes: ProjassetsErrorCode[]): void {
    this._subscribeFailures.push(...codes);
  }

  /** Notifies every acknowledged subscription that the project changed. */
  change(): void {
    for (const listener of this._changeListeners) listener();
  }

  /** How many subscriptions the provider has acknowledged. */
  get subscriptions(): number {
    return this._changeListeners.length;
  }

  list(kind: ProjassetsKind): Promise<ProjassetsListing> {
    this.listed.push(kind);
    const failure = this._listFailures.shift();
    if (failure !== undefined) return Promise.reject(new ProjassetsError(failure, `list refused with ${failure}`));
    return this.whenAnswering().then(() => ({
      assets: this.images.map((image) => ({ ...image })),
      palette: [...this.palette],
    }));
  }

  subscribe(onChange: () => void): Promise<void> {
    this.subscribes++;
    const failure = this._subscribeFailures.shift();
    if (failure !== undefined) return Promise.reject(new ProjassetsError(failure, `subscribe refused with ${failure}`));
    return this.whenAnswering().then(() => {
      this._changeListeners.push(onChange);
    });
  }

  /** Resolves once the provider answers requests. */
  private whenAnswering(): Promise<void> {
    if (this._answering) return Promise.resolve();
    return new Promise((resolve) => {
      const watcher = (): void => {
        this._requestWatchers.delete(watcher);
        resolve();
      };
      this._requestWatchers.add(watcher);
    });
  }
}
