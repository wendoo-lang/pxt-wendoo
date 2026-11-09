import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@wendoo/ui";
import { type ReactNode, useEffect } from "react";

interface ModalProps {
  /** Heading shown at the top of the panel. */
  title: string;
  /** Invoked when the dialog requests close (Escape, the close button, or a click outside). */
  onClose: () => void;
  children: ReactNode;
}

/**
 * Modal panel for the editor's small dialogs, on the shared Dialog
 * primitives. Mount it to open it and unmount it to close it; on unmount the
 * keyboard returns to the element that held it when the panel opened.
 */
export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      if (previous instanceof HTMLElement && document.contains(previous)) {
        previous.focus();
      }
    };
  }, []);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent aria-describedby={undefined} className="max-w-md border-border">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div>{children}</div>
      </DialogContent>
    </Dialog>
  );
}
