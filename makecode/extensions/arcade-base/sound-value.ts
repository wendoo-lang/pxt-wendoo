/**
 * Sounds as Wendoo values: the `Sound` type a program names one of Arcade's
 * built-in melodies by -- the melodies Arcade's own sound blocks offer -- and
 * the Arcade melody a value names, looked up when a tile uses it.
 */
namespace wendoo {
  /** Wendoo type name of a sound value: a plain struct naming one of Arcade's built-in melodies. */
  //% hidden
  export const TYPE_SOUND = "Sound";

  /**
   * Log code: a tile was given a `Sound` value naming no melody Arcade
   * holds, which it read as no sound. Logged as `wendoo WENDOO_SOUND_UNUSABLE`,
   * once per game run, while {@link debug} is on.
   */
  //% hidden
  export const SOUND_UNUSABLE = "WENDOO_SOUND_UNUSABLE";

  /** The names of the melodies the `Sound` type declares literals for, in the order Arcade's sound blocks offer them. */
  const SOUND_NAMES = [
    "baDing",
    "wawawawaa",
    "jumpUp",
    "jumpDown",
    "powerUp",
    "powerDown",
    "magicWand",
    "siren",
    "pewPew",
    "knock",
    "footstep",
    "thump",
    "smallCrash",
    "bigCrash",
    "zapped",
    "buzzer",
    "sonar",
    "spooky",
    "beamUp",
  ];

  /** The label of each melody, at its name's position in {@link SOUND_NAMES}. */
  const SOUND_LABELS = [
    "ba ding",
    "wawawawaa",
    "jump up",
    "jump down",
    "power up",
    "power down",
    "magic wand",
    "siren",
    "pew pew",
    "knock",
    "footstep",
    "thump",
    "small crash",
    "big crash",
    "zapped",
    "buzzer",
    "sonar",
    "spooky",
    "beam up",
  ];

  /**
   * The `Sound` type's declared literals, one per Arcade built-in melody,
   * keyed by the name Arcade's API gives it and labelled as Arcade's blocks
   * show it, each holding its name in the `name` field.
   */
  //% hidden
  export function soundLiterals(): TypeLiteral[] {
    return namedChoiceLiterals(SOUND_NAMES, SOUND_LABELS);
  }

  /**
   * The Arcade built-in melody named `name`, as `music.<name>` names it, or
   * `undefined` for a name naming none of the melodies the `Sound` type
   * declares literals for.
   *
   * @param name - The name Arcade's API gives the melody, such as `powerUp`.
   */
  //% hidden
  export function arcadeMelodyNamed(name: string): music.Melody {
    switch (name) {
      case "baDing":
        return music.baDing;
      case "wawawawaa":
        return music.wawawawaa;
      case "jumpUp":
        return music.jumpUp;
      case "jumpDown":
        return music.jumpDown;
      case "powerUp":
        return music.powerUp;
      case "powerDown":
        return music.powerDown;
      case "magicWand":
        return music.magicWand;
      case "siren":
        return music.siren;
      case "pewPew":
        return music.pewPew;
      case "knock":
        return music.knock;
      case "footstep":
        return music.footstep;
      case "thump":
        return music.thump;
      case "smallCrash":
        return music.smallCrash;
      case "bigCrash":
        return music.bigCrash;
      case "zapped":
        return music.zapped;
      case "buzzer":
        return music.buzzer;
      case "sonar":
        return music.sonar;
      case "spooky":
        return music.spooky;
      case "beamUp":
        return music.beamUp;
    }
    return undefined;
  }

  /** The `Sound` type's binding: a value names its melody by the name its `name` field holds. */
  //% hidden
  export class SoundBinding extends NamedChoiceBinding {
    constructor() {
      super(SOUND_UNUSABLE);
    }

    /**
     * The Arcade built-in melody `value` names, or `undefined` while `value`
     * is nil or names no melody Arcade holds; a placed value naming none is
     * logged as {@link SOUND_UNUSABLE}.
     *
     * @param value - A `Sound` slot's value, nil while the slot is empty.
     */
    melodyOf(value: Value): music.Melody {
      if (!this.isPlaced(value)) {
        return undefined;
      }
      const melody = arcadeMelodyNamed(this.nameOf(value));
      if (!melody) {
        this.reportUnusable();
      }
      return melody;
    }
  }

  /**
   * The `Sound` type's binding. Its atom id and field id are the project's
   * mapping's once the program host has drained registrations.
   */
  //% hidden
  export const soundBinding = new SoundBinding();
}
