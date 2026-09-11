import { createInMemoryProjectFileSystem, type ProjectFileSystem } from "@wendoo/app-host";
import type { AppBridge, AppBridgeFeature, AppBridgeState } from "@wendoo/bridge-app";
import { createAppBridge } from "@wendoo/bridge-app";
import { coreModule, createWendooEnvironment, type WendooEnvironment } from "@wendoo/core/app";

/**
 * Address of the MakeCode bridge service a session connects to when none is
 * given: a host with an optional port. The scheme is not part of it -- the
 * bridge client selects `ws://` for a loopback host and `wss://` otherwise.
 */
export const DEFAULT_MAKECODE_BRIDGE_URL = "makecode-bridge.playwendoo.com";

/**
 * Lifecycle state of an {@link MakeCodeSession}.
 *
 * - `idle` - not connected; no environment and no files exist.
 * - `connecting` - the bridge is open or opening, but the authoritative file
 *   set has not arrived yet.
 * - `ready` - files have synced and the Wendoo environment exists.
 */
export type MakeCodeSessionStatus = "idle" | "connecting" | "ready";

/** Listener invoked whenever an {@link MakeCodeSession} field changes. */
export type MakeCodeSessionListener = () => void;

/** Construction options for {@link MakeCodeSession}. */
export interface MakeCodeSessionOptions {
  /**
   * Address of the MakeCode bridge service as a host with an optional port.
   * Defaults to {@link DEFAULT_MAKECODE_BRIDGE_URL}.
   */
  readonly bridgeUrl?: string;
}

/**
 * Signals the first completed file sync of a bridge session.
 *
 * @param onFirstSync - Called once, on the first sync of each bridge session.
 */
function firstSyncFeature(onFirstSync: () => void): AppBridgeFeature {
  return {
    attach(context) {
      let signaled = false;
      return context.onDidSync(() => {
        if (signaled) {
          return;
        }
        signaled = true;
        onFirstSync();
      });
    },
  };
}

/**
 * Owns the app's connection to the bridge service and the Wendoo environment
 * that connection makes possible.
 *
 * The project files are not the app's own: `makecode/simx/bridge` holds the
 * authoritative set and serves it over the bridge, so this session starts with
 * an empty file system and receives its contents on sync. The environment is
 * created only once that first sync completes; {@link env} and {@link files}
 * throw before then.
 */
export class MakeCodeSession {
  private readonly _bridgeUrl: string;
  private _status: MakeCodeSessionStatus = "idle";
  private _bridge: AppBridge | undefined;
  private _files: ProjectFileSystem | undefined;
  private _env: WendooEnvironment | undefined;
  private _joinCode: string | undefined;
  private readonly _listeners = new Set<MakeCodeSessionListener>();

  constructor(options: MakeCodeSessionOptions = {}) {
    this._bridgeUrl = options.bridgeUrl ?? DEFAULT_MAKECODE_BRIDGE_URL;
  }

  /** Address of the MakeCode bridge service this session connects to. */
  get bridgeUrl(): string {
    return this._bridgeUrl;
  }

  /** Current lifecycle state. */
  get status(): MakeCodeSessionStatus {
    return this._status;
  }

  /** Code the operator pastes into the simx to bind this session, once issued. */
  get joinCode(): string | undefined {
    return this._joinCode;
  }

  /**
   * The Wendoo environment for the connected project.
   *
   * @throws When the session is not `ready`.
   */
  get env(): WendooEnvironment {
    if (!this._env) {
      throw new Error("Wendoo environment is unavailable until the session is ready");
    }
    return this._env;
  }

  /**
   * The project file system, populated from the authoritative set held by the
   * simx.
   *
   * @throws When the session is not `ready`.
   */
  get files(): ProjectFileSystem {
    if (!this._files) {
      throw new Error("Project files are unavailable until the session is ready");
    }
    return this._files;
  }

  /**
   * Subscribe to session changes.
   *
   * @param listener - Called after any field changes.
   * @returns An unsubscribe function.
   */
  subscribe(listener: MakeCodeSessionListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Open the bridge connection. No-op once connecting or ready. */
  connect(): void {
    if (this._bridge) {
      return;
    }
    const files = createInMemoryProjectFileSystem();
    const bridge = createAppBridge({
      bridgeUrl: this._bridgeUrl,
      filesystem: files,
      features: [firstSyncFeature(() => this.onFilesArrived(files))],
    });
    this._bridge = bridge;
    this._files = undefined;
    this._status = "connecting";
    bridge.onStateChange((state) => this.onBridgeState(state));
    bridge.start();
    this.emit();
  }

  /** Close the bridge connection and discard the environment it carried. */
  disconnect(): void {
    this._bridge?.stop();
    this._bridge = undefined;
    this._files = undefined;
    this._env = undefined;
    this._joinCode = undefined;
    this._status = "idle";
    this.emit();
  }

  private onFilesArrived(files: ProjectFileSystem): void {
    this._files = files;
    this._env = createWendooEnvironment({ modules: [coreModule()] });
    this._status = "ready";
    this.emit();
  }

  private onBridgeState(state: AppBridgeState): void {
    this._joinCode = this._bridge?.snapshot().joinCode;
    if (state === "connected") {
      // Files may not have synced yet; onFilesArrived promotes to `ready`.
      if (this._status === "idle") {
        this._status = "connecting";
      }
    } else if (this._status === "ready") {
      // The peer went away: the environment it justified goes with it.
      this._files = undefined;
      this._env = undefined;
      this._status = "connecting";
    }
    this.emit();
  }

  private emit(): void {
    for (const listener of this._listeners) {
      listener();
    }
  }
}
