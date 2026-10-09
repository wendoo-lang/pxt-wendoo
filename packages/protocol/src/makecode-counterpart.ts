import type { PeerSessionErrorCode } from "@wendoo/bridge-app";
import { PeerSessionError } from "@wendoo/bridge-app";
import type { MakeCodeAsset } from "./makecode-assets.js";
import type { MakeCodeBrainsChannel } from "./makecode-editor-session.js";
import type { MakeCodeProjectInfo } from "./makecode-project-info.js";
import type { MakeCodeSession, MakeCodeSessionPort } from "./makecode-session.js";
import { connectMakeCodeSession } from "./makecode-session.js";

/** Where a {@link CounterpartSession} reports what its handshake brings. */
export interface CounterpartHandlers {
  /** Receives the peer's declared target once the handshake completes, then the handshake's brains channel. */
  established(target: string | undefined, channel: MakeCodeBrainsChannel): void;
  /** Receives each catalog the counterpart publishes. */
  catalog(content: string): void;
  /** Receives each asset snapshot the counterpart publishes. */
  assets(assets: MakeCodeAsset[]): void;
  /** Receives each reading of the project's facts the counterpart publishes. */
  projectInfo(info: MakeCodeProjectInfo): void;
  /** Receives the code of a failed handshake. */
  rejected(code: PeerSessionErrorCode): void;
}

/**
 * The editor's makecode handshake with the counterpart over one port: sends
 * the editor's hello at once, then reports the established session's brains
 * channel and the catalogs, asset snapshots and project facts the
 * counterpart publishes to `handlers`. Nothing is reported once it is
 * closed.
 */
export class CounterpartSession {
  private readonly _unsubscribes = new Set<() => void>();
  private _session: MakeCodeSession | undefined;
  private _closed = false;

  /**
   * @param port - The transport to the counterpart, which this handshake alone reads while it is open.
   * @param handlers - Where the handshake's outcome and the counterpart's publications are reported.
   */
  constructor(port: MakeCodeSessionPort, handlers: CounterpartHandlers) {
    const tracked: MakeCodeSessionPort = {
      postMessage(message) {
        port.postMessage(message);
      },
      onMessage: (listener) => {
        const unsubscribe = port.onMessage(listener);
        this._unsubscribes.add(unsubscribe);
        return () => {
          this._unsubscribes.delete(unsubscribe);
          unsubscribe();
        };
      },
    };
    connectMakeCodeSession({ port: tracked }).then(
      (session) => {
        if (this._closed) {
          session.dispose();
          return;
        }
        this._session = session;
        handlers.established(session.peerTarget, {
          listBrains: () => session.listBrains(),
          pullBrains: (ids) => session.pullBrains(ids),
          pushBrain: (push) => session.pushBrain(push),
          readManifest: () => session.readManifest(),
          writeManifest: (manifest) => session.writeManifest(manifest),
        });
        session.onCatalog((content) => {
          handlers.catalog(content);
        });
        session.onAssets((assets) => {
          handlers.assets(assets);
        });
        session.onProjectInfo((info) => {
          handlers.projectInfo(info);
        });
      },
      (error: unknown) => {
        if (!this._closed && error instanceof PeerSessionError) {
          handlers.rejected(error.code);
        }
      }
    );
  }

  /** Detach from the port, whether or not the handshake completed. */
  close(): void {
    this._closed = true;
    this._session?.dispose();
    for (const unsubscribe of this._unsubscribes) {
      unsubscribe();
    }
    this._unsubscribes.clear();
  }
}
