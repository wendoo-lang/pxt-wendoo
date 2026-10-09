/**
 * Effects as Wendoo values: the `Effect` type a program names one of
 * Arcade's screen effects by -- the effects Arcade's own game-over blocks
 * offer -- and the Arcade effect a value names, looked up when a tile uses
 * it.
 */
namespace wendoo {
  /** Wendoo type name of an effect value: a plain struct naming one of Arcade's screen effects. */
  //% hidden
  export const TYPE_EFFECT = "Effect";

  /**
   * Log code: a tile was given an `Effect` value naming no effect Arcade
   * holds, which it read as no effect. Logged as `wendoo WENDOO_EFFECT_UNUSABLE`,
   * once per game run, while {@link debug} is on.
   */
  //% hidden
  export const EFFECT_UNUSABLE = "WENDOO_EFFECT_UNUSABLE";

  /** The names of the effects the `Effect` type declares literals for, in the order Arcade's game-over blocks offer them. */
  const EFFECT_NAMES = [
    "confetti",
    "hearts",
    "smiles",
    "blizzard",
    "bubbles",
    "starField",
    "clouds",
    "none",
    "dissolve",
    "melt",
    "slash",
    "splatter",
  ];

  /** The label of each effect, at its name's position in {@link EFFECT_NAMES}. */
  const EFFECT_LABELS = [
    "confetti",
    "hearts",
    "smiles",
    "blizzard",
    "bubbles",
    "star field",
    "clouds",
    "none",
    "dissolve",
    "melt",
    "slash",
    "splatter",
  ];

  /**
   * The `Effect` type's declared literals, one per Arcade screen effect, keyed
   * by the name Arcade's API gives it and labelled as Arcade's blocks show
   * it, each holding its name in the `name` field.
   */
  //% hidden
  export function effectLiterals(): TypeLiteral[] {
    return namedChoiceLiterals(EFFECT_NAMES, EFFECT_LABELS);
  }

  /**
   * The Arcade screen effect named `name`, as `effects.<name>` names it, or
   * `undefined` for a name naming none of the effects the `Effect` type
   * declares literals for.
   *
   * @param name - The name Arcade's API gives the effect, such as `starField`.
   */
  //% hidden
  export function arcadeEffectNamed(name: string): effects.BackgroundEffect {
    switch (name) {
      case "confetti":
        return effects.confetti;
      case "hearts":
        return effects.hearts;
      case "smiles":
        return effects.smiles;
      case "blizzard":
        return effects.blizzard;
      case "bubbles":
        return effects.bubbles;
      case "starField":
        return effects.starField;
      case "clouds":
        return effects.clouds;
      case "none":
        return effects.none;
      case "dissolve":
        return effects.dissolve;
      case "melt":
        return effects.melt;
      case "slash":
        return effects.slash;
      case "splatter":
        return effects.splatter;
    }
    return undefined;
  }

  /** The `Effect` type's binding: a value names its effect by the name its `name` field holds. */
  //% hidden
  export class EffectBinding extends NamedChoiceBinding {
    constructor() {
      super(EFFECT_UNUSABLE);
    }

    /**
     * The Arcade screen effect `value` names, or `undefined` while `value` is
     * nil or names no effect Arcade holds; a placed value naming none is
     * logged as {@link EFFECT_UNUSABLE}.
     *
     * @param value - An `Effect` slot's value, nil while the slot is empty.
     */
    effectOf(value: Value): effects.BackgroundEffect {
      if (!this.isPlaced(value)) {
        return undefined;
      }
      const effect = arcadeEffectNamed(this.nameOf(value));
      if (!effect) {
        this.reportUnusable();
      }
      return effect;
    }
  }

  /**
   * The `Effect` type's binding. Its atom id and field id are the project's
   * mapping's once the program host has drained registrations.
   */
  //% hidden
  export const effectBinding = new EffectBinding();
}
