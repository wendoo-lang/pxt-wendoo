import { Button } from "@wendoo/ui";
import type { ReactNode } from "react";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  /** Heading of the dialog. */
  title: string;
  /** What the action does, shown above the buttons. */
  message: ReactNode;
  /** Caption of the confirm button. */
  confirmLabel: string;
  /** Styles the confirm button as a destructive action. */
  destructive?: boolean;
  /** Runs the action; the dialog then closes. */
  onConfirm: () => void;
  /** Called when the dialog closes, after a confirm or a cancel. */
  onClose: () => void;
}

/** Modal that asks the user to confirm an action before it runs. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  destructive = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="text-muted-foreground text-sm">{message}</div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" data-testid="confirm-cancel-button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant={destructive ? "destructive" : "default"}
          data-testid="confirm-button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
