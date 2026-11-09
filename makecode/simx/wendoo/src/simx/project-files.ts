import { type ProjfsClient, ProjfsError, type ProjfsErrorCode } from "../vendor/projfs.js";
import type { SimxLog } from "./simx-bridge.js";

/**
 * The project-file operations the simulator extension reads, writes and
 * watches the project through: a projfs client's, naming files relative to
 * the simulator extension's folder.
 */
export type ProjectFiles = Pick<ProjfsClient, "list" | "read" | "write" | "delete" | "subscribe">;

/** The projfs refusal codes no retry can overcome while this frame lives; a request refused with one is not asked again. */
export const PROJFS_PERMANENT_REFUSALS: ReadonlySet<ProjfsErrorCode> = new Set<ProjfsErrorCode>([
  "PERMISSION_DENIED",
  "UNREGISTERED",
  "INVALID_NAME",
  "INVALID_REQUEST",
]);

/** `error` as a log line or a failed request's message: a projfs refusal's code leading its message, anything else as text. */
export function describeProjfsError(error: unknown): string {
  return error instanceof ProjfsError ? `${error.code}: ${error.message}` : String(error);
}

/** Timings of a {@link watchProjectFiles} watch, in milliseconds. Each defaults when left out. */
export interface ProjectFileWatchTimings {
  /** Wait before the first retry of a refused subscription; each later retry waits twice the one before. Default 500. */
  retryDelayMs?: number;
  /** Longest wait between retries, kept for every retry after it is reached. Default 30000. */
  maxRetryDelayMs?: number;
  /** Window in which change notifications are gathered into one call. Default 100. */
  debounceMs?: number;
}

/**
 * Subscribe to MakeCode's change notifications of the project's `files`, and
 * hand the names they carry to `changed`, the notifications of one
 * {@link ProjectFileWatchTimings.debounceMs} window gathered into one call,
 * each name once, in the order first reported. A subscription the project
 * fails is logged by its projfs code and asked again after a wait that
 * doubles from {@link ProjectFileWatchTimings.retryDelayMs} up to
 * {@link ProjectFileWatchTimings.maxRetryDelayMs}, for as long as it takes;
 * a refusal in {@link PROJFS_PERMANENT_REFUSALS} is logged once and not asked
 * again. `resubscribed` is called once a subscription asked again is
 * acknowledged. Returns a function that stops the watch.
 *
 * @param files - The project's files.
 * @param log - Receives a coded line for every refused subscription.
 * @param changed - Called with the names of the files that changed.
 * @param resubscribed - Called once a subscription asked again after a refusal is acknowledged.
 * @param timings - Retry and gathering timings; each left out takes its default.
 */
export function watchProjectFiles(
  files: ProjectFiles,
  log: SimxLog,
  changed: (names: string[]) => void,
  resubscribed: () => void,
  timings: ProjectFileWatchTimings = {}
): () => void {
  const retryDelayMs = timings.retryDelayMs ?? 500;
  const maxRetryDelayMs = timings.maxRetryDelayMs ?? 30_000;
  const debounceMs = timings.debounceMs ?? 100;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  // the names reported in the window gathering now, or undefined while none is
  let gathered: Set<string> | undefined;
  let stopped = false;
  const after = (delay: number, action: () => void): void => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!stopped) action();
    }, delay);
    timers.add(timer);
  };
  const notified = (names: string[]): void => {
    if (stopped) return;
    if (gathered === undefined) {
      const report = new Set<string>();
      gathered = report;
      after(debounceMs, () => {
        gathered = undefined;
        changed([...report]);
      });
    }
    for (const name of names) gathered.add(name);
  };
  const subscribe = (retryDelay: number, retry: boolean): void => {
    files.subscribe(notified).then(
      () => {
        if (!stopped && retry) resubscribed();
      },
      (error: unknown) => {
        const code = error instanceof ProjfsError ? error.code : undefined;
        if (stopped || code === "DISPOSED") return;
        const permanent = code !== undefined && PROJFS_PERMANENT_REFUSALS.has(code);
        log.error(
          `${describeProjfsError(error)} (subscribing to the project's files; ${permanent ? "not asked again while this frame lives" : "retrying"})`
        );
        if (permanent) return;
        after(retryDelay, () => {
          subscribe(Math.min(retryDelay * 2, maxRetryDelayMs), true);
        });
      }
    );
  };
  subscribe(retryDelayMs, false);
  return () => {
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
}
