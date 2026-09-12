/**
 * The async handle table and the settle handle an async host body carries
 * across the async boundary.
 *
 * A settle only flips a handle's state and enqueues it on the completed queue,
 * so a host callback may settle a handle from outside the host loop. The
 * scheduler is the sole consumer of that queue: it drains the queue, resumes
 * the fibers parked on each settled handle, and frees the handle.
 */
namespace wendoo {
  /** Handle-id sentinel meaning no handle. Real ids start at 1. */
  export const NO_HANDLE = 0;

  /** Lifecycle state of one async handle. */
  export enum HandleState {
    /** The async operation is in flight and may still settle. */
    Pending = 0,
    /** The operation resolved; {@link Handle.result} holds its value. */
    Resolved = 1,
    /** The operation rejected; {@link Handle.errorCode} holds its classifier. */
    Rejected = 2,
    /** The operation was cancelled; {@link Handle.errorCode} holds `Cancelled`. */
    Cancelled = 3,
  }

  /**
   * One async operation: its lifecycle state, the payload its settle carried,
   * and the fibers parked on it.
   */
  export class Handle {
    /** Stable id, unique for the table's lifetime. */
    id: number;
    /** Lifecycle state. */
    state: HandleState;
    /** Resolved value; meaningful only in {@link HandleState.Resolved}. */
    result: Value;
    /** Fault classifier; meaningful in {@link HandleState.Rejected} and {@link HandleState.Cancelled}. */
    errorCode: ErrorCode;
    /** Ids of the fibers parked on this handle, in park order. */
    waiters: number[];
    /**
     * Whether this handle counts against the table's live-handle cap. False on
     * a handle whose live count the runtime already bounds by construction.
     */
    capped: boolean;

    constructor(id: number, capped: boolean) {
      this.id = id;
      this.state = HandleState.Pending;
      this.result = NIL_VALUE;
      this.errorCode = ErrorCode.HostError;
      this.waiters = [];
      this.capped = capped;
    }
  }

  /**
   * The pending async operations one brain instance owns. Allocation of a
   * capped handle is limited to the profile's live-handle limit; an uncapped
   * handle allocates outside that accounting.
   */
  export class HandleTable {
    private handles: Handle[] = [];
    private completedQueue: Handle[] = [];
    private nextId: number = 1;
    private maxHandles: number;
    private cappedCount: number = 0;

    /**
     * @param maxHandles - Live capped handles the table allocates at once; a device profile pins it.
     */
    constructor(maxHandles: number) {
      this.maxHandles = maxHandles;
    }

    /**
     * Whether a capped {@link HandleTable.createPending} would allocate right
     * now: the live capped-handle count is below the cap. Uncapped handles are
     * excluded from that count and always allocate. Non-mutating.
     */
    hasCapacity(): boolean {
      return this.cappedCount < this.maxHandles;
    }

    /**
     * Allocate a pending handle and return its id, or {@link NO_HANDLE} when a
     * capped allocation finds the table at its cap.
     *
     * @param capped - Whether the handle counts against the live-handle cap.
     */
    createPending(capped: boolean): number {
      if (capped && !this.hasCapacity()) {
        return NO_HANDLE;
      }
      const handle = new Handle(this.nextId, capped);
      this.nextId++;
      this.handles.push(handle);
      if (capped) {
        this.cappedCount++;
      }
      return handle.id;
    }

    /**
     * The handle holding `id`, or `undefined` once it has been freed.
     *
     * @param id - Handle id.
     */
    get(id: number): Handle {
      for (let i = 0; i < this.handles.length; i++) {
        if (this.handles[i].id === id) {
          return this.handles[i];
        }
      }
      return undefined;
    }

    /**
     * Settle `id` as resolved carrying `result`, and enqueue it for draining.
     * A handle that is not pending is left alone.
     *
     * @param id - Handle id.
     * @param result - Value the awaiting fiber receives.
     */
    resolve(id: number, result: Value): void {
      const handle = this.get(id);
      if (!handle || handle.state !== HandleState.Pending) {
        return;
      }
      handle.state = HandleState.Resolved;
      handle.result = result;
      this.completedQueue.push(handle);
    }

    /**
     * Settle `id` as rejected carrying `errorCode`, and enqueue it for
     * draining. A handle that is not pending is left alone.
     *
     * @param id - Handle id.
     * @param errorCode - Classifier the awaiting fiber throws.
     */
    reject(id: number, errorCode: ErrorCode): void {
      const handle = this.get(id);
      if (!handle || handle.state !== HandleState.Pending) {
        return;
      }
      handle.state = HandleState.Rejected;
      handle.errorCode = errorCode;
      this.completedQueue.push(handle);
    }

    /**
     * Settle `id` as cancelled carrying {@link ErrorCode.Cancelled}, and
     * enqueue it for draining. A handle that is not pending is left alone.
     *
     * @param id - Handle id.
     */
    cancel(id: number): void {
      const handle = this.get(id);
      if (!handle || handle.state !== HandleState.Pending) {
        return;
      }
      handle.state = HandleState.Cancelled;
      handle.errorCode = ErrorCode.Cancelled;
      this.completedQueue.push(handle);
    }

    /**
     * Park `fiberId` on `id`. A handle that no longer exists is a no-op.
     *
     * @param id - Handle id.
     * @param fiberId - Id of the fiber parked at the `AWAIT`.
     */
    addWaiter(id: number, fiberId: number): void {
      const handle = this.get(id);
      if (!handle) {
        return;
      }
      handle.waiters.push(fiberId);
    }

    /**
     * Unpark `fiberId` from `id`, so a later settle of the handle reaches it
     * no more. A handle that no longer exists, and a fiber that is not parked
     * on it, are both no-ops.
     *
     * @param id - Handle id.
     * @param fiberId - Id of the fiber to unpark.
     */
    removeWaiter(id: number, fiberId: number): void {
      const handle = this.get(id);
      if (!handle) {
        return;
      }
      const idx = handle.waiters.indexOf(fiberId);
      if (idx >= 0) {
        handle.waiters.splice(idx, 1);
      }
    }

    /**
     * Remove and return the oldest settled handle, or `undefined` when none is
     * queued. The handle is still live: resume its waiters, then call
     * {@link HandleTable.deleteHandle}.
     */
    popCompleted(): Handle {
      if (this.completedQueue.length === 0) {
        return undefined;
      }
      return this.completedQueue.shift();
    }

    /**
     * Free the handle holding `id`, releasing the slot a capped handle holds
     * against the cap.
     *
     * @param id - Handle id.
     */
    deleteHandle(id: number): void {
      for (let i = 0; i < this.handles.length; i++) {
        if (this.handles[i].id === id) {
          if (this.handles[i].capped) {
            this.cappedCount--;
          }
          this.handles.splice(i, 1);
          return;
        }
      }
    }
  }

  /**
   * The settle handle one async host body receives beside its argument
   * snapshot. The body retains it across the async boundary and calls exactly
   * one of {@link AsyncHandle.resolve}, {@link AsyncHandle.reject} or
   * {@link AsyncHandle.cancel} when the work completes; settling a handle that
   * is no longer pending is a no-op.
   */
  export class AsyncHandle {
    private table: HandleTable;
    /** Id of the bound handle, the value the dispatching opcode pushed for `AWAIT`. */
    id: number;

    /**
     * @param table - Table the bound handle lives in.
     * @param id - Id of the bound handle.
     */
    constructor(table: HandleTable, id: number) {
      this.table = table;
      this.id = id;
    }

    /**
     * Settle the handle as resolved, carrying `value` to the awaiting fiber.
     *
     * @param value - Value the `AWAIT` pushes.
     */
    resolve(value: Value): void {
      this.table.resolve(this.id, value);
    }

    /**
     * Settle the handle as rejected; the awaiting fiber throws `errorCode`.
     *
     * @param errorCode - Classifier the awaiting fiber faults with.
     */
    reject(errorCode: ErrorCode): void {
      this.table.reject(this.id, errorCode);
    }

    /**
     * Settle the handle as cancelled; the awaiting fiber faults with
     * {@link ErrorCode.Cancelled}.
     */
    cancel(): void {
      this.table.cancel(this.id);
    }
  }
}
