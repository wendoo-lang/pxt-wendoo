/**
 * Speech: this module owns the speech bubbles programs show over their
 * sprites. Each scene keeps, per sprite, the text its sprite's bubble shows
 * and the scene time the bubble clears at, and clears each bubble on the
 * first frame of the scene past that time. A bubble is shown through
 * Arcade's own `sayText`, once per change of its text and with no time on
 * screen; this module alone clears it.
 */
namespace wendoo {
  /**
   * Log code: a say given no text found its rule's WHEN result holding no
   * number, text or switch -- a sprite, a position, nothing -- and said
   * nothing. Logged as `wendoo WENDOO_SAY_UNSPEAKABLE`, once per game run,
   * while {@link debug} is on.
   */
  //% hidden
  export const SAY_UNSPEAKABLE = "WENDOO_SAY_UNSPEAKABLE";

  /**
   * The text `value` says, printed as Arcade's `console.inspect` prints it:
   * a number in its usual decimal form, a text as it is, a switch as `true`
   * or `false`. `undefined` for any other value, nil included.
   *
   * @param value - Any value a program produced.
   */
  //% hidden
  export function spokenText(value: Value): string {
    if (!value) {
      return undefined;
    }
    if (value.t === ValueTag.String) {
      return value.str;
    }
    if (value.t === ValueTag.Number) {
      return console.inspect(value.num);
    }
    if (value.t === ValueTag.Boolean) {
      return console.inspect(value.b);
    }
    return undefined;
  }

  /** What shows a sprite's speech bubble: Arcade's own `sayText`. */
  //% hidden
  export class SpeechVoice {
    constructor() {}

    /**
     * Show `text` in the speech bubble of `sprite`, in place of any bubble it
     * shows, with no time on screen; `""` clears its bubble.
     *
     * @param sprite - The sprite whose bubble to show or clear.
     * @param text - The text to show; `""` to clear the bubble.
     */
    say(sprite: Sprite, text: string): void {
      sprite.sayText(text);
    }
  }

  /**
   * The speech bubbles of one scene's sprites: per sprite, the text its
   * bubble shows and the scene time, in milliseconds, it clears at. Bubbles
   * of different sprites never affect each other.
   */
  //% hidden
  export class SceneSpeech {
    /** What every bubble is shown and cleared through; replace it to show them through another. */
    voice: SpeechVoice = new SpeechVoice();
    /** The sprites showing a bubble, in the order each first spoke; `texts` and `ends` hold each one's bubble at the same index. */
    private speakers: Sprite[] = [];
    /** The text the bubble of the sprite at the same index of `speakers` shows. */
    private texts: string[] = [];
    /** The scene time, in milliseconds, the bubble of the sprite at the same index of `speakers` clears after. */
    private ends: number[] = [];

    constructor() {}

    /**
     * Say `text` through `sprite` at the scene time `now`. The same text its
     * bubble shows keeps the bubble up, now until `durationMs` after `now`,
     * without showing it again; another text shows at once in its place; and
     * `""` clears the bubble at once.
     *
     * @param sprite - The speaking sprite, not destroyed.
     * @param text - The text to say; `""` to clear the bubble.
     * @param durationMs - How long after `now` the bubble stays up, in milliseconds, at 0 or above.
     * @param now - The scene time of the say, in milliseconds.
     */
    say(sprite: Sprite, text: string, durationMs: number, now: number): void {
      const index = this.speakers.indexOf(sprite);
      if (text === "") {
        if (index >= 0) {
          this.forget(index);
        }
        this.voice.say(sprite, "");
        return;
      }
      if (index >= 0) {
        if (this.texts[index] !== text) {
          this.voice.say(sprite, text);
          this.texts[index] = text;
        }
        this.ends[index] = now + durationMs;
        return;
      }
      this.voice.say(sprite, text);
      this.speakers.push(sprite);
      this.texts.push(text);
      this.ends.push(now + durationMs);
    }

    /**
     * Clear every bubble whose time is past at the scene time `now`, and
     * forget the bubble of every destroyed sprite without touching it.
     *
     * @param now - The scene time, in milliseconds.
     */
    expire(now: number): void {
      for (let i = this.speakers.length - 1; i >= 0; i--) {
        const sprite = this.speakers[i];
        if (isDestroyed(sprite)) {
          this.forget(i);
        } else if (now > this.ends[i]) {
          this.forget(i);
          this.voice.say(sprite, "");
        }
      }
    }

    /** Forget the bubble at `index`. */
    private forget(index: number): void {
      this.speakers.splice(index, 1);
      this.texts.splice(index, 1);
      this.ends.splice(index, 1);
    }
  }

  /** Key the speech bubbles of a scene are kept under in the scene's data. */
  const SCENE_SPEECH_KEY = "wendoo.speech";

  /**
   * Frame-handler priority of each scene's bubble clearing: just after the
   * scene's update priority, at which its programs think.
   */
  const SPEECH_PRIORITY = scene.UPDATE_PRIORITY + 1;

  /**
   * The speech bubbles of `gameScene`, created on first use with their
   * clearing registered on the scene's frame loop at
   * {@link SPEECH_PRIORITY}, at the scene's elapsed time.
   *
   * @param gameScene - The scene whose sprites speak.
   */
  //% hidden
  export function sceneSpeech(gameScene: scene.Scene): SceneSpeech {
    const existing = gameScene.data[SCENE_SPEECH_KEY] as SceneSpeech;
    if (existing) {
      return existing;
    }
    const speech = new SceneSpeech();
    gameScene.data[SCENE_SPEECH_KEY] = speech;
    gameScene.eventContext.registerFrameHandler(SPEECH_PRIORITY, () => {
      speech.expire(gameScene.millis());
    });
    return speech;
  }
}
