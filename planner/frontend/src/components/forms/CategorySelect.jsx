import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function CategorySelect({
  value,
  categories,
  onChange,
  onManageClick,
  placeholder = "Выбери категорию",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const dropdownRef = useRef(null);

  useLayoutEffect(() => {
    if (!isOpen) return;

    function calcPosition() {
      const root = rootRef.current;
      const dropdown = dropdownRef.current;
      if (!root || !dropdown) return;

      const rect = root.getBoundingClientRect();
      const vh = window.innerHeight;
      const spaceBelow = vh - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const useAbove = spaceBelow < 200 && spaceAbove > spaceBelow;

      dropdown.style.position = "fixed";
      dropdown.style.left = `${Math.round(rect.left)}px`;
      dropdown.style.width = `${Math.round(rect.width)}px`;
      dropdown.style.zIndex = "99999";

      if (useAbove) {
        const h = dropdown.offsetHeight || 0;
        dropdown.style.top = `${Math.round(rect.top - h - 8)}px`;
        dropdown.style.bottom = "auto";
        dropdown.style.maxHeight = `${Math.max(160, Math.min(spaceAbove, 360))}px`;
      } else {
        dropdown.style.top = `${Math.round(rect.bottom + 8)}px`;
        dropdown.style.bottom = "auto";
        dropdown.style.maxHeight = `${Math.max(160, Math.min(spaceBelow, 360))}px`;
      }
      dropdown.style.visibility = "visible";
    }

    calcPosition();

    window.addEventListener("resize", calcPosition);
    window.addEventListener("scroll", calcPosition, true);
    return () => {
      window.removeEventListener("resize", calcPosition);
      window.removeEventListener("scroll", calcPosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target) &&
        !(dropdownRef.current && dropdownRef.current.contains(e.target))
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = categories[value] || null;

  return (
    <div className="category-select" ref={rootRef}>
      <button
        type="button"
        className={
          "category-select-trigger" + (isOpen ? " category-select-trigger--open" : "")
        }
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="category-select-trigger-content">
          {selected ? (
            <>
              <span
                className="category-dot"
                style={{ backgroundColor: selected.color || "#BBBBBB" }}
              />
              <span>{selected.title}</span>
            </>
          ) : (
            <span className="category-select-placeholder">{placeholder}</span>
          )}
        </span>
        <span className="category-select-arrow">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="category-select-dropdown"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              zIndex: 99999,
              visibility: "hidden",
            }}
          >
            <div className="category-select-options">
              {Object.entries(categories).map(([key, item]) => (
                <button
                  key={key}
                  type="button"
                  className={
                    "category-select-option" +
                    (key === value ? " category-select-option--active" : "")
                  }
                  onClick={() => {
                    onChange(key);
                    setIsOpen(false);
                  }}
                >
                  <span
                    className="category-dot"
                    style={{ backgroundColor: item.color || "#BBBBBB" }}
                  />
                  <span>{item.title}</span>
                </button>
              ))}
            </div>
            <div className="category-select-divider" />
            <button
              type="button"
              className="category-select-manage"
              onClick={() => {
                setIsOpen(false);
                onManageClick();
              }}
            >
              ⚙ Управление категориями
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
