import { useEffect, useId, useRef, useState } from "react";
import { CategoryIcon } from "../../icons";
import { formatPlanDate } from "../../../utils/dates";
import DailySuccessesPanel from "./DailySuccessesPanel";

function SuccessesDialog({ open, onClose, triggerRef, day, categories, onCategoriesChanged }) {
  const dialogRef = useRef(null);
  const headingRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    headingRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open, triggerRef]);

  return <dialog ref={dialogRef} className="successes-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <header className="successes-dialog-heading">
      <div>
        <h2 id={titleId} ref={headingRef} tabIndex={-1}>Успехи за день</h2>
        <time dateTime={day}>{formatPlanDate(day, { year: "numeric" })}</time>
      </div>
      <button type="button" className="successes-dialog-close" aria-label="Закрыть успехи" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </header>
    <div className="successes-dialog-body"><DailySuccessesPanel day={day} categories={categories} onCategoriesChanged={onCategoriesChanged} showTitle={false} /></div>
  </dialog>;
}

export default function DailySuccessesButton({ day, categories, onCategoriesChanged }) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const triggerRef = useRef(null);

  return <>
    <button ref={triggerRef} type="button" className="day-successes-button" aria-haspopup="dialog"
      aria-expanded={open} onClick={() => { setHasOpened(true); setOpen(true); }}>
      <CategoryIcon name="sparkle" /><span>Успехи</span>
    </button>
    {hasOpened && <SuccessesDialog open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} day={day} categories={categories} onCategoriesChanged={onCategoriesChanged} />}
  </>;
}
