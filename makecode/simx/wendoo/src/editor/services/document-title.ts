/** The part of the editor session store {@link bindDocumentTitle} follows. */
export interface ProjectNameSource {
  subscribe(listener: () => void): () => void;
  getSnapshot(): { readonly projectName: string | undefined };
}

/** The surface {@link bindDocumentTitle} writes: the document's title. */
export interface TitleSurface {
  title: string;
}

/** The title shown while no project name is known. */
const BASE_TITLE = "Wendoo";

/**
 * Keeps `surface.title` naming the project `source` reports: "Wendoo - "
 * followed by the project name while one is known, and "Wendoo" alone while
 * none is. Bind the document so the browser tab names the project. Returns a
 * function that stops following `source`, leaving the title as it stands.
 */
export function bindDocumentTitle(source: ProjectNameSource, surface: TitleSurface): () => void {
  let applied: string | undefined;
  const follow = (): void => {
    const { projectName } = source.getSnapshot();
    const title = projectName === undefined || projectName === "" ? BASE_TITLE : `${BASE_TITLE} - ${projectName}`;
    if (applied === title) return;
    applied = title;
    surface.title = title;
  };
  follow();
  return source.subscribe(follow);
}
