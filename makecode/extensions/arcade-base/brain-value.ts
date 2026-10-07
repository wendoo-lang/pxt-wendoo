/**
 * Brains as Wendoo values: the `Brain` type a program names one of the
 * project's brains by, the sprites running the brain such a value names, the
 * brain one sprite runs, and a program's request that a sprite run a brain.
 * A value holds the brain's document id only; which sprites run it is read
 * when the value is used.
 */
namespace wendoo {
  /** Wendoo type name of a brain value: a plain struct naming one of the project's brains by its document id. */
  //% hidden
  export const TYPE_BRAIN = "Brain";

  /**
   * The `Brain` type's binding. Its atom id and its id field's id are the
   * project's mapping's once the program host has drained registrations.
   */
  //% hidden
  export const brainBinding = new BrainTypeBinding();

  /**
   * The sprites running, in the program host of `attachment`, the brain `value`
   * names, in start order. Empty when `value` is not a `Brain` value, nil
   * included, when the attachment's program host has started no program on it,
   * or when no sprite runs that brain.
   *
   * @param attachment - Attachment of the sprite whose program reads the value.
   * @param value - Any value a program produced.
   */
  //% hidden
  export function spritesRunning(attachment: SpriteAttachment, value: Value): Sprite[] {
    const documentId = brainBinding.documentIdOf(value);
    const runners: Sprite[] = [];
    if (documentId.length === 0 || !attachment.host) {
      return runners;
    }
    const attachments = attachment.host.attachmentsRunning(documentId);
    for (let i = 0; i < attachments.length; i++) {
      if (attachments[i] instanceof SpriteAttachment) {
        runners.push((attachments[i] as SpriteAttachment).sprite);
      }
    }
    return runners;
  }

  /**
   * Whether `a` and `b` name the same brain: both `Brain` values holding one
   * document id, whether or not the project holds a compiled brain under
   * it. `false` when either names no brain, nil included.
   *
   * @param a - Any value a program produced.
   * @param b - Any value a program produced.
   */
  //% hidden
  export function sameBrain(a: Value, b: Value): boolean {
    const documentId = brainBinding.documentIdOf(a);
    return documentId.length > 0 && documentId === brainBinding.documentIdOf(b);
  }

  /**
   * The program host of the attachment `ctx` runs in, or `undefined` when
   * that attachment is no actor's or no host runs it.
   */
  function hostOf(ctx: ExecutionContext): ProgramHost {
    return ctx.data instanceof ActorAttachment ? (ctx.data as ActorAttachment).host : undefined;
  }

  /** The document id of the brain `sprite` runs in `host` now, or `""` when it runs none or `host` is `undefined`. */
  function documentIdRunningOn(host: ProgramHost, sprite: Sprite): string {
    if (!host) {
      return "";
    }
    const hosted = host.hostedPrograms();
    for (let i = 0; i < hosted.length; i++) {
      const attachment = hosted[i].attachment;
      if (attachment instanceof SpriteAttachment && (attachment as SpriteAttachment).sprite === sprite) {
        return hosted[i].loaded.registration.id;
      }
    }
    return "";
  }

  /** The compiled brain registered under `documentId`, or `undefined` when none is. */
  function registrationOf(documentId: string): CompiledBrainRegistration {
    const registered = compiledBrainRegistrations();
    for (let i = 0; i < registered.length; i++) {
      if (registered[i].id === documentId) {
        return registered[i];
      }
    }
    return undefined;
  }

  /**
   * The `Brain` value naming the brain `sprite` runs now in the program host
   * of the attachment `ctx` runs in; `undefined` when it runs none -- the empty
   * program {@link wendooBrains.none} included -- or that attachment has no
   * program host. A brain asked for but not yet started is not read.
   *
   * @param ctx - Execution context of the program reading the brain.
   * @param sprite - The sprite whose brain is read.
   */
  //% hidden
  export function brainRunningOn(ctx: ExecutionContext, sprite: Sprite): Value {
    const documentId = documentIdRunningOn(hostOf(ctx), sprite);
    return documentId.length > 0 ? brainBinding.valueNaming(documentId) : undefined;
  }

  /**
   * Ask the program host of the attachment `ctx` runs in to run on `sprite`,
   * from its next drain, the brain `value` names, ending the program the
   * sprite runs then; given a value naming no brain, nil included, the empty
   * program {@link wendooBrains.none}, which ends the sprite's program. Asks
   * nothing when the sprite runs that brain already, or runs none and is
   * given no brain, or the attachment has no program host; and when no
   * compiled brain is registered under the document id `value` holds, asks
   * nothing and reports the id unresolved. Only records the request: nothing
   * starts or ends before the drain.
   *
   * @param ctx - Execution context of the program asking.
   * @param sprite - The sprite to run the brain on.
   * @param value - The brain to run: a `Brain` value, or nil to run none.
   */
  //% hidden
  export function requestBrain(ctx: ExecutionContext, sprite: Sprite, value: Value): void {
    const host = hostOf(ctx);
    const documentId = brainBinding.documentIdOf(value);
    if (!host || documentId === documentIdRunningOn(host, sprite)) {
      return;
    }
    let registration = wendooBrains.none;
    if (documentId.length > 0) {
      registration = registrationOf(documentId);
      if (!registration) {
        brainBinding.reportUnresolved(documentId);
        return;
      }
    }
    host.attach(new SpriteAttachment(sprite), registration);
  }
}
