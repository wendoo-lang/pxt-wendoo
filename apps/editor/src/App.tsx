import { DocsSidebar, DocsSidebarProvider } from "@wendoo/docs";
import { Toaster } from "@wendoo/ui";
import { useMemo } from "react";
import { registeredTypeNames } from "@/brain/editor-config";
import { createTileVisualProvider } from "@/brain/visual-provider";
import { ConnectPage } from "@/components/ConnectPage";
import { SessionView } from "@/components/SessionView";
import { useBrainsState } from "@/contexts/brains";
import { useEditorSessionState } from "@/contexts/editor-session";
import { createDocsTileCatalog, createEditorDocsRegistry } from "@/docs/docs-registry";

/**
 * Root view: the join-code entry while no session exists, and the session --
 * status, brains, catalog -- once one does; the toast region the shared
 * components announce through; and the docs sidebar, over a docs registry
 * and tile visuals rebuilt from the brains store's environment each time it
 * changes, its entries and pages opening in the sidebar with no link to the
 * standalone docs pages.
 */
export function App() {
  const { view } = useEditorSessionState();
  const { environment, assetLiterals, brainLiterals, typeIcons, pageIcon } = useBrainsState();
  const docsRegistry = useMemo(
    () => createEditorDocsRegistry(environment, new Set([...assetLiterals.keys(), ...brainLiterals.keys()])),
    [environment, assetLiterals, brainLiterals]
  );
  const docsTileCatalog = useMemo(() => createDocsTileCatalog(environment), [environment]);
  const docsDataTypeNames = useMemo(() => registeredTypeNames(environment), [environment]);
  const docsResolveTileVisual = useMemo(
    () => createTileVisualProvider(environment.tileCatalogs(), assetLiterals, typeIcons, pageIcon),
    [environment, assetLiterals, typeIcons, pageIcon]
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
      {view === "connect" ? <ConnectPage /> : <SessionView />}
      <Toaster />
      <DocsSidebar />
    </DocsSidebarProvider>
  );
}
