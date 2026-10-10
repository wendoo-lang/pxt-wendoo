import { DocsSidebar, DocsSidebarProvider } from "@wendoo/docs";
import { Toaster } from "@wendoo/ui";
import { useMemo } from "react";
import { registeredTypeNames } from "@/brain/editor-config";
import { createTileVisualProvider } from "@/brain/visual-provider";
import { SessionView } from "@/components/SessionView";
import { useBrainsState } from "@/contexts/brains";
import { useEditorSessionState } from "@/contexts/editor-session";
import { createDocsTileCatalog, createEditorDocsRegistry } from "@/docs/docs-registry";
import { resolveTarget } from "@/services/target-theme";

/**
 * Root view: the session -- the Docs toggle, the brains, the catalog's
 * diagnostics; the toast region the shared components announce through; and
 * the docs sidebar, over a docs registry and tile visuals rebuilt from the
 * brains store's environment each time it changes, its entries and pages
 * opening in the sidebar. Tiles, in
 * the docs and the brain editor alike, are filled in the declared target's
 * tile colors where its theme gives them.
 */
export function App() {
  const { target } = useEditorSessionState();
  const tileColors = resolveTarget(target)?.tileColors;
  const { environment, assetLiterals, brainLiterals, packLiterals, typePages, typeIcons, typeLabels, pageIcon } =
    useBrainsState();
  const docsRegistry = useMemo(
    () =>
      createEditorDocsRegistry(
        environment,
        new Set([...assetLiterals.keys(), ...brainLiterals.keys(), ...packLiterals.keys()]),
        typePages
      ),
    [environment, assetLiterals, brainLiterals, packLiterals, typePages]
  );
  const docsTileCatalog = useMemo(() => createDocsTileCatalog(environment), [environment]);
  const docsDataTypeNames = useMemo(() => registeredTypeNames(environment, typeLabels), [environment, typeLabels]);
  const docsResolveTileVisual = useMemo(
    () => createTileVisualProvider(environment.tileCatalogs(), assetLiterals, typeIcons, pageIcon, tileColors),
    [environment, assetLiterals, typeIcons, pageIcon, tileColors]
  );

  return (
    <DocsSidebarProvider
      registry={docsRegistry}
      tileCatalog={docsTileCatalog}
      brainServices={environment.brainServices}
      dataTypeNames={docsDataTypeNames}
      dataTypeIcons={typeIcons}
      resolveTileVisual={docsResolveTileVisual}
      showDocsPageLinks={false}
    >
      <SessionView tileColors={tileColors} />
      <Toaster />
      <DocsSidebar />
    </DocsSidebarProvider>
  );
}
