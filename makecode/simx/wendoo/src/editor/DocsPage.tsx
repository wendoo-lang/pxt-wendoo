import { DocsPage as SharedDocsPage } from "@wendoo/docs";
import { Toaster } from "@wendoo/ui";
import { useMemo } from "react";
import { registeredTypeNames } from "./brain/editor-config";
import { createTileVisualProvider } from "./brain/visual-provider";
import { createDocsTileCatalog, createEditorDocsRegistry } from "./docs/docs-registry";
import { buildAuthoringEnvironment } from "./services/authoring-environment";

/**
 * Full-page documentation view served at `/docs`: the core docs, over the
 * core environment {@link buildAuthoringEnvironment} builds with no session
 * catalog, and the toast region the docs announce through.
 */
export function DocsPage() {
  const environment = useMemo(() => buildAuthoringEnvironment(undefined).environment, []);
  const docsRegistry = useMemo(() => createEditorDocsRegistry(environment, new Set()), [environment]);
  const docsTileCatalog = useMemo(() => createDocsTileCatalog(environment), [environment]);
  const docsDataTypeNames = useMemo(() => registeredTypeNames(environment, new Map()), [environment]);
  const resolveTileVisual = useMemo(
    () => createTileVisualProvider(environment.tileCatalogs(), new Map(), new Map()),
    [environment]
  );

  return (
    <SharedDocsPage
      registry={docsRegistry}
      tileCatalog={docsTileCatalog}
      brainServices={environment.brainServices}
      dataTypeNames={docsDataTypeNames}
      resolveTileVisual={resolveTileVisual}
      backLabel="Editor"
      backHref="/"
    >
      <Toaster />
    </SharedDocsPage>
  );
}
