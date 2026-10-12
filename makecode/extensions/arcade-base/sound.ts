/**
 * Sounds: this module owns the sounds programs play. Every sound is an
 * Arcade playable -- a built-in melody, a tone or a shaped tone -- played
 * through Arcade's own `music.play`, so sounds from different places
 * overlap as Arcade mixes them. Each call site of a play keeps a record in
 * its sprite's attachment of the copy it plays in the background and the
 * loop it drives, so a rule held across frames starts no new copy while the
 * last one plays and no second loop while its loop runs.
 */
namespace wendoo {
  /**
   * Log code: a play tone was given a number that is no finite number --
   * an infinity or a not-a-number -- which it read as that slot's default.
   * Logged as `wendoo WENDOO_TONE_UNUSABLE`, once per game run, while
   * {@link debug} is on.
   */
  //% hidden
  export const TONE_UNUSABLE = "WENDOO_TONE_UNUSABLE";

  /** What plays every sound the pack's tiles play: Arcade's own mixer. */
  //% hidden
  export class SoundMixer {
    constructor() {}

    /**
     * Play `playable` once, returning once it has played to its end -- or,
     * for a melody, once it is stopped -- as Arcade's until-done playback
     * does. Call it from a fiber that may wait.
     *
     * @param playable - The melody, tone or shaped tone to play.
     */
    play(playable: music.Playable): void {
      music.play(playable, music.PlaybackMode.UntilDone);
    }

    /**
     * Play `playable` over and over, each time from the end of the last,
     * until every sound stops: Arcade's own loop of a playable, which marks
     * it `stopped` once it ends. Returns at once.
     *
     * @param playable - The melody, tone or shaped tone to loop.
     */
    loop(playable: music.Playable): void {
      playable.loop();
    }

    /** Stop every sound playing, every loop of the current scene included, through Arcade's own `music.stopAllSounds`. */
    stopAll(): void {
      music.stopAllSounds();
    }
  }

  /** What one call site of a play has playing on its own: its copy in the background and its loop. */
  //% hidden
  export class SoundSite {
    /** Whether the copy this call site last started in the background still plays. */
    playing: boolean = false;
    /** The playable this call site last started looping, or `undefined` when it started none. */
    loop: music.Playable = undefined;

    constructor() {}

    /** Whether this call site's copy in the background still plays, or its loop still runs. */
    busy(): boolean {
      return this.playing || (this.loop !== undefined && !this.loop.stopped);
    }
  }

  /** One program run's sound records: one {@link SoundSite} per call site of a play, made as each first plays. */
  //% hidden
  export class SoundSites {
    /** The call sites holding a record, in the order each first played; `sites` holds each one's record at the same index. */
    callSiteIds: number[] = [];
    /** The record of the call site at the same index of `callSiteIds`. */
    sites: SoundSite[] = [];

    constructor() {}

    /**
     * The record of the call site `callSiteId`, made on its first use.
     *
     * @param callSiteId - Call-site id of a play.
     */
    site(callSiteId: number): SoundSite {
      const index = this.callSiteIds.indexOf(callSiteId);
      if (index >= 0) {
        return this.sites[index];
      }
      const site = new SoundSite();
      this.callSiteIds.push(callSiteId);
      this.sites.push(site);
      return site;
    }
  }

  /**
   * The sounds one scene's programs play, each through
   * {@link SceneSounds.mixer}. Playing never blocks the caller: a play the
   * caller waits on plays from a fiber of its own.
   */
  //% hidden
  export class SceneSounds {
    /** What every sound is played through; replace it to play them through another. */
    mixer: SoundMixer = new SoundMixer();

    constructor() {}

    /**
     * Play `playable` once from a fiber of its own and tell `done` from that
     * fiber once it has played.
     *
     * @param playable - The melody, tone or shaped tone to play.
     * @param done - Told once the play returns.
     */
    playUntilDone(playable: music.Playable, done: () => void): void {
      control.runInParallel(() => {
        this.mixer.play(playable);
        done();
      });
    }

    /**
     * Play `playable` once in the background for the call site `site`, from
     * a fiber of its own: nothing when the call site's last copy still
     * plays or its loop runs.
     *
     * @param site - Record of the call site playing.
     * @param playable - The melody, tone or shaped tone to play.
     */
    playInBackground(site: SoundSite, playable: music.Playable): void {
      if (site.busy()) {
        return;
      }
      site.playing = true;
      control.runInParallel(() => {
        this.mixer.play(playable);
        site.playing = false;
      });
    }

    /**
     * Loop `playable` for the call site `site` until every sound stops:
     * nothing when the call site's loop still runs or its last copy in the
     * background still plays.
     *
     * @param site - Record of the call site playing.
     * @param playable - The melody, tone or shaped tone to loop.
     */
    playLooping(site: SoundSite, playable: music.Playable): void {
      if (site.busy()) {
        return;
      }
      site.loop = playable;
      this.mixer.loop(playable);
    }

    /** Stop every sound playing and every loop running. */
    stopAll(): void {
      this.mixer.stopAll();
    }
  }

  /** Key the sounds of a scene are kept under in the scene's data. */
  const SCENE_SOUNDS_KEY = "wendoo.sounds";

  /**
   * The sounds of `gameScene`, created on first use.
   *
   * @param gameScene - The scene whose programs play sounds.
   */
  //% hidden
  export function sceneSounds(gameScene: scene.Scene): SceneSounds {
    const existing = gameScene.data[SCENE_SOUNDS_KEY] as SceneSounds;
    if (existing) {
      return existing;
    }
    const sounds = new SceneSounds();
    gameScene.data[SCENE_SOUNDS_KEY] = sounds;
    return sounds;
  }
}
