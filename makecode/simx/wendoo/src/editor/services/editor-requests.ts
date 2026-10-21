import { logger } from "@wendoo/core/app";

/** Stable code logged at debug level for each create request, with the fully qualified name of the type it names. */
export const EDITOR_CREATE_REQUESTED = "EDITOR_CREATE_REQUESTED";

/** A request, made from outside the editor, to create an instance of a type. */
export interface CreateRequest {
  /** The fully qualified name of the type to create an instance of, such as `wendoo.CompiledBrainRegistration`. */
  readonly qName: string;
}

/**
 * The requests made of the editor from outside it, held in one slot: the
 * latest create request until a subscriber takes it. Each request's `qName`
 * is logged under {@link EDITOR_CREATE_REQUESTED} and read by nothing else;
 * a second kind of instance the editor creates would make `qName` a mapping
 * onto the catalog's types.
 */
export class EditorRequests {
  private _held: CreateRequest | undefined;
  private readonly _listeners = new Set<(request: CreateRequest) => void>();

  /**
   * Makes `request`: hands it to every current subscriber, or, while there
   * is none, holds it for the next one to subscribe, in place of any request
   * held before.
   */
  request(request: CreateRequest): void {
    logger.debug(EDITOR_CREATE_REQUESTED, { qName: request.qName });
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
  take(listener: (request: CreateRequest) => void): () => void {
    this._listeners.add(listener);
    const held = this._held;
    this._held = undefined;
    if (held !== undefined) listener(held);
    return () => {
      this._listeners.delete(listener);
    };
  }
}
