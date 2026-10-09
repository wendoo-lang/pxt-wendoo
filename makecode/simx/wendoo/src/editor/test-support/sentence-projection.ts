/**
 * Reads a rule's projected sentence as data for specs: which sentence frame
 * its WHEN side was read through, and the words its tiles contributed, each
 * with the index of the tile it renders. The result does not depend on any
 * locale's sentence wording.
 */
import type { IBrainRuleDef } from "@wendoo/core/brain";
import { projectRuleSentence } from "@wendoo/core/brain/language-service";
import type { Localizer } from "@wendoo/core/localization";
import { createLocalizer, defaultPluralRule } from "@wendoo/core/localization";

/** A sentence frame, as a projection reads a sensor heading a WHEN side through it. */
export type ProjectedFrame = "verb" | "state" | "event";

/** One word a tile contributed to a projected sentence. */
export interface ProjectedWord {
  /** The word, as the tile's metadata authors it. */
  readonly text: string;
  /** Index, in the rule's WHEN tiles then its DO tiles, of the tile the word renders. */
  readonly sourceTileIndex: number;
}

/** A rule's projected sentence, read as data. */
export interface ProjectedSentence {
  /** The frame the WHEN side was read through, or `undefined` when it was read through none. */
  readonly frame: ProjectedFrame | undefined;
  /** Every word segment of the sentence, in order. */
  readonly words: readonly ProjectedWord[];
}

/** The marker each frame's WHEN template opens with in {@link frameMarkingLocalizer}'s catalog. */
const FRAME_MARKERS: Readonly<Record<ProjectedFrame, string>> = {
  verb: "FRAME-VERB ",
  state: "FRAME-STATE ",
  event: "FRAME-EVENT ",
};

/**
 * A localizer whose WHEN templates each open with their frame's marker, so
 * the glue a projection opens with names the frame it chose; every other
 * entry reads as its English source.
 */
function frameMarkingLocalizer(): Localizer {
  return createLocalizer({
    locale: "zz",
    pluralRule: defaultPluralRule,
    entries: {},
    contexts: {
      "sentence-when": {
        "When I {form} {object}": `${FRAME_MARKERS.verb}{form} {object}`,
        "When I am {form} {object}": `${FRAME_MARKERS.state}{form} {object}`,
        "When {form} {object}": `${FRAME_MARKERS.event}{form} {object}`,
      },
    },
  });
}

/** The projected sentence of `rule`, read as data. */
export function projectedSentence(rule: IBrainRuleDef): ProjectedSentence {
  const segments = projectRuleSentence(rule, frameMarkingLocalizer()).toArray();
  const opening = segments[0];
  const frame = (Object.keys(FRAME_MARKERS) as ProjectedFrame[]).find(
    (candidate) => opening?.kind === "glue" && opening.text === FRAME_MARKERS[candidate]
  );
  const words = segments.flatMap((segment) =>
    segment.kind === "word" ? [{ text: segment.text, sourceTileIndex: segment.sourceTileIndex }] : []
  );
  return { frame, words };
}
