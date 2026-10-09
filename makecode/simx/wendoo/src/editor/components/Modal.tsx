import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@wendoo/ui";
import { type ReactNode, useEffect } from "react";

interface ModalProps {
  /** Heading shown at the top of the panel. */
  title: string;
  /** Invoked when the dialog requests close (Escape, the close button, or a click outside). */
  onClose: () => void;
  /**
   * Runs once the panel has closed and is handing the keyboard back, after the
   * panel's own DOM is gone. Call `event.preventDefault()` and focus an element
   * to take the keyboard over; leaving the event alone returns it to whatever
   * held it when the panel opened.
   */
  onCloseAutoFocus?: (event: Event) => void;
  children: ReactNode;
}

/**
 * Modal panel for the editor's small dialogs, on the shared Dialog
 * primitives. Mount it to open it and unmount it to close it; on unmount the
 * keyboard returns to the element that held it when the panel opened.
 */
export function Modal({ title, onClose, onCloseAutoFocus, children }: ModalProps) {
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
      <DialogContent
        aria-describedby={undefined}
        className="max-w-md border-border"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div>{children}</div>
      </DialogContent>
    </Dialog>
  );
}
