import type { BrainBuildDiagnostic } from "@wendoo/core/brain";
import { ChevronDown, ChevronRight, CircleAlert } from "lucide-react";
import type { BrainEntry } from "@/services/brains-store";

/**
 * How a brain's compiled form stands against its source:
 *
 * - `current` -- the latest compile produced bytecode for the brain's source;
 * - `stale` -- the latest compile failed, and the brain keeps an earlier
 *   source's bytecode;
 * - `none` -- no compile of the brain has produced bytecode.
 */
export type BrainCompileState = "current" | "stale" | "none";

/** The {@link BrainCompileState} of `entry`. */
export function brainCompileState(entry: BrainEntry): BrainCompileState {
  if (entry.compiled === undefined) return "none";
  return entry.compiled.sourceHash === entry.sourceHash ? "current" : "stale";
}

/** The diagnostics a brain row badges and lists: `entry`'s errors and warnings, in reported order. */
export function listedDiagnostics(entry: BrainEntry): readonly BrainBuildDiagnostic[] {
  return entry.diagnostics.filter((diagnostic) => diagnostic.severity !== "info");
}

/** The expanded-set after toggling one brain's diagnostics list: removes a present id, adds an absent one. */
export function toggledBrainId(expanded: ReadonlySet<string>, brainId: string): ReadonlySet<string> {
  const next = new Set(expanded);
  if (next.has(brainId)) {
    next.delete(brainId);
  } else {
    next.add(brainId);
  }
  return next;
}

interface BrainErrorBadgeProps {
  /** Number of diagnostics the badge reports. */
  count: number;
  /** The brain's compile state, carried as `data-compile`; a brain whose latest compile failed badges in the destructive token. */
  compileState: BrainCompileState;
  /** Whether the diagnostics list below the row is expanded. */
  expanded: boolean;
  /** Toggles the diagnostics list. */
  onToggle: () => void;
  /** Display name of the brain, for the accessible label. */
  brainName: string;
}

/**
 * Diagnostics badge on a brain row: an icon, the diagnostic count, and the
 * chevron toggling the diagnostics list. Painted destructive while the
 * brain's latest compile failed, and warning while it compiled with
 * warnings.
 */
export function BrainErrorBadge({ count, compileState, expanded, onToggle, brainName }: BrainErrorBadgeProps) {
  const tone = compileState === "current" ? "text-warning" : "text-destructive";
  return (
    <button
      type="button"
      data-testid="brain-error-badge"
      data-compile={compileState}
      aria-expanded={expanded}
      aria-label={`Problems in ${brainName}`}
      className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium text-xs hover:bg-muted ${tone}`}
      onClick={onToggle}
    >
      <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
      <span data-testid="brain-error-count">{count}</span>
      {expanded ? (
        <ChevronDown aria-hidden="true" className="h-3 w-3" />
      ) : (
        <ChevronRight aria-hidden="true" className="h-3 w-3" />
      )}
    </button>
  );
}

interface BrainDiagnosticsListProps {
  /** The diagnostics to list, one row each, in order. */
  diagnostics: readonly BrainBuildDiagnostic[];
}

/**
 * The expanded diagnostics list below a brain row: one console-style row per
 * diagnostic -- its stable code, then the compiler's message verbatim --
 * carrying the code as `data-code` and the severity as `data-severity`.
 * Scrolls past about five rows.
 */
export function BrainDiagnosticsList({ diagnostics }: BrainDiagnosticsListProps) {
  return (
    <ul
      data-testid="brain-diagnostics"
      className="max-h-32 overflow-y-auto border-border border-t bg-muted/40 px-3 py-1.5 font-mono text-xs"
    >
      {diagnostics.map((diagnostic, index) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: the list is replaced whole on each compile, and two diagnostics may be identical
          key={index}
          data-testid="brain-diagnostic-row"
          data-code={diagnostic.code}
          data-severity={diagnostic.severity}
          className="flex gap-2 py-0.5"
        >
          <span className="shrink-0 text-muted-foreground">{diagnostic.code}</span>
          <span className="min-w-0 wrap-break-word">{diagnostic.message}</span>
        </li>
      ))}
    </ul>
  );
}
