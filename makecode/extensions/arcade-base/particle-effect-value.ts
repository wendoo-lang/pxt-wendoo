/**
 * Particle effects as Wendoo values: the `ParticleEffect` type a program
 * names one of Arcade's particle effects by -- the effects Arcade's own
 * destroy block offers -- and the Arcade effect a value names, looked up when
 * a tile uses it.
 */
namespace wendoo {
  /** Wendoo type name of a particle effect value: a plain struct naming one of Arcade's particle effects. */
  //% hidden
  export const TYPE_PARTICLE_EFFECT = "ParticleEffect";

  /**
   * Log code: a tile was given a `ParticleEffect` value naming no particle
   * effect Arcade holds, which it read as no effect. Logged as
   * `wendoo WENDOO_PARTICLE_EFFECT_UNUSABLE`, once per game run, while
   * {@link debug} is on.
   */
  //% hidden
  export const PARTICLE_EFFECT_UNUSABLE = "WENDOO_PARTICLE_EFFECT_UNUSABLE";

  /**
   * The names of the effects the `ParticleEffect` type declares literals for:
   * Arcade's particle-only effects, then its screen effects.
   */
  const PARTICLE_EFFECT_NAMES = [
    "spray",
    "trail",
    "fountain",
    "rings",
    "fire",
    "warmRadial",
    "coolRadial",
    "halo",
    "ashes",
    "disintegrate",
    "confetti",
    "hearts",
    "smiles",
    "blizzard",
    "bubbles",
    "starField",
    "clouds",
    "none",
  ];

  /** The label of each particle effect, at its name's position in {@link PARTICLE_EFFECT_NAMES}. */
  const PARTICLE_EFFECT_LABELS = [
    "spray",
    "trail",
    "fountain",
    "rings",
    "fire",
    "warm radial",
    "cool radial",
    "halo",
    "ashes",
    "disintegrate",
    "confetti",
    "hearts",
    "smiles",
    "blizzard",
    "bubbles",
    "star field",
    "clouds",
    "none",
  ];

  /**
   * The `ParticleEffect` type's declared literals, one per Arcade particle
   * effect, keyed by the name Arcade's API gives it and labelled as Arcade's
   * blocks show it, each holding its name in the `name` field.
   */
  //% hidden
  export function particleEffectLiterals(): TypeLiteral[] {
    return namedChoiceLiterals(PARTICLE_EFFECT_NAMES, PARTICLE_EFFECT_LABELS);
  }

  /**
   * The Arcade particle effect named `name`, as `effects.<name>` names it, or
   * `undefined` for a name naming none of the effects the `ParticleEffect`
   * type declares literals for.
   *
   * @param name - The name Arcade's API gives the effect, such as `warmRadial`.
   */
  //% hidden
  export function arcadeParticleEffectNamed(name: string): effects.ParticleEffect {
    switch (name) {
      case "spray":
        return effects.spray;
      case "trail":
        return effects.trail;
      case "fountain":
        return effects.fountain;
      case "rings":
        return effects.rings;
      case "fire":
        return effects.fire;
      case "warmRadial":
        return effects.warmRadial;
      case "coolRadial":
        return effects.coolRadial;
      case "halo":
        return effects.halo;
      case "ashes":
        return effects.ashes;
      case "disintegrate":
        return effects.disintegrate;
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
    }
    return undefined;
  }

  /** The `ParticleEffect` type's binding: a value names its effect by the name its `name` field holds. */
  //% hidden
  export class ParticleEffectBinding extends NamedChoiceBinding {
    constructor() {
      super(PARTICLE_EFFECT_UNUSABLE);
    }

    /**
     * The Arcade particle effect `value` names, or `undefined` while `value`
     * is nil or names no particle effect Arcade holds; a placed value naming
     * none is logged as {@link PARTICLE_EFFECT_UNUSABLE}.
     *
     * @param value - A `ParticleEffect` slot's value, nil while the slot is empty.
     */
    particleEffectOf(value: Value): effects.ParticleEffect {
      if (!this.isPlaced(value)) {
        return undefined;
      }
      const effect = arcadeParticleEffectNamed(this.nameOf(value));
      if (!effect) {
        this.reportUnusable();
      }
      return effect;
    }
  }

  /**
   * The `ParticleEffect` type's binding. Its atom id and field id are the
   * project's mapping's once the program host has drained registrations.
   */
  //% hidden
  export const particleEffectBinding = new ParticleEffectBinding();
}
