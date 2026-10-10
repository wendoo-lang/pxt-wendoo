import type { MakeCodeAsset } from "./makecode-assets.js";
import { CounterpartSession } from "./makecode-counterpart.js";
import type {
  MakeCodeBrainsChannel,
  MakeCodeEditorSession,
  MakeCodeEditorSessionErrorCode,
  MakeCodeEditorSessionState,
} from "./makecode-editor-session.js";
import type { MakeCodeProjectInfo } from "./makecode-project-info.js";
import type { MakeCodeSessionMessage, MakeCodeSessionPort } from "./makecode-session.js";

/**
 * How long, in milliseconds, a {@link MakeCodePortEditorSession} waits after
 * a handshake completes, and after each answer to its liveness ping, before
 * pinging the counterpart again, unless its options give another interval.
 */
export const MAKECODE_HEARTBEAT_INTERVAL_MS = 5000;

/**
 * How long, in milliseconds, a {@link MakeCodePortEditorSession} waits for
 * the answer to a liveness ping before counting it a miss, unless its
 * options give another deadline. A miss sends a follow-up ping at once; a
 * second miss in a row ends the handshake.
 */
export const MAKECODE_HEARTBEAT_DEADLINE_MS = 10_000;

/** Timing of a {@link MakeCodePortEditorSession}'s liveness pings. */
export interface MakeCodeHeartbeatOptions {
  /** Milliseconds from a completed handshake, and from each ping's answer, to the next ping. */
  intervalMs: number;
  /**
   * Milliseconds a ping may go unanswered before it counts as a miss. Two
   * misses in a row end the handshake.
   */
  deadlineMs: number;
}

/** Options for {@link createMakeCodePortEditorSession}. */
export interface MakeCodePortEditorSessionOptions {
  /**
   * Timing of the liveness pings. Defaults to
   * {@link MAKECODE_HEARTBEAT_INTERVAL_MS} and
   * {@link MAKECODE_HEARTBEAT_DEADLINE_MS}.
   */
  heartbeat?: MakeCodeHeartbeatOptions;
}

/**
 * The editor's makecode session with the MakeCode project over ports the
 * page hosting the editor supplies: one session for the life of the editor's
 * frame. Its status is:
 *
 * - `connected` once the makecode handshake over the current port has
 *   completed, until the counterpart leaves two liveness pings in a row
 *   unanswered past the heartbeat deadline, the port is replaced, or
 *   {@link MakeCodeEditorSession.stop} is called. A counterpart that stops
 *   answering is detected within the heartbeat interval plus twice the
 *   deadline;
 * - `disconnected` while no port is attached, while the current port's
 *   handshake is pending, after it was rejected or ended, and after
 *   {@link MakeCodeEditorSession.stop}.
 *
 * Every port attached opens a fresh handshake, replacing the previous
 * port's: the catalogs, asset snapshots, project facts and brains channel
 * delivered come from the current handshake only.
 * While a handshake is established the session pings the counterpart, one
 * ping outstanding at a time, two after a miss: the first a heartbeat
 * interval after the handshake completes, each next one an interval after
 * the previous one is answered. A ping unanswered for the heartbeat deadline
 * is a miss, and a follow-up ping goes out at once under a fresh deadline,
 * the missed ping still awaiting its answer; a pong to either one clears the
 * miss. A follow-up ping unanswered for its deadline ends the handshake as
 * replacing its port does -- its brains channel's requests reject with their
 * family's `CLOSED`, the status turns `disconnected` with the error code
 * unchanged -- and the session stays started, so the next port attached
 * opens the next handshake.
 * The one error code is `PeerSessionErrorCode.PROTOCOL_VERSION_NEWER`, for a
 * counterpart hello declaring a newer version; it stays until a later
 * handshake completes, or until {@link MakeCodeEditorSession.start} starts
 * the session again after a stop. {@link MakeCodeEditorSession.stop} ends
 * the current port's handshake and lets the port go; a port carries one
 * handshake, and the next port attached carries the next.
 */
export interface MakeCodePortEditorSession extends MakeCodeEditorSession {
  /**
   * Make `port` the session's port, replacing the current one: the current
   * port's handshake ends and stops reading it, and while the session is
   * started a new handshake opens over `port` at once.
   */
  attachPort(port: MakeCodeSessionPort): void;
}

/**
 * Create a {@link MakeCodePortEditorSession}, with no port attached and not
 * started: it handshakes over the ports attached once
 * {@link MakeCodeEditorSession.start} is called, and pings each established
 * handshake's counterpart on the timing `options.heartbeat` gives.
 */
export function createMakeCodePortEditorSession(
  options: MakeCodePortEditorSessionOptions = {}
): MakeCodePortEditorSession {
  return new PortEditorSession(
    options.heartbeat ?? { intervalMs: MAKECODE_HEARTBEAT_INTERVAL_MS, deadlineMs: MAKECODE_HEARTBEAT_DEADLINE_MS }
  );
}

/** The parts of a `MessagePort` {@link messagePortSessionPort} uses. */
export interface MakeCodeMessagePort {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  start(): void;
}

/**
 * `port` as a makecode-session port: each message is posted to `port` as it
 * is, and each message `port` receives is delivered as a makecode-session
 * message. Subscribing starts `port`'s message queue.
 */
export function messagePortSessionPort(port: MakeCodeMessagePort): MakeCodeSessionPort {
  return {
    postMessage(message) {
      port.postMessage(message);
    },
    onMessage(listener) {
      const receive = (event: { data: unknown }): void => {
        listener(event.data as MakeCodeSessionMessage);
      };
      port.addEventListener("message", receive);
      port.start();
      return () => {
        port.removeEventListener("message", receive);
      };
    },
  };
}

class PortEditorSession implements MakeCodePortEditorSession {
  private readonly _heartbeat: MakeCodeHeartbeatOptions;
  private readonly _stateListeners = new Set<(state: MakeCodeEditorSessionState) => void>();
  private readonly _catalogListeners = new Set<(content: string) => void>();
  private readonly _assetsListeners = new Set<(assets: MakeCodeAsset[]) => void>();
  private readonly _projectInfoListeners = new Set<(info: MakeCodeProjectInfo) => void>();
  private readonly _brainsChannelListeners = new Set<(channel: MakeCodeBrainsChannel) => void>();
  /** The port attached while no handshake has opened over it yet. */
  private _port: MakeCodeSessionPort | undefined;
  /** The handshake over the current port, if one is open. */
  private _counterpart: CounterpartSession | undefined;
  /** Whether the current handshake has completed. */
  private _established = false;
  /** Whether the session handshakes over the ports attached: set by `start()`, cleared by `stop()`. */
  private _running = false;
  private _errorCode: MakeCodeEditorSessionErrorCode | undefined;
  /** The target the counterpart declared in the latest completed handshake. */
  private _target: string | undefined;
  /**
   * The heartbeat's one pending timer while a handshake is established: the
   * wait before the next ping, or the current ping's deadline.
   */
  private _heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * The heartbeat's generation, advanced when a round opens with its
   * interval ping and again when the first pong to any ping of the round
   * closes it; a round's follow-up ping after a miss joins it. A pong or
   * deadline of a round whose generation is no longer the latest does
   * nothing.
   */
  private _heartbeatRound = 0;
  private _state: MakeCodeEditorSessionState = this.readState();

  /** @param heartbeat - Timing of the liveness pings. */
  constructor(heartbeat: MakeCodeHeartbeatOptions) {
    this._heartbeat = heartbeat;
  }

  get state(): MakeCodeEditorSessionState {
    return this._state;
  }

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

  attachPort(port: MakeCodeSessionPort): void {
    this.leave();
    this._port = port;
    if (this._running) this.open();
    this.update();
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._errorCode = undefined;
    this.open();
    this.update();
  }

  stop(): void {
    this._running = false;
    this.leave();
    this.update();
  }

  /** Opens a handshake over the attached port, if one is attached, taking it so no later handshake reuses it. */
  private open(): void {
    const port = this._port;
    if (port === undefined) return;
    this._port = undefined;
    const counterpart = new CounterpartSession(port, {
      established: (target, channel, ping) => {
        this._established = true;
        this._errorCode = undefined;
        this._target = target;
        this.awaitNextPing(counterpart, ping);
        this.update();
        for (const listener of this._brainsChannelListeners) listener(channel);
      },
      catalog: (content) => {
        for (const listener of this._catalogListeners) listener(content);
      },
      assets: (assets) => {
        for (const listener of this._assetsListeners) listener(assets);
      },
      projectInfo: (info) => {
        for (const listener of this._projectInfoListeners) listener(info);
      },
      rejected: (code) => {
        this._errorCode = code;
        this.update();
      },
    });
    this._counterpart = counterpart;
  }

  /** Whether `counterpart` is the current handshake and has completed. */
  private isCurrent(counterpart: CounterpartSession): boolean {
    return this._counterpart === counterpart && this._established;
  }

  /** Opens a new heartbeat round, pinging the established `counterpart` with `ping`, once the heartbeat interval has passed. */
  private awaitNextPing(counterpart: CounterpartSession, ping: () => Promise<void>): void {
    this._heartbeatTimer = setTimeout(() => {
      this.probe(counterpart, ping, ++this._heartbeatRound, false);
    }, this._heartbeat.intervalMs);
  }

  /**
   * Pings the established `counterpart` with `ping` in heartbeat round
   * `round`. The first answer to any ping of the round, while the handshake
   * is current and the round the latest, closes the round and schedules the
   * next one. No answer within the heartbeat deadline is a miss: after the
   * round's first ping, a follow-up ping goes out at once; after the
   * follow-up, the handshake ends and the state is published.
   *
   * @param afterMiss - Whether this is the follow-up ping of a round whose first ping missed.
   */
  private probe(counterpart: CounterpartSession, ping: () => Promise<void>, round: number, afterMiss: boolean): void {
    const latest = (): boolean => this.isCurrent(counterpart) && this._heartbeatRound === round;
    this._heartbeatTimer = setTimeout(() => {
      if (!latest()) return;
      if (!afterMiss) {
        this.probe(counterpart, ping, round, true);
        return;
      }
      this.leave();
      this.update();
    }, this._heartbeat.deadlineMs);
    void ping().then(() => {
      if (!latest()) return;
      this._heartbeatRound += 1;
      clearTimeout(this._heartbeatTimer);
      this.awaitNextPing(counterpart, ping);
    });
  }

  /** Ends the current handshake, if any, stops its heartbeat, and lets the attached port go. */
  private leave(): void {
    clearTimeout(this._heartbeatTimer);
    this._heartbeatTimer = undefined;
    this._counterpart?.close();
    this._counterpart = undefined;
    this._established = false;
    this._port = undefined;
  }

  private readState(): MakeCodeEditorSessionState {
    return {
      status: this._established ? "connected" : "disconnected",
      errorCode: this._errorCode,
      target: this._target,
    };
  }

  /** Publishes the current state when any field differs from the last one published. */
  private update(): void {
    const next = this.readState();
    const last = this._state;
    if (next.status === last.status && next.errorCode === last.errorCode && next.target === last.target) {
      return;
    }
    this._state = next;
    for (const listener of this._stateListeners) listener(next);
  }
}
