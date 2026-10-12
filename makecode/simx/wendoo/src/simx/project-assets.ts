import type { MakeCodeAsset } from "@wendoo/makecode-session";
import {
  type ProjassetsClient,
  ProjassetsError,
  type ProjassetsErrorCode,
  type ProjassetsImage,
  type ProjassetsKind,
  type ProjassetsListing,
  type ProjassetsSong,
} from "../vendor/projassets.js";
import { decodeImageBase64 } from "./image-buffer.js";
import type { SimxLog } from "./simx-bridge.js";
import { imageSvg, SvgImageProblemCode } from "./svg-image.js";

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

/** The snapshot entries of the project's images, with the coded log line of each problem met rendering them. */
interface RenderedImages {
  readonly entries: MakeCodeAsset[];
  readonly problems: string[];
}

/**
 * The snapshot entries of the project's `images` under `palette`, ordered by
 * id: each image's kind, id, name when it has one, size, and preview as an
 * SVG data URI, the transparency images left out. An image whose pixels
 * cannot be read is left out, and pixels the palette cannot paint are left
 * unpainted; each is reported in `problems` by code naming the image.
 */
function imageEntriesOf(images: readonly ProjassetsImage[], palette: readonly string[]): RenderedImages {
  const entries: MakeCodeAsset[] = [];
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
    entries.push({
      kind: "image",
      id: image.id,
      ...(image.displayName === undefined ? {} : { name: image.displayName }),
      width: reading.image.width,
      height: reading.image.height,
      previewUrl: rendered.url,
    });
  }
  return { entries: entries.sort(byId), problems };
}

/** The snapshot entries of the project's `songs`, ordered by id: each song's kind, id, and name when it has one. */
function songEntriesOf(songs: readonly ProjassetsSong[]): MakeCodeAsset[] {
  return songs
    .map(
      (song): MakeCodeAsset => ({
        kind: "song",
        id: song.id,
        ...(song.displayName === undefined ? {} : { name: song.displayName }),
      })
    )
    .sort(byId);
}

/** The provider's listings making up one listing of the project, by kind; a kind the provider refused for good has none. */
interface Listings {
  readonly images: ProjassetsListing<"image"> | undefined;
  readonly songs: ProjassetsListing<"song"> | undefined;
}

/**
 * The MakeCode project's images, songs and name, as the editor's asset
 * provider lists them, held for publication: the asset snapshot -- every
 * image of the project with its preview rendered under the project's
 * palette, then every song of the project, each kind ordered by id -- and
 * the project's name.
 *
 * On construction it subscribes to the provider's change reports and lists
 * the project's images and songs, and it lists them again once the
 * subscription is acknowledged and after each change report, the reports of
 * one {@link ProjectAssetsTimings.debounceMs} window gathered into one
 * listing and a listing asked for while one is in flight made once it
 * settles. A listing settles once every kind it asks for is answered; one
 * that yields a snapshot unlike the last is announced to {@link onSnapshot},
 * and a name unlike the last to {@link onName}. Each image that cannot be
 * rendered in full is logged by code when a listing first meets it, and
 * again only after a listing without it.
 *
 * A request the provider fails is logged by its code and what it was doing,
 * naming the kind a listing asked for, and retried after a wait that doubles
 * from {@link ProjectAssetsTimings.retryDelayMs} up to
 * {@link ProjectAssetsTimings.maxRetryDelayMs}, for as long as it takes. A
 * refusal no retry can overcome while the frame lives -- `PERMISSION_DENIED`,
 * `UNREGISTERED`, `UNSUPPORTED_KIND`, `INVALID_REQUEST` -- is logged by its
 * code once and not asked again: a kind refused so is left out of every
 * later snapshot, and while every kind is refused no snapshot is held.
 * Nothing is asked or announced once disposed.
 */
export class ProjectAssets {
  private readonly _provider: ProjectAssetsProvider;
  private readonly _log: SimxLog;
  private readonly _retryDelayMs: number;
  private readonly _maxRetryDelayMs: number;
  private readonly _debounceMs: number;
  private readonly _snapshotListeners = new Set<(snapshot: readonly MakeCodeAsset[]) => void>();
  private readonly _nameListeners = new Set<(name: string) => void>();
  private readonly _timers = new Set<ReturnType<typeof setTimeout>>();
  private _snapshot: MakeCodeAsset[] | undefined;
  private _snapshotText: string | undefined;
  private _name: string | undefined;
  private _problems: ReadonlySet<string> = new Set();
  // true from a listing's request until it settles, including the waits between its retries
  private _listing = false;
  // true when a listing is asked for while one is in flight
  private _listAgain = false;
  // the kinds the provider refused to list for good
  private readonly _refusedKinds = new Set<ProjassetsKind>();
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

  /** The project's latest name, or `undefined` before the first listing. */
  get name(): string | undefined {
    return this._name;
  }

  /** Subscribe to each snapshot unlike the one before it. Returns an unsubscribe function. */
  onSnapshot(listener: (snapshot: readonly MakeCodeAsset[]) => void): () => void {
    this._snapshotListeners.add(listener);
    return () => {
      this._snapshotListeners.delete(listener);
    };
  }

  /** Subscribe to each project name unlike the one before it. Returns an unsubscribe function. */
  onName(listener: (name: string) => void): () => void {
    this._nameListeners.add(listener);
    return () => {
      this._nameListeners.delete(listener);
    };
  }

  /** Stop asking the provider and announcing. */
  dispose(): void {
    this._disposed = true;
    for (const timer of this._timers) clearTimeout(timer);
    this._timers.clear();
    this._snapshotListeners.clear();
    this._nameListeners.clear();
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

  /** Lists the project's images and songs, or once more after the listing in flight settles. */
  private requestListing(): void {
    if (this._disposed || (this._refusedKinds.has("image") && this._refusedKinds.has("song"))) return;
    if (this._listing) {
      this._listAgain = true;
      return;
    }
    this.list();
  }

  /** Makes one listing: lists every kind not refused for good, and adopts the listings once each kind is answered. */
  private list(): void {
    this._listing = true;
    this._listAgain = false;
    Promise.all([this.listKind("image", this._retryDelayMs), this.listKind("song", this._retryDelayMs)]).then(
      ([images, songs]) => {
        if (this._disposed) return;
        this._listing = false;
        this.adopt({ images, songs });
        if (this._listAgain) this.requestListing();
      }
    );
  }

  /**
   * Lists the project's assets of `kind`, retrying after `retryDelay` when
   * the provider fails it. Resolves with the listing, or with `undefined`
   * once the provider refuses the kind for good or fails it after disposal;
   * a retry pending at disposal never settles.
   */
  private listKind<K extends ProjassetsKind>(kind: K, retryDelay: number): Promise<ProjassetsListing<K> | undefined> {
    if (this._refusedKinds.has(kind)) return Promise.resolve(undefined);
    return this._provider.list(kind).then(
      (listing) => listing,
      (error: unknown) => {
        if (this._disposed) return undefined;
        if (this.refused(error, `listing the project's ${kind}s`)) {
          this._refusedKinds.add(kind);
          return undefined;
        }
        return new Promise<ProjassetsListing<K> | undefined>((resolve) => {
          this.after(retryDelay, () => {
            resolve(this.listKind(kind, this.nextDelay(retryDelay)));
          });
        });
      }
    );
  }

  /**
   * Takes `listings` as the latest, announcing their snapshot and name where
   * they changed; takes nothing while every kind is refused for good.
   */
  private adopt({ images, songs }: Listings): void {
    const listing = images ?? songs;
    if (listing === undefined) return;
    const rendered = images === undefined ? undefined : imageEntriesOf(images.assets, images.palette);
    const problems = rendered?.problems ?? [];
    const snapshot = [...(rendered?.entries ?? []), ...songEntriesOf(songs?.assets ?? [])];
    for (const problem of problems) if (!this._problems.has(problem)) this._log.error(problem);
    this._problems = new Set(problems);
    const snapshotText = JSON.stringify(snapshot);
    const snapshotChanged = snapshotText !== this._snapshotText;
    const { name } = listing;
    const nameChanged = name !== this._name;
    this._snapshot = snapshot;
    this._snapshotText = snapshotText;
    this._name = name;
    if (snapshotChanged) for (const listener of this._snapshotListeners) listener(snapshot);
    if (nameChanged) for (const listener of this._nameListeners) listener(name);
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
