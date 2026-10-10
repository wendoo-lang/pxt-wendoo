import type { MakeCodeEditorSessionErrorCode } from "@wendoo/makecode-session";
import { isVersionCode } from "@/services/connection-status";

/**
 * The remedy for a version rejection: reloading the editor, which updates
 * it. Renders nothing when `errorCode` is not a version code.
 */
export function VersionNotice({ errorCode }: { errorCode: MakeCodeEditorSessionErrorCode | undefined }) {
  if (!isVersionCode(errorCode)) return null;
  return (
    <section
      data-testid="version-notice"
      data-code={errorCode}
      className="max-w-md rounded-lg border border-border p-3 text-sm"
    >
      <p>This editor and the MakeCode project speak different versions. Reload the editor to update it.</p>
      <button
        type="button"
        data-testid="reload-button"
        className="mt-2 rounded-md border border-border px-3 py-1.5 text-sm"
        onClick={() => {
          window.location.reload();
        }}
      >
        Reload
      </button>
    </section>
  );
}
