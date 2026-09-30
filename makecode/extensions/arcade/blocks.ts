/**
 * The Wendoo blocks for MakeCode Arcade.
 */
//% color="#6a4bc4" weight=60 icon="" block="Wendoo"
namespace wendoo {
  /**
   * Run a program on a sprite. From the next frame the sprite runs
   * `program`, in place of any program it ran before; destroying the sprite
   * ends its program. Pick "none" to stop the sprite's program.
   *
   * @param sprite - The sprite to run the program on.
   * @param program - The program to run: one of the project's programs, by name.
   */
  //% blockId=wendoo_run_program
  //% block="run program $program on $sprite"
  //% sprite.shadow=variables_get sprite.defl=mySprite
  //% program.defl=wendooPrograms.none
  //% weight=100
  export function runProgram(sprite: Sprite, program: CompiledBrainRegistration): void {
    if (!sprite || !program) {
      return;
    }
    sceneProgramHost(game.currentScene()).attach(new SpriteWorld(sprite), program);
  }
}
