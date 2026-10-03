/**
 * The Wendoo blocks for MakeCode Arcade.
 */
//% color="#6a4bc4" weight=60 icon="" block="Wendoo"
namespace wendoo {
  /**
   * Run a brain on a sprite. From the next frame the sprite runs `brain`, in
   * place of any brain it ran before; destroying the sprite ends its brain.
   * Pick "none" to stop the sprite's brain.
   *
   * @param sprite - The sprite to run the brain on.
   * @param brain - The brain to run: one of the project's brains, by name.
   */
  //% blockId=wendoo_run_program
  //% block="run brain $brain on $sprite"
  //% sprite.shadow=variables_get sprite.defl=mySprite
  //% brain.defl=wendooBrains.none
  //% weight=100
  export function runProgram(sprite: Sprite, brain: CompiledBrainRegistration): void {
    if (!sprite || !brain) {
      return;
    }
    sceneProgramHost(game.currentScene()).attach(new SpriteWorld(sprite), brain);
  }
}
