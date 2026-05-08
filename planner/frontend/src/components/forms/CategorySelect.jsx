import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function CategorySelect({
  value,
  categories,
  onChange,
  onManageClick,
  placeholder = "Выбери категорию",
  dropUp = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [portalStyle, setPortalStyle] = useState(null);
  const rootRef = useRef(null);
  const dropdownRef = useRef(null);

  // Calculate portal position after isOpen=true, before browser paint
  useLayoutEffect(() => {
    if (!isOpen || !dropUp || !rootRef.current) {
      setPortalStyle(null);
      return;
    }
    const rect = rootRef.current.getBoundingClientRect();
    setPortalStyle({
      position: "fixed",
      top: rect.bottom + 8,
      bottom: "auto",
      left: rect.left,
      right: "auto",
      width: rect.width,
      zIndex: 9999,
    });
  }, [isOpen, dropUp]);

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

  const options = (
    <>
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
    </>
  );

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

      {/* dropUp=true: portal with fixed position, renders only after position is calculated */}
      {isOpen && dropUp && portalStyle &&
        createPortal(
          <div ref={dropdownRef} className="category-select-dropdown" style={portalStyle}>
            {options}
          </div>,
          document.body
        )
      }

      {/* dropUp=false: inline dropdown (original behavior) */}
      {isOpen && !dropUp && (
        <div ref={dropdownRef} className="category-select-dropdown">
          {options}
        </div>
      )}
    </div>
  );
}
