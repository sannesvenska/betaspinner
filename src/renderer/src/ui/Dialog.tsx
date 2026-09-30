import { useEffect, useId, useRef, type ReactNode } from 'react';
import { classNames } from './classNames';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Native <dialog> modal: focus trap, Esc handling and inert background come from the platform.
 * React's `autoFocus` runs before `showModal()` and would be overridden (the first button wins),
 * so the default element is focused explicitly after opening.
 */
function useNativeDialog(open: boolean) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return dialogRef;
}

function ModalShell({ open, onClose, title, children, className }: ModalProps & { className: string }) {
  const dialogRef = useNativeDialog(open);
  const titleId = useId();
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc: let React state drive closing
        event.preventDefault();
        onClose();
      }}
      className={classNames(
        'border-0 p-0 text-ink shadow-dialog backdrop:bg-scrim open:flex open:flex-col',
        className,
      )}
    >
      <h2 id={titleId} className="px-8 pt-7 font-display text-title font-bold uppercase">
        {title}
      </h2>
      {children}
    </dialog>
  );
}

export function Dialog(props: ModalProps) {
  return <ModalShell {...props} className="m-auto w-[min(640px,90vw)] rounded-panel bg-surface" />;
}

/** Right-side drawer over the stage (e.g. discovered gallery). */
export function Drawer(props: ModalProps) {
  return (
    <ModalShell
      {...props}
      className="mr-0 ml-auto h-dvh max-h-dvh w-[min(760px,60vw)] bg-overlay backdrop-blur-overlay"
    />
  );
}
