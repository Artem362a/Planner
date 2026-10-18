import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CategoryIcon } from "../icons";

export default function CategoryPicker({ options, value, onChange, label = "Категория", disabled = false, onManageClick, placeholder = "Без категории" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [portalTarget, setPortalTarget] = useState(() => document.body);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const searchRef = useRef(null);
  const id = useId();
  const selectedValue = String(value ?? "");
  const selected = options.find(option => option.value === selectedValue) || { title: placeholder, value: selectedValue };
  const filtered = options.filter(option => option.title.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru")));
  const active = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }
  function reveal() {
    setPortalTarget(triggerRef.current?.closest("dialog") || document.body);
    setSearch("");
    setActiveIndex(Math.max(0, options.findIndex(option => option.value === selected.value)));
    setOpen(true);
  }
  function choose(option) {
    onChange(option.value);
    close(true);
  }

  useLayoutEffect(() => {
    if (!open || disabled) return;
    function position() {
      const rect = triggerRef.current.getBoundingClientRect();
      const popup = popupRef.current;
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const useAbove = below < 280 && above > below;
      const height = Math.max(0, Math.min(310, useAbove ? above : below));
      Object.assign(popup.style, {
        width: `${Math.min(rect.width, window.innerWidth - 24)}px`,
        left: `${Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12))}px`,
        maxHeight: `${height}px`,
        top: useAbove ? "auto" : `${rect.bottom + 6}px`,
        bottom: useAbove ? `${window.innerHeight - rect.top + 6}px` : "auto",
        visibility: "visible",
      });
    }
    position();
    searchRef.current?.focus();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, disabled]);

  useEffect(() => {
    if (!open) return;
    function outside(event) {
      if (!triggerRef.current?.contains(event.target) && !popupRef.current?.contains(event.target)) setOpen(false);
    }
    function focusOutside(event) {
      if (!triggerRef.current?.contains(event.target) && !popupRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focusOutside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", focusOutside);
    };
  }, [open]);

  useEffect(() => {
    if (open) popupRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, search]);

  function navigate(event) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(previous => Math.max(0, Math.min(filtered.length - 1, previous + (event.key === "ArrowDown" ? 1 : -1))));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    }
    if (event.key === "Tab") {
      // The popup is portaled; return to the trigger before normal Tab navigation.
      close(true);
    }
  }

  function icon(option) {
    return <span className="category-picker-icon" style={{ "--category-color": option.color || "var(--text-soft)" }}>
      <CategoryIcon name={option.icon || "tag"} />
    </span>;
  }

  return <div className="category-picker">
    <button ref={triggerRef} type="button" className="category-picker-trigger" aria-label={label} aria-haspopup="listbox"
      aria-expanded={open && !disabled} aria-controls={open && !disabled ? `${id}-options` : undefined} disabled={disabled}
      onClick={() => open ? close() : reveal()}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); reveal(); }
        if (event.key === "Escape") close();
      }}>
      {icon(selected)}<span className="category-picker-title" title={selected.title}>{selected.title}</span>
      <svg className="category-picker-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
    </button>
    {open && !disabled && createPortal(<div className="category-picker-popup" ref={popupRef} style={{ visibility: "hidden" }}>
      <div className="category-picker-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></svg>
        <input ref={searchRef} role="combobox" aria-label={`Поиск: ${label}`} aria-expanded="true" aria-controls={`${id}-options`}
          aria-autocomplete="list" aria-activedescendant={filtered.length ? `${id}-option-${active}` : undefined}
          placeholder="Найти категорию" value={search} onChange={event => { setSearch(event.target.value); setActiveIndex(0); }} onKeyDown={navigate} />
      </div>
      <div className="category-picker-options" id={`${id}-options`} role="listbox" aria-label={label}>
        {filtered.map((option, index) => <button key={option.value} type="button" role="option" tabIndex={-1}
          id={`${id}-option-${index}`} aria-selected={option.value === selectedValue} data-active={index === active}
          className="category-picker-option" onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
          {icon(option)}<span className="category-picker-title" title={option.title}>{option.title}</span>
          {option.value === selectedValue && <svg className="category-picker-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
        </button>)}
      </div>
      {!filtered.length && <p className="category-picker-empty" role="status">Категории не найдены</p>}
      {onManageClick && <button type="button" className="category-picker-manage" onClick={() => { close(); onManageClick(); }}>
        <CategoryIcon name="tool" />Управление категориями
      </button>}
    </div>, portalTarget)}
  </div>;
}
