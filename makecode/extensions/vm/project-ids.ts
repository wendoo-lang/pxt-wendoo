/**
 * The project's id manifest, as the program reads it: the generated module
 * the Wendoo simulator extension writes into the project calls these from
 * top-level code, once per allocated id, and the program host drains every
 * pack registration through the mapping the calls build. Recording an id
 * registers nothing.
 */
namespace wendoo {
  /** The ids the project's manifest declared since program start. */
  const projectIdMap = new RegistrationIdMap();

  /**
   * Record the host-action id the project's manifest allocates the tile
   * `name`.
   *
   * @param name - Tile name.
   * @param id - Host-action id.
   */
  //% hidden
  export function mapActionId(name: string, id: number): void {
    projectIdMap.addAction(name, id);
  }

  /**
   * Record the host-function id the project's manifest allocates the
   * operator `name`.
   *
   * @param name - Operator name.
   * @param id - Host-function id.
   */
  //% hidden
  export function mapOperatorId(name: string, id: number): void {
    projectIdMap.addOperator(name, id);
  }

  /**
   * Record the type-atom id the project's manifest allocates the struct type
   * `name`, and its fields' ids: each field's id is its position in
   * `fieldNames`.
   *
   * @param name - Type name.
   * @param atomId - Type-atom id.
   * @param fieldNames - Every field name the manifest allocates for the type, each at the position that is its id.
   */
  //% hidden
  export function mapTypeIds(name: string, atomId: number, fieldNames: string[]): void {
    projectIdMap.addType(name, atomId, fieldNames);
  }

  /** The mapping the project's manifest declared since program start. */
  //% hidden
  export function projectIds(): RegistrationIdMap {
    return projectIdMap;
  }
}
