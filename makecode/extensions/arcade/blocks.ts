/**
 * One of Arcade's four players, as a block's player dropdown offers it.
 */
enum BrainPlayer {
  //% block="player one"
  One = 1,
  //% block="player two"
  Two = 2,
  //% block="player three"
  Three = 3,
  //% block="player four"
  Four = 4,
}

/**
 * The Wendoo blocks for MakeCode Arcade.
 */
//% color="#6a4bc4" weight=60 icon="" block="Wendoo"
//% groups='["Run", "Variables"]'
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
  //% group="Run" weight=100
  export function runBrain(sprite: Sprite, brain: CompiledBrainRegistration): void {
    if (!sprite || !brain) {
      return;
    }
    sceneProgramHost(game.currentScene()).attach(new SpriteAttachment(sprite), brain);
  }

  /**
   * Set a number variable of the brain a sprite runs. The brain reads the
   * new value from its next think. Set right after **run brain**, the value
   * is in place from the brain's first think.
   *
   * @param sprite - The sprite whose brain to change.
   * @param name - The variable's name, exactly as the brain shows it.
   * @param value - The number to put in the variable.
   */
  //% blockId=wendoo_set_brain_number
  //% block="set brain number $name of $sprite to $value"
  //% sprite.shadow=variables_get sprite.defl=mySprite
  //% group="Variables" weight=90 blockGap=8
  export function setBrainNumber(sprite: Sprite, name: string, value: number): void {
    writeBrainVariable(sprite, name, mkNumber(value));
  }

  /**
   * Read a number variable of the brain a sprite runs. Reads 0 when the
   * variable holds no number, or the sprite runs no brain.
   *
   * @param sprite - The sprite whose brain to read.
   * @param name - The variable's name, exactly as the brain shows it.
   */
  //% blockId=wendoo_brain_number
  //% block="brain number $name of $sprite"
  //% sprite.shadow=variables_get sprite.defl=mySprite
  //% group="Variables" weight=89
  export function readBrainNumber(sprite: Sprite, name: string): number {
    const value = readBrainVariable(sprite, name, ValueTag.Number);
    return value ? value.num : 0;
  }

  /**
   * Set a text variable of the brain a sprite runs. The brain reads the new
   * value from its next think. Set right after **run brain**, the value is
   * in place from the brain's first think.
   *
   * @param sprite - The sprite whose brain to change.
   * @param name - The variable's name, exactly as the brain shows it.
   * @param value - The text to put in the variable.
   */
  //% blockId=wendoo_set_brain_text
  //% block="set brain text $name of $sprite to $value"
  //% sprite.shadow=variables_get sprite.defl=mySprite
  //% group="Variables" weight=88 blockGap=8
  export function setBrainString(sprite: Sprite, name: string, value: string): void {
    writeBrainVariable(sprite, name, mkString(value));
  }

  /**
   * Read a text variable of the brain a sprite runs. Reads empty text when
   * the variable holds no text, or the sprite runs no brain.
   *
   * @param sprite - The sprite whose brain to read.
   * @param name - The variable's name, exactly as the brain shows it.
   */
  //% blockId=wendoo_brain_text
  //% block="brain text $name of $sprite"
  //% sprite.shadow=variables_get sprite.defl=mySprite
  //% group="Variables" weight=87
  export function readBrainString(sprite: Sprite, name: string): string {
    const value = readBrainVariable(sprite, name, ValueTag.String);
    return value ? value.str : "";
  }

  /**
   * Set a boolean variable of the brain a sprite runs. The brain reads the
   * new value from its next think. Set right after **run brain**, the value
   * is in place from the brain's first think.
   *
   * @param sprite - The sprite whose brain to change.
   * @param name - The variable's name, exactly as the brain shows it.
   * @param value - The boolean to put in the variable.
   */
  //% blockId=wendoo_set_brain_boolean
  //% block="set brain boolean $name of $sprite to $value"
  //% sprite.shadow=variables_get sprite.defl=mySprite
  //% group="Variables" weight=86 blockGap=8
  export function setBrainBoolean(sprite: Sprite, name: string, value: boolean): void {
    writeBrainVariable(sprite, name, mkBoolean(value));
  }

  /**
   * Read a boolean variable of the brain a sprite runs. Reads false when the
   * variable holds no boolean, or the sprite runs no brain.
   *
   * @param sprite - The sprite whose brain to read.
   * @param name - The variable's name, exactly as the brain shows it.
   */
  //% blockId=wendoo_brain_boolean
  //% block="brain boolean $name of $sprite"
  //% sprite.shadow=variables_get sprite.defl=mySprite
  //% group="Variables" weight=85
  export function readBrainBoolean(sprite: Sprite, name: string): boolean {
    const value = readBrainVariable(sprite, name, ValueTag.Boolean);
    return value ? value.b : false;
  }

  /**
   * Put a player into a player variable of the brain a sprite runs. The
   * brain reads the player from its next think. Set right after **run
   * brain**, the player is in place from the brain's first think.
   *
   * @param sprite - The sprite whose brain to change.
   * @param name - The variable's name, exactly as the brain shows it.
   * @param player - The player to put in the variable.
   */
  //% blockId=wendoo_set_brain_player
  //% block="set brain player $name of $sprite to $player"
  //% sprite.shadow=variables_get sprite.defl=mySprite
  //% group="Variables" weight=84
  export function setBrainPlayer(sprite: Sprite, name: string, player: BrainPlayer): void {
    writeBrainVariable(sprite, name, playerValue(player));
  }

  /** Write `value` into the variable `name` of the brain `sprite` runs, through the current scene's program host. */
  function writeBrainVariable(sprite: Sprite, name: string, value: Value): void {
    sceneProgramHost(game.currentScene()).writeVariable(new SpriteAttachment(sprite), name, value);
  }

  /** The value tagged `tag` the variable `name` of the brain `sprite` runs holds, read through the current scene's program host; `undefined` when it holds none. */
  function readBrainVariable(sprite: Sprite, name: string, tag: ValueTag): Value {
    return sceneProgramHost(game.currentScene()).readVariable(new SpriteAttachment(sprite), name, tag);
  }
}
