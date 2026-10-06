/**
 * The random-number stream a brain's random reads draw from.
 */
namespace wendoo {
  /**
   * A random-number stream: each {@link RngServices.next} call draws the
   * stream's next number. The base implementation draws from the platform's
   * own random numbers; subclass and override {@link RngServices.next} to
   * draw from another stream. Pass the instance to
   * {@link registerCoreHostActions}.
   */
  export class RngServices {
    constructor() {}

    /** The stream's next number, from 0 up to but not including 1. */
    next(): number {
      return Math.random();
    }
  }
}
