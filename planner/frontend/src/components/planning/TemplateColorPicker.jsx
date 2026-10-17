import { useEffect, useId, useRef, useState } from "react";

export default function TemplateColorPicker({ colors, value, onChange }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  const triggerRef = useRef(null);
  const paletteId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOutside = event => {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="template-color-picker" ref={pickerRef}>
      <button ref={triggerRef} type="button" className="template-color-trigger"
        aria-expanded={open} aria-controls={paletteId}
        onClick={() => setOpen(previous => !previous)}>
        <span className="template-color-current" style={{ backgroundColor: value }} />
        Цвет
        <svg className="template-color-chevron" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="template-color-palette" id={paletteId} role="group" aria-label="Цвет шаблона">
          {colors.map(color => (
            <button key={color} type="button" className="template-color-option"
              style={{ backgroundColor: color }} aria-label={`Цвет ${color}`}
              aria-pressed={value === color} title={color}
              onClick={() => {
                onChange(color);
                setOpen(false);
                triggerRef.current?.focus();
              }}>
              {value === color && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
