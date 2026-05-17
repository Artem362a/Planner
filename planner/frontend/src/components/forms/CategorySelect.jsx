import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function findScrollableAncestor(el) {
  let parent = el.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = getComputedStyle(parent);
    const overflowY = style.overflowY;
    if (overflowY === "auto" || overflowY === "scroll") {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document.body;
}

export default function CategorySelect({
  value,
  categories,
  onChange,
  onManageClick,
  placeholder = "Выбери категорию",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState(null);
  const rootRef = useRef(null);
  const dropdownRef = useRef(null);
  const restorePositionRef = useRef(null);

  useLayoutEffect(() => {
    if (!isOpen || !rootRef.current) {
      setPortalContainer(null);
      return;
    }

    const container = findScrollableAncestor(rootRef.current);

    // Ensure absolute children anchor to this container
    if (container !== document.body) {
      const computed = getComputedStyle(container);
      if (computed.position === "static") {
        container.style.position = "relative";
        restorePositionRef.current = container;
      }
    }

    setPortalContainer(container);

    return () => {
      if (restorePositionRef.current) {
        restorePositionRef.current.style.position = "";
        restorePositionRef.current = null;
      }
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !portalContainer) return;

    function calcPosition() {
      const root = rootRef.current;
      const dropdown = dropdownRef.current;
      if (!root || !dropdown) return;

      const rootRect = root.getBoundingClientRect();
      const isBody = portalContainer === document.body;
      const containerRect = isBody
        ? { top: 0, left: 0 }
        : portalContainer.getBoundingClientRect();
      const scrollTop = isBody ? window.scrollY : portalContainer.scrollTop;
      const scrollLeft = isBody ? window.scrollX : portalContainer.scrollLeft;

      const offsetTop = rootRect.bottom - containerRect.top + scrollTop + 8;
      const offsetLeft = rootRect.left - containerRect.left + scrollLeft;

      const vh = window.innerHeight;
      const spaceBelow = vh - rootRect.bottom - 16;
      const spaceAbove = rootRect.top - 16;
      const useAbove = spaceBelow < 200 && spaceAbove > spaceBelow;

      dropdown.style.position = "absolute";
      dropdown.style.left = `${Math.round(offsetLeft)}px`;
      dropdown.style.width = `${rootRect.width}px`;
      dropdown.style.zIndex = "9999";

      if (useAbove) {
        const h = dropdown.offsetHeight || 0;
        dropdown.style.top = `${Math.round(rootRect.top - containerRect.top + scrollTop - h - 8)}px`;
        dropdown.style.maxHeight = `${Math.max(160, Math.min(spaceAbove, 360))}px`;
      } else {
        dropdown.style.top = `${Math.round(offsetTop)}px`;
        dropdown.style.maxHeight = `${Math.max(160, Math.min(spaceBelow, 360))}px`;
      }
      dropdown.style.visibility = "visible";
    }

    calcPosition();

    const onResize = () => calcPosition();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [isOpen, portalContainer]);

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

      {isOpen && portalContainer &&
        createPortal(
          <div
            ref={dropdownRef}
            className="category-select-dropdown"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              zIndex: 9999,
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
          portalContainer
        )}
    </div>
  );
}
