import React from "react";

const PRIORITY_OPTIONS = [
  {
    key: "medium",
    label: "Обычный",
    color: "#8bb8ff",
  },
  {
    key: "high",
    label: "Важный",
    color: "#e46b6b",
  },
];

function PrioritySelect({ value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);

  const selected =
    PRIORITY_OPTIONS.find((item) => item.key === value) || PRIORITY_OPTIONS[0];

  React.useEffect(() => {
    function handleClickOutside(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className="priority-select" ref={rootRef}>
      <button
        type="button"
        className={`priority-select-trigger ${open ? "priority-select-trigger--open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="priority-select-trigger-content">
          <span
            className="priority-dot"
            style={{ backgroundColor: selected.color }}
          />
          <span>{selected.label}</span>
        </div>

        <span className="priority-select-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="priority-select-dropdown">
          <div className="priority-select-options">
            {PRIORITY_OPTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`priority-select-option ${
                  item.key === selected.key ? "priority-select-option--active" : ""
                }`}
                onClick={() => {
                  onChange(item.key);
                  setOpen(false);
                }}
              >
                <span
                  className="priority-dot"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PrioritySelect;