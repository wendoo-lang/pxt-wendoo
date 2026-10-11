/**
 * Players as Wendoo values: the `Player` type a program names one of
 * Arcade's four players by, the value naming a player, the player a value
 * names, whether two values name the same player, and the player's score.
 * A `Player` value holds its player's number, 1 to 4, in its read-only
 * `number` field; its `score` field holds nothing of its own, and is read
 * from and written to that player's score in Arcade's head-up display
 * through `info.playerN.impl`.
 */
namespace wendoo {
  /** Wendoo type name of a player value: a struct naming one of Arcade's four players by number. */
  //% hidden
  export const TYPE_PLAYER = "Player";

  /** Position of the `number` field among the `Player` type's declared fields, which indexes its binding's field ids. */
  const PLAYER_FIELD_NUMBER = 0;

  /** Position of the `score` field among the `Player` type's declared fields, which indexes its binding's field ids. */
  const PLAYER_FIELD_SCORE = 1;

  /** Name of the `Player` type's field holding the number of the player a value names. */
  const PLAYER_NUMBER_FIELD = "number";

  /**
   * Log code: a program wrote a player's `score`, or added to it, a value
   * holding no finite number, which changed nothing. Logged as
   * `wendoo WENDOO_SCORE_UNUSABLE`, once per game run, while {@link debug}
   * is on.
   */
  //% hidden
  export const SCORE_UNUSABLE = "WENDOO_SCORE_UNUSABLE";

  /**
   * The `Player` type's declared fields, at their `PLAYER_FIELD_*`
   * positions: `number`, the read-only number of the player a value names;
   * and `score`, a writable number with an accessor tile.
   */
  //% hidden
  export function playerFields(): StructFieldSpec[] {
    return [readOnlyField(PLAYER_NUMBER_FIELD, TYPE_NUMBER), withAccessor(field("score", TYPE_NUMBER), "score")];
  }

  /**
   * The `Player` type's declared literals, one per player, in player order:
   * keys `"1"` to `"4"`, labelled `player one` to `player four`, each
   * holding its player's number in the `number` field. The keys are public
   * identity in saved programs: never rename or reuse one.
   */
  //% hidden
  export function playerLiterals(): TypeLiteral[] {
    const labels = ["player one", "player two", "player three", "player four"];
    const literals: TypeLiteral[] = [];
    for (let i = 0; i < labels.length; i++) {
      const player = i + 1;
      literals.push(typeLiteral(`${player}`, labels[i], [literalField(PLAYER_NUMBER_FIELD, mkNumber(player))]));
    }
    return literals;
  }

  /**
   * The number of the player `value` names, as its `number` field holds it,
   * or 0 when `value` is not a `Player` value holding a number, nil included.
   *
   * @param value - Any value a program produced.
   */
  //% hidden
  export function playerNumberOf(value: Value): number {
    if (!value || value.t !== ValueTag.Struct || value.typeId !== structTypeId(TYPE_PLAYER)) {
      return 0;
    }
    const held = value.fields[playerBinding.fieldIds[PLAYER_FIELD_NUMBER]];
    return held && held.t === ValueTag.Number ? held.num : 0;
  }

  /**
   * The `Player` value naming the player numbered `player`, as the type's
   * literal of that player holds it: a struct of the type's declared fields,
   * its `number` field holding `player` and every other field nil. Its
   * layout is the project's id manifest's ({@link projectIds}), so it may be
   * made before the program host drains registrations.
   *
   * @param player - A player number, 1 to 4.
   */
  //% hidden
  export function playerValue(player: number): Value {
    const numberId = projectIds().fieldId(TYPE_PLAYER, PLAYER_NUMBER_FIELD);
    const width = Math.max(playerFields().length, numberId + 1);
    const slots: Value[] = [];
    for (let i = 0; i < width; i++) {
      slots.push(NIL_VALUE);
    }
    if (numberId >= 0) {
      slots[numberId] = mkNumber(player);
    }
    return mkStruct(structTypeId(TYPE_PLAYER), slots);
  }

  /**
   * Whether `a` and `b` name the same player: both `Player` values whose
   * `number` fields hold the same player number. `false` when either names
   * no player, nil included.
   *
   * @param a - Any value a program produced.
   * @param b - Any value a program produced.
   */
  //% hidden
  export function samePlayer(a: Value, b: Value): boolean {
    const player = playerNumberOf(a);
    return player > 0 && player === playerNumberOf(b);
  }

  /**
   * The number of the player an optional `Player` slot reads: the player
   * `value` names, else player one.
   *
   * @param value - The slot's value: a `Player` value, or nil when the slot is empty.
   */
  //% hidden
  export function slotPlayerNumber(value: Value): number {
    const player = playerNumberOf(value);
    return player > 0 ? player : 1;
  }

  /**
   * Arcade's record of the player numbered `player`, or `undefined` for a
   * number naming none of the four players.
   *
   * @param player - A player number, 1 to 4.
   */
  //% hidden
  export function playerInfoOf(player: number): info.PlayerInfo {
    switch (player) {
      case 1:
        return info.player1;
      case 2:
        return info.player2;
      case 3:
        return info.player3;
      case 4:
        return info.player4;
    }
    return undefined;
  }

  /**
   * The `Player` type's binding: each value holds its player's number in
   * its `number` field, and the `score` field is read from and written to
   * that player's score through the field hooks, by way of
   * `info.playerN.impl` alone: a read of player one's score shows nothing
   * until a write sets a score, and any read or write of player two's,
   * three's or four's switches the display to Arcade's multiplayer one. A
   * write of a finite number sets the score, which
   * Arcade truncates toward zero; a write of anything else -- not-a-number,
   * an infinity, or no number -- changes nothing and is logged as
   * {@link SCORE_UNUSABLE}. No write is ever refused.
   */
  //% hidden
  export class PlayerBinding extends StructTypeBinding {
    /** Whether an unusable score write or addition has been logged in this game run. */
    private scoreUnusableLogged = false;

    constructor() {
      super();
      this.hasFieldGetter = true;
      this.hasFieldSetter = true;
    }

    fieldGetter(source: Value, fieldId: number, ctx: ExecutionContext): Value {
      if (fieldId === this.fieldIds[PLAYER_FIELD_SCORE]) {
        const player = playerInfoOf(playerNumberOf(source));
        return player ? mkNumber(player.impl.score()) : undefined;
      }
      return fieldId < source.fields.length ? source.fields[fieldId] : undefined;
    }

    fieldSetter(source: Value, fieldId: number, value: Value, ctx: ExecutionContext): boolean {
      if (fieldId === this.fieldIds[PLAYER_FIELD_SCORE]) {
        const player = playerInfoOf(playerNumberOf(source));
        if (player && this.usableScore(value)) {
          player.impl.setScore(value.num);
        }
      }
      return true;
    }

    /**
     * Change the score of the player numbered `player` by the number
     * `amount` holds, a negative number taking it away, or by 1 while
     * `amount` is nil. A value holding no finite number changes nothing and
     * is logged as {@link SCORE_UNUSABLE}; a number naming no player changes
     * nothing.
     *
     * @param player - The player's number, 1 to 4.
     * @param amount - The amount to add: a number, or nil to add 1.
     */
    addScore(player: number, amount: Value): void {
      const record = playerInfoOf(player);
      if (!record) {
        return;
      }
      if (!amount || amount.t === ValueTag.Nil) {
        record.impl.changeScoreBy(1);
      } else if (this.usableScore(amount)) {
        record.impl.changeScoreBy(amount.num);
      }
    }

    /** Whether `value` holds a finite number; log one that does not, the first time in this game run. */
    private usableScore(value: Value): boolean {
      if (value && value.t === ValueTag.Number && isFiniteNumber(value.num)) {
        return true;
      }
      if (!this.scoreUnusableLogged) {
        this.scoreUnusableLogged = true;
        debugLog(`wendoo ${SCORE_UNUSABLE}`);
      }
      return false;
    }
  }

  /**
   * The `Player` type's binding. Its atom id and field ids are the project's
   * mapping's once the program host has drained registrations.
   */
  //% hidden
  export const playerBinding = new PlayerBinding();
}
