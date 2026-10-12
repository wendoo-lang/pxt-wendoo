/**
 * Dialogs: this module owns the dialogs programs open over the game. Each
 * scene keeps one queue of the dialogs its programs asked for and shows them
 * one at a time, in the order they were asked for, from a fiber of its own:
 * text through Arcade's own `game.showLongText`, a question through Arcade's
 * own `game.ask`. While a dialog is up, Arcade suspends the scene's frame
 * handlers, so none of the scene's programs think until it is dismissed.
 * Each dialog's caller is told it ended only once the buttons that close it
 * read released -- the button that answered a question, both A and down for
 * a text box -- and the scene's programs think again while they are held.
 */
namespace wendoo {
  /**
   * Log code: a show text or an ask given no text found its rule's WHEN
   * result holding no number, text or switch -- a sprite, a position,
   * nothing -- and opened no dialog. Logged as `wendoo WENDOO_DIALOG_UNSPEAKABLE`,
   * once per game run, while {@link debug} is on.
   */
  //% hidden
  export const DIALOG_UNSPEAKABLE = "WENDOO_DIALOG_UNSPEAKABLE";

  /** What shows a dialog and waits for it to be dismissed: Arcade's own dialogs. */
  //% hidden
  export class DialogPresenter {
    constructor() {}

    /**
     * Show `text` in a paged text box laid out as `layout`, and return once
     * its last page is dismissed with A.
     *
     * @param text - The text to show, not empty.
     * @param layout - Where on the screen the box goes.
     */
    showText(text: string, layout: DialogLayout): void {
      game.showLongText(text, layout);
    }

    /**
     * Ask `question`, and return the answer once it is given: `true` for A,
     * `false` for B.
     *
     * @param question - The question to ask, not empty.
     */
    ask(question: string): boolean {
      return game.ask(question);
    }
  }

  /**
   * Return once none of `buttons` reads pressed: at once when none does,
   * else from a later poll, the game's frames running meanwhile.
   *
   * @param buttons - The buttons waited on.
   */
  function untilLetGo(buttons: controller.Button[]): void {
    pauseUntil(() => buttons.every((button: controller.Button) => !button.isPressed()));
  }

  /** One dialog a program asked for: the text it shows and what is told once it is dismissed. */
  class DialogRequest {
    /** The text the dialog shows: the text of a text box, or a question. */
    text: string;
    /** Where on the screen a text box goes; unread for a question. */
    layout: DialogLayout;
    /** Told once a text box is dismissed; `undefined` for a question. */
    shown: () => void;
    /** Told the answer once a question is answered; `undefined` for a text box. */
    answered: (answer: boolean) => void;

    constructor(text: string, layout: DialogLayout) {
      this.text = text;
      this.layout = layout;
    }
  }

  /**
   * The dialogs one scene's programs asked for, shown one at a time in the
   * order they were asked for, each through {@link SceneDialogs.presenter},
   * from a fiber of the queue's own that runs while any dialog waits. Asking
   * never blocks the caller.
   */
  //% hidden
  export class SceneDialogs {
    /** What every dialog is shown through; replace it to show them through another. */
    presenter: DialogPresenter = new DialogPresenter();
    /** The dialogs asked for and not yet shown, oldest first. */
    private waiting: DialogRequest[] = [];
    /** Whether the queue's fiber is running. */
    private serving = false;

    constructor() {}

    /**
     * Ask for `text` in a text box laid out as `layout`, after every dialog
     * asked for before it, and have `shown` told from the queue's fiber once
     * the box is dismissed and neither A nor down, the buttons that close
     * it, reads pressed.
     *
     * @param text - The text to show, not empty.
     * @param layout - Where on the screen the box goes.
     * @param shown - Told once the box is dismissed and neither A nor down reads pressed.
     */
    showText(text: string, layout: DialogLayout, shown: () => void): void {
      const request = new DialogRequest(text, layout);
      request.shown = shown;
      this.enqueue(request);
    }

    /**
     * Ask `question`, after every dialog asked for before it, and have
     * `answered` told the answer from the queue's fiber once it is given and
     * the button that gave it is let go: `true` for A, `false` for B.
     *
     * @param question - The question to ask, not empty.
     * @param answered - Told the answer once it is given and its button let go.
     */
    ask(question: string, answered: (answer: boolean) => void): void {
      const request = new DialogRequest(question, DialogLayout.Bottom);
      request.answered = answered;
      this.enqueue(request);
    }

    /** How many dialogs wait to be shown, the one up now not counted. */
    waitingCount(): number {
      return this.waiting.length;
    }

    /** Queue `request` and start the queue's fiber when it is not running. */
    private enqueue(request: DialogRequest): void {
      this.waiting.push(request);
      if (this.serving) {
        return;
      }
      this.serving = true;
      control.runInParallel(() => this.serve());
    }

    /**
     * Show every waiting dialog in turn, telling each one's caller once it
     * ends and the buttons that close it read released -- the answering
     * button for a question, A and down for a text box -- until none waits.
     */
    private serve(): void {
      while (this.waiting.length > 0) {
        const request = this.waiting.shift();
        if (request.answered) {
          const answer = this.presenter.ask(request.text);
          untilLetGo([answer ? controller.A : controller.B]);
          request.answered(answer);
        } else {
          this.presenter.showText(request.text, request.layout);
          untilLetGo([controller.A, controller.down]);
          request.shown();
        }
      }
      this.serving = false;
    }
  }

  /** Key the dialogs of a scene are kept under in the scene's data. */
  const SCENE_DIALOGS_KEY = "wendoo.dialogs";

  /**
   * The dialog queue of `gameScene`, created on first use.
   *
   * @param gameScene - The scene whose programs ask for dialogs.
   */
  //% hidden
  export function sceneDialogs(gameScene: scene.Scene): SceneDialogs {
    const existing = gameScene.data[SCENE_DIALOGS_KEY] as SceneDialogs;
    if (existing) {
      return existing;
    }
    const dialogs = new SceneDialogs();
    gameScene.data[SCENE_DIALOGS_KEY] = dialogs;
    return dialogs;
  }
}
