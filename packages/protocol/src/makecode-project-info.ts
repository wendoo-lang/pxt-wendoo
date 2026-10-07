/**
 * The project-info wire contract: facts about the MakeCode project as a
 * whole, published by the party serving the project.
 */

/**
 * Payload of a {@link MakeCodeProjectInfoMessage}: the MakeCode project's
 * facts as they are when it is sent. Any field added to it is optional, and
 * a party reads the fields it knows and ignores the rest.
 */
export interface MakeCodeProjectInfo {
  /** The project's name, as the person working on it in MakeCode named it. */
  name: string;
}

/**
 * The MakeCode project's facts, published by the party serving the project
 * once the session is established and again whenever any of them changes.
 * Each message is whole: a later one replaces an earlier one. A session may
 * carry none, and the project's facts are then unknown.
 */
export interface MakeCodeProjectInfoMessage {
  type: "makecode:projectInfo";
  payload: MakeCodeProjectInfo;
}
