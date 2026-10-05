/**
 * Debug logging: the machine-readable lines the Wendoo extensions write to
 * the console -- program refusals and updates, refused messages,
 * registration diagnostics, unresolved assets -- written only while a
 * developer has turned it on.
 */
namespace wendoo {
  /**
   * Whether the Wendoo extensions write their debug lines to the console;
   * off until a program sets it, as `wendoo.debug = true`.
   */
  //% hidden
  // biome-ignore lint/style/useConst: programs outside this file assign it.
  export let debug = false;

  /**
   * Write `line` to the console while {@link debug} is on; write nothing
   * otherwise.
   *
   * @param line - The line, without its terminator.
   */
  //% hidden
  export function debugLog(line: string): void {
    if (debug) {
      console.log(line);
    }
  }
}
