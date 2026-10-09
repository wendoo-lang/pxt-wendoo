import { Button } from "@wendoo/ui";
import { BookOpen } from "lucide-react";

interface DocsButtonProps {
  /** Whether the docs sidebar is open; the button's `aria-expanded`. */
  isOpen: boolean;
  /** Opens the docs sidebar while it is closed, and closes it while it is open. */
  onToggle: () => void;
}

/**
 * The header's Docs toggle: an icon button controlling the docs sidebar
 * (`docs-sidebar`), its expanded state following `isOpen` and a click
 * calling `onToggle`.
 */
export function DocsButton({ isOpen, onToggle }: DocsButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid="docs-button"
      aria-label="Documentation"
      title="Documentation"
      aria-expanded={isOpen}
      aria-controls="docs-sidebar"
      onClick={onToggle}
    >
      <BookOpen />
    </Button>
  );
}
