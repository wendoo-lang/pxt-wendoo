/**
 * The numeric semantics a brain observes: how number results round, and how
 * numbers convert to and from text.
 */
namespace wendoo {
  /**
   * Brain-observable numeric semantics of the sts-f64 world: every number is
   * an IEEE-754 binary64 double. Pass the instance to
   * {@link registerCoreHostFunctions}; the core host functions compute their
   * results through it.
   */
  export class F64Numerics {
    constructor() {}

    /**
     * The result-rounding policy applied to every numeric operator result:
     * returns `x` unchanged.
     *
     * @param x - An operator's unrounded result.
     */
    round(x: number): number {
      return x;
    }

    /**
     * The decimal string form of `x`.
     *
     * @param x - The number to format.
     */
    formatNumber(x: number): string {
      return `${x}`;
    }

    /**
     * The number `text` spells in decimal; text that does not parse as a
     * number yields 0.
     *
     * @param text - The text to parse.
     */
    parseNumber(text: string): number {
      // biome-ignore lint/style/useNumberNamespace: pxt declares only the global parseFloat.
      const parsed = parseFloat(text);
      return isNotANumber(parsed) ? 0 : parsed;
    }
  }
}
