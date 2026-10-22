import { logger } from "@wendoo/core/app";

/** Stable code logged at debug level for each create request, with the fully qualified name of the type it names. */
export const EDITOR_CREATE_REQUESTED = "EDITOR_CREATE_REQUESTED";

/** Stable code logged at debug level for each open request, with the fully qualified name of the instance it names. */
export const EDITOR_OPEN_REQUESTED = "EDITOR_OPEN_REQUESTED";

/**
 * A request, made from outside the editor: to create an instance of a type,
 * or to open an instance.
 */
export type EditorRequest =
  | {
      readonly kind: "create";
      /** The fully qualified name of the type to create an instance of, such as `wendoo.CompiledBrainRegistration`. */
      readonly qName: string;
    }
  | {
      readonly kind: "open";
      /** The fully qualified name of the instance to open, such as `wendooBrains.p_abcdabcdabcdabcd`. */
      readonly qName: string;
    };

/**
 * The requests made of the editor from outside it, held in one slot: the
 * latest request of either kind until a subscriber takes it. Each request is
 * logged under its kind's code, {@link EDITOR_CREATE_REQUESTED} or
 * {@link EDITOR_OPEN_REQUESTED}, with its `qName`.
 */
export class EditorRequests {
  private _held: EditorRequest | undefined;
  private readonly _listeners = new Set<(request: EditorRequest) => void>();

  /**
   * Makes `request`: hands it to every current subscriber, or, while there
   * is none, holds it for the next one to subscribe, in place of any request
   * held before.
   */
  request(request: EditorRequest): void {
    logger.debug(request.kind === "create" ? EDITOR_CREATE_REQUESTED : EDITOR_OPEN_REQUESTED, {
      qName: request.qName,
    });
    if (this._listeners.size === 0) {
      this._held = request;
      return;
    }
    for (const listener of this._listeners) listener(request);
  }

  /**
   * Subscribes `listener` to the requests made: hands it the held request, if
   * any, at once, which no later subscriber then receives, and each request
   * made after. Returns an unsubscribe function.
   */
  take(listener: (request: EditorRequest) => void): () => void {
    this._listeners.add(listener);
    const held = this._held;
    this._held = undefined;
    if (held !== undefined) listener(held);
    return () => {
      this._listeners.delete(listener);
    };
  }
}
