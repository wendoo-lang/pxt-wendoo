import { Button, Input } from "@wendoo/ui";
import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";

interface NameInputDialogProps {
  /** Heading of the dialog. */
  title: string;
  /** Caption of the submit button. */
  submitLabel: string;
  /** The name the field starts with; empty when left out. */
  initialValue?: string;
  /** Receives the entered name, trimmed and non-empty; the dialog then closes. */
  onSubmit: (name: string) => void;
  /** Called when the dialog closes, after a submit or a cancel. */
  onClose: () => void;
  /**
   * Runs once the dialog has closed and is handing the keyboard back, whether it
   * submitted or was cancelled. Call `event.preventDefault()` and focus an
   * element to take the keyboard over; leaving the event alone returns it to
   * whatever held it when the dialog opened.
   */
  onCloseAutoFocus?: (event: Event) => void;
}

/** Modal that captures a single name and submits the trimmed value. Submitting is disabled while the name is blank. */
export function NameInputDialog({
  title,
  submitLabel,
  initialValue = "",
  onSubmit,
  onClose,
  onCloseAutoFocus,
}: NameInputDialogProps) {
  const [name, setName] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const canSubmit = name.trim().length > 0;

  function submit(): void {
    if (!canSubmit) {
      return;
    }
    onSubmit(name.trim());
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose} onCloseAutoFocus={onCloseAutoFocus}>
      <Input
        ref={inputRef}
        data-testid="name-input"
        aria-label="Name"
        className="h-auto bg-background text-foreground"
        placeholder="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // Keeps the key from activating the button the keyboard returns to as the dialog closes.
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" size="sm" data-testid="name-submit-button" disabled={!canSubmit} onClick={submit}>
          {submitLabel}
        </Button>
      </div>
    </Modal>
  );
}
