import type { MakeCodeAsset } from "@wendoo/makecode-session";
import { decodeImageBase64 } from "./image-buffer.js";
import type { SimxLog } from "./simx-bridge.js";
import { imageSvg, SvgImageProblemCode } from "./svg-image.js";
import {
  type ProjassetsClient,
  ProjassetsError,
  type ProjassetsErrorCode,
  type ProjassetsImage,
  type ProjassetsListing,
} from "./vendor/projassets.js";

/**
 * The editor's asset provider as a {@link ProjectAssets} reads it: a
 * projassets client's listing and subscription.
 */
export type ProjectAssetsProvider = Pick<ProjassetsClient, "list" | "subscribe">;

/** Timings of a {@link ProjectAssets}, in milliseconds. Each defaults when left out. */
export interface ProjectAssetsTimings {
  /** Wait before the first retry of a failed request; each later retry waits twice the one before. Default 500. */
  retryDelayMs?: number;
  /** Longest wait between retries, kept for every retry after it is reached. Default 30000. */
  maxRetryDelayMs?: number;
  /** Window in which the provider's change reports are gathered into one listing. Default 100. */
  debounceMs?: number;
}

/** Ids of the images the editor mints for itself, such as `transparency16`; they stay out of the snapshot. */
const TRANSPARENCY_ID = /^transparency\d+$/;

/**
 * Refusals no retry can overcome while this frame lives: the editor will not
 * serve the frame, or not the request it makes.
 */
const PERMANENT_REFUSALS: ReadonlySet<ProjassetsErrorCode> = new Set<ProjassetsErrorCode>([
  "PERMISSION_DENIED",
  "UNREGISTERED",
  "UNSUPPORTED_KIND",
  "INVALID_REQUEST",
]);

/** Orders snapshot entries by id. */
function byId(a: MakeCodeAsset, b: MakeCodeAsset): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A snapshot, with the coded log line of each problem met rendering it. */
interface RenderedSnapshot {
  readonly snapshot: MakeCodeAsset[];
  readonly problems: string[];
}

/**
 * The snapshot entries of the project's `images` under `palette`, ordered by
 * id: each image's kind, id, name when it has one, size, and preview as an
 * SVG data URI, the transparency images left out. An image whose pixels
 * cannot be read is left out, and pixels the palette cannot paint are left
 * unpainted; each is reported in `problems` by code naming the image.
 */
function snapshotOf(images: readonly ProjassetsImage[], palette: readonly string[]): RenderedSnapshot {
  const snapshot: MakeCodeAsset[] = [];
  const problems: string[] = [];
  for (const image of images) {
    if (TRANSPARENCY_ID.test(image.id)) continue;
    const reading = decodeImageBase64(image.data);
    if (reading.code !== undefined) {
      problems.push(
        `${reading.code}: the project's image ${image.id} is not an image buffer; it is left out of the asset snapshot.`
      );
      continue;
    }
    const rendered = imageSvg(reading.image, palette);
    if (rendered.unpainted > 0) {
      problems.push(
        `${SvgImageProblemCode.COLOR_OUTSIDE_PALETTE}: the project's image ${image.id} indexes colors the project's palette lacks; ${rendered.unpainted} pixels are left unpainted.`
      );
    }
    snapshot.push({
      kind: "image",
      id: image.id,
      ...(image.displayName === undefined ? {} : { name: image.displayName }),
      width: reading.image.width,
      height: reading.image.height,
      previewUrl: rendered.url,
    });
  }
  return { snapshot: snapshot.sort(byId), problems };
}

/**
 * The MakeCode project's images and palette, as the editor's asset provider
 * lists them, held for publication: the asset snapshot -- every image of the
 * project with its preview rendered under the project's palette -- and the
 * palette itself.
 *
 * On construction it subscribes to the provider's change reports and lists
 * the project's images, and it lists them again once the subscription is
 * acknowledged and after each change report, the reports of one
 * {@link ProjectAssetsTimings.debounceMs} window gathered into one listing
 * and a listing asked for while one is in flight made once it settles. A
 * listing that yields a snapshot unlike the last is announced to
 * {@link onSnapshot}, and a palette unlike the last to {@link onPalette}.
 * Each image that cannot be rendered in full is logged by code when a
 * listing first meets it, and again only after a listing without it.
 *
 * A request the provider fails is logged by its code and what it was doing,
 * and retried after a wait that doubles from
 * {@link ProjectAssetsTimings.retryDelayMs} up to
 * {@link ProjectAssetsTimings.maxRetryDelayMs}, for as long as it takes. A
 * refusal no retry can overcome while the frame lives -- `PERMISSION_DENIED`,
 * `UNREGISTERED`, `UNSUPPORTED_KIND`, `INVALID_REQUEST` -- is logged by its
 * code once and not asked again. Nothing is asked or announced once
 * disposed.
 */
export class ProjectAssets {
  private readonly _provider: ProjectAssetsProvider;
  private readonly _log: SimxLog;
  private readonly _retryDelayMs: number;
  private readonly _maxRetryDelayMs: number;
  private readonly _debounceMs: number;
  private readonly _snapshotListeners = new Set<(snapshot: readonly MakeCodeAsset[]) => void>();
  private readonly _paletteListeners = new Set<(palette: readonly string[]) => void>();
  private readonly _timers = new Set<ReturnType<typeof setTimeout>>();
  private _snapshot: MakeCodeAsset[] | undefined;
  private _snapshotText: string | undefined;
  private _palette: string[] | undefined;
  private _paletteText: string | undefined;
  private _problems: ReadonlySet<string> = new Set();
  // true from a listing's request until it settles, including the waits between its retries
  private _listing = false;
  // true when a listing is asked for while one is in flight
  private _listAgain = false;
  // true once the provider refused listing for good
  private _listRefused = false;
  // true while change reports are being gathered for a listing
  private _gathering = false;
  private _disposed = false;

  /**
   * @param provider - The editor's asset provider.
   * @param log - Receives a coded line for every failed request and every image that cannot be rendered in full.
   * @param timings - Retry and change-gathering timings.
   */
  constructor(provider: ProjectAssetsProvider, log: SimxLog, timings: ProjectAssetsTimings = {}) {
    this._provider = provider;
    this._log = log;
    this._retryDelayMs = timings.retryDelayMs ?? 500;
    this._maxRetryDelayMs = timings.maxRetryDelayMs ?? 30_000;
    this._debounceMs = timings.debounceMs ?? 100;
    this.subscribe(this._retryDelayMs);
    this.requestListing();
  }

  /** The latest asset snapshot, or `undefined` before the first listing. */
  get snapshot(): readonly MakeCodeAsset[] | undefined {
    return this._snapshot;
  }

  /** The latest palette, each color as `#rrggbb`, or `undefined` before the first listing. */
  get palette(): readonly string[] | undefined {
    return this._palette;
  }

  /** Subscribe to each snapshot unlike the one before it. Returns an unsubscribe function. */
  onSnapshot(listener: (snapshot: readonly MakeCodeAsset[]) => void): () => void {
    this._snapshotListeners.add(listener);
    return () => {
      this._snapshotListeners.delete(listener);
    };
  }

  /** Subscribe to each palette unlike the one before it. Returns an unsubscribe function. */
  onPalette(listener: (palette: readonly string[]) => void): () => void {
    this._paletteListeners.add(listener);
    return () => {
      this._paletteListeners.delete(listener);
    };
  }

  /** Stop asking the provider and announcing. */
  dispose(): void {
    this._disposed = true;
    for (const timer of this._timers) clearTimeout(timer);
    this._timers.clear();
    this._snapshotListeners.clear();
    this._paletteListeners.clear();
  }

  /** Subscribes to change reports, retrying after `retryDelay` when the provider fails it. */
  private subscribe(retryDelay: number): void {
    this._provider
      .subscribe(() => {
        this.changed();
      })
      .then(
        () => {
          if (!this._disposed) this.requestListing();
        },
        (error: unknown) => {
          if (this._disposed || this.refused(error, "subscribing to the project's assets")) return;
          this.after(retryDelay, () => {
            this.subscribe(this.nextDelay(retryDelay));
          });
        }
      );
  }

  /** Gathers a change report into the listing of its window. */
  private changed(): void {
    if (this._disposed || this._gathering) return;
    this._gathering = true;
    this.after(this._debounceMs, () => {
      this._gathering = false;
      this.requestListing();
    });
  }

  /** Lists the project's images, or once more after the listing in flight settles. */
  private requestListing(): void {
    if (this._disposed || this._listRefused) return;
    if (this._listing) {
      this._listAgain = true;
      return;
    }
    this.list(this._retryDelayMs);
  }

  /** Makes one listing request, retrying after `retryDelay` when the provider fails it. */
  private list(retryDelay: number): void {
    this._listing = true;
    this._listAgain = false;
    this._provider.list("image").then(
      (listing) => {
        if (this._disposed) return;
        this._listing = false;
        this.adopt(listing);
        if (this._listAgain) this.requestListing();
      },
      (error: unknown) => {
        if (this._disposed) return;
        if (this.refused(error, "listing the project's images")) {
          this._listing = false;
          this._listRefused = true;
          return;
        }
        this.after(retryDelay, () => {
          this.list(this.nextDelay(retryDelay));
        });
      }
    );
  }

  /** Takes `listing` as the latest, announcing its palette and snapshot where they changed. */
  private adopt(listing: ProjassetsListing): void {
    const palette = [...listing.palette];
    const paletteText = JSON.stringify(palette);
    const paletteChanged = paletteText !== this._paletteText;
    const { snapshot, problems } = snapshotOf(listing.assets, palette);
    for (const problem of problems) if (!this._problems.has(problem)) this._log.error(problem);
    this._problems = new Set(problems);
    const snapshotText = JSON.stringify(snapshot);
    const snapshotChanged = snapshotText !== this._snapshotText;
    this._palette = palette;
    this._paletteText = paletteText;
    this._snapshot = snapshot;
    this._snapshotText = snapshotText;
    if (paletteChanged) for (const listener of this._paletteListeners) listener(palette);
    if (snapshotChanged) for (const listener of this._snapshotListeners) listener(snapshot);
  }

  /**
   * Logs `error`, met while `doing`, by its code, and returns `true` when
   * the request must not be retried: a refusal no retry can overcome, or a
   * client disposed with its frame, which is not logged.
   */
  private refused(error: unknown, doing: string): boolean {
    const code = error instanceof ProjassetsError ? error.code : undefined;
    if (code === "DISPOSED") return true;
    const permanent = code !== undefined && PERMANENT_REFUSALS.has(code);
    const message = error instanceof ProjassetsError ? `${error.code}: ${error.message}` : String(error);
    this._log.error(`${message} (${doing}; ${permanent ? "not asked again while this frame lives" : "retrying"})`);
    return permanent;
  }

  /** The wait before the retry after one that waited `delay`. */
  private nextDelay(delay: number): number {
    return Math.min(delay * 2, this._maxRetryDelayMs);
  }

  /** Runs `action` after `delay`, unless disposed first. */
  private after(delay: number, action: () => void): void {
    const timer = setTimeout(() => {
      this._timers.delete(timer);
      if (!this._disposed) action();
    }, delay);
    this._timers.add(timer);
  }
}
