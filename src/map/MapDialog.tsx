import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from './mapIcons';

interface MapDialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  closeLabel: string;
  className?: string;
  children: ReactNode;
}

/**
 * The map's one dialog shell, on the native <dialog> (showModal): the page behind becomes inert, focus stays inside, Escape closes,
 * and the browser returns focus to the button that opened it.
 */
export default function MapDialog({ open, onClose, labelledBy, closeLabel, className, children }: MapDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dm-dialog ${className ?? ''}`}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself, outside its panel) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dm-dialog-panel">
        <button type="button" className="dm-dialog-close" onClick={onClose} aria-label={closeLabel}>
          <CloseIcon />
        </button>
        {children}
      </div>
    </dialog>
  );
}
