import React, { useEffect, useMemo, useState } from "react";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "../../api/tasks";
import { CATEGORY_ICONS, CategoryIcon } from "../icons";

const CATEGORY_COLOR_PALETTE = [
  { value: "#9B7BE8", label: "Лавандовый" },
  { value: "#7C67D8", label: "Фиалковый" },
  { value: "#7EA7F2", label: "Голубой" },
  { value: "#6F8EDB", label: "Васильковый" },
  { value: "#67C5D8", label: "Бирюзовый" },
  { value: "#4DB6B2", label: "Морская волна" },
  { value: "#5FD6C0", label: "Мятный" },
  { value: "#72C99F", label: "Шалфей" },
  { value: "#8BCB6F", label: "Зеленый" },
  { value: "#B9C86A", label: "Оливковый" },
  { value: "#D5C65F", label: "Горчичный" },
  { value: "#F0B36A", label: "Персиковый" },
  { value: "#E99A6D", label: "Коралловый" },
  { value: "#F1848E", label: "Розовый" },
  { value: "#E36F9E", label: "Малиновый" },
  { value: "#D985C7", label: "Орхидея" },
  { value: "#B97AD6", label: "Аметист" },
  { value: "#A6A2D8", label: "Сиреневый" },
  { value: "#95A0BF", label: "Дымчатый" },
  { value: "#C2A07A", label: "Карамельный" },
];

function normalizeColor(value) {
  return (value || "").trim().toLowerCase();
}

function getFirstAvailableColor(usedColors) {
  return (
    CATEGORY_COLOR_PALETTE.find(
      (item) => !usedColors.has(normalizeColor(item.value))
    )?.value || CATEGORY_COLOR_PALETTE[0].value
  );
}

function CategoryColorPalette({ value, onChange, unavailableColors = new Set() }) {
  return (
    <div className="category-color-palette" aria-label="Цвет категории">
      {CATEGORY_COLOR_PALETTE.map((item) => {
        const isActive = normalizeColor(value) === normalizeColor(item.value);
        const isUnavailable =
          !isActive && unavailableColors.has(normalizeColor(item.value));

        return (
          <button
            key={item.value}
            type="button"
            className={
              "category-color-swatch" +
              (isActive ? " category-color-swatch--active" : "") +
              (isUnavailable ? " category-color-swatch--disabled" : "")
            }
            style={{ "--swatch-color": item.value }}
            onClick={() => {
              if (!isUnavailable) {
                onChange(item.value);
              }
            }}
            disabled={isUnavailable}
            title={isUnavailable ? `${item.label} уже используется` : item.label}
            aria-label={isUnavailable ? `${item.label} уже используется` : item.label}
          />
        );
      })}
    </div>
  );
}

function CategoryIconPicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = CATEGORY_ICONS.find((item) => item.key === value) || CATEGORY_ICONS.at(-1);

  return (
    <div className="category-icon-picker">
      <button
        type="button"
        className="category-icon-picker-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="category-icon-preview">
          <CategoryIcon name={selected.key} />
        </span>
        <span>{selected.label}</span>
        <span className="category-icon-picker-arrow">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="category-icon-grid">
          {CATEGORY_ICONS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={
                "category-icon-option" +
                (item.key === selected.key ? " category-icon-option--active" : "")
              }
              onClick={() => {
                onChange(item.key);
                setIsOpen(false);
              }}
              title={item.label}
              aria-label={item.label}
            >
              <CategoryIcon name={item.key} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoryManagerModal({
  categories,
  onClose,
  onCategoriesChanged,
}) {
  const items = useMemo(() => Object.entries(categories), [categories]);
  const usedColors = useMemo(
    () => new Set(items.map(([, item]) => normalizeColor(item.color))),
    [items]
  );

  const [title, setTitle] = useState("");
  const [color, setColor] = useState(CATEGORY_COLOR_PALETTE[0].value);
  const [icon, setIcon] = useState("tag");

  const [editingKey, setEditingKey] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingColor, setEditingColor] = useState(CATEGORY_COLOR_PALETTE[0].value);
  const [editingIcon, setEditingIcon] = useState("tag");
  const isCreateColorUnavailable = usedColors.has(normalizeColor(color));

  useEffect(() => {
    if (usedColors.has(normalizeColor(color))) {
      setColor(getFirstAvailableColor(usedColors));
    }
  }, [color, usedColors]);

  const getUnavailableColorsForEdit = (key) => {
    const result = new Set();

    items.forEach(([itemKey, item]) => {
      if (itemKey !== key) {
        result.add(normalizeColor(item.color));
      }
    });

    return result;
  };

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    if (usedColors.has(normalizeColor(color))) return;

    try {
      await createCategory({
        title: trimmed,
        color,
        icon,
      });
      setTitle("");
      setIcon("tag");
      await onCategoriesChanged();
    } catch (e) {
      console.error(e);
    }
  };

  const startEdit = (key, item) => {
    setEditingKey(key);
    setEditingTitle(item.title);
    setEditingColor(item.color);
    setEditingIcon(item.icon || "tag");
  };

  const saveEdit = async () => {
    const item = categories[editingKey];
    if (!item) return;

    const trimmed = editingTitle.trim();
    if (!trimmed) return;
    if (getUnavailableColorsForEdit(editingKey).has(normalizeColor(editingColor))) {
      return;
    }

    try {
      await updateCategory(item.id, {
        title: trimmed,
        color: editingColor,
        icon: editingIcon,
      });
      setEditingKey(null);
      setEditingTitle("");
      setEditingColor(CATEGORY_COLOR_PALETTE[0].value);
      setEditingIcon("tag");
      await onCategoriesChanged();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (key, item) => {
    const ok = window.confirm(`Удалить категорию "${item.title}"?`);
    if (!ok) return;

    try {
      await deleteCategory(item.id);
      await onCategoriesChanged();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="task-modal-backdrop" onClick={onClose}>
      <div
        className={
          "task-modal category-manager-modal" +
          (editingKey ? " category-manager-modal--editing" : "")
        }
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Управление категориями</h3>

        <div
          className={
            "category-manager-list" +
            (editingKey ? " category-manager-list--editing" : "")
          }
        >
          {items.map(([key, item]) => (
            <div
              key={key}
              className={
                "category-manager-item" +
                (editingKey === key ? " category-manager-item--editing" : "")
              }
            >
              {editingKey === key ? (
                <>
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    placeholder="Название"
                  />
                  <CategoryColorPalette
                    value={editingColor}
                    onChange={setEditingColor}
                    unavailableColors={getUnavailableColorsForEdit(key)}
                  />
                  <CategoryIconPicker
                    value={editingIcon}
                    onChange={setEditingIcon}
                  />
                  <button type="button" className="primary-btn" onClick={saveEdit}>
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setEditingKey(null)}
                  >
                    Отмена
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="category-manager-icon-button"
                    onClick={() => startEdit(key, item)}
                    aria-label={`Редактировать категорию ${item.title}`}
                  >
                    <span
                      className="category-dot"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="category-manager-icon">
                      <CategoryIcon name={item.icon || "tag"} />
                    </span>
                  </button>
                  <span className="category-manager-name">{item.title}</span>
                  <button
                    type="button"
                    className="category-manager-edit-btn"
                    onClick={() => startEdit(key, item)}
                  >
                    ✎
                  </button>
                  {key !== "other" && (
                    <button
                      type="button"
                      className="category-manager-delete-btn"
                      onClick={() => handleDelete(key, item)}
                    >
                      ×
                    </button>
                  )}
                </>
              )}
            </div>
          ))}

          {items.length === 0 && (
            <div className="day-task-empty">
              Добавь категории, чтобы раскладывать задачи по сферам и цветам
            </div>
          )}
        </div>

        <div className="category-manager-create">
          <h4>Новая категория</h4>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название категории"
          />
          <CategoryColorPalette
            value={color}
            onChange={setColor}
            unavailableColors={usedColors}
          />
          <CategoryIconPicker value={icon} onChange={setIcon} />
          <button
            type="button"
            className="primary-btn"
            onClick={handleCreate}
            disabled={!title.trim() || isCreateColorUnavailable}
          >
            Добавить
          </button>
        </div>

        <div className="task-modal-buttons">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
