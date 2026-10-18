import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "../../api/tasks";
import { CategoryIcon } from "../icons";
import { CATEGORY_ICONS } from "../icons/categoryIcons";

const CATEGORY_TITLE_MAX_LENGTH = 50;

const CATEGORY_COLOR_PALETTE = [
  // Include every default category color from backend/bootstrap.py so it can
  // still be selected after the original category has been deleted.
  { value: "#9B7BE8", label: "Лавандовый" },
  { value: "#7C67D8", label: "Фиалковый" },
  { value: "#B3C0F5", label: "Светлый индиго" },
  { value: "#5A6FD1", label: "Индиго" },
  { value: "#6F8EDB", label: "Васильковый" },
  { value: "#7EA7F2", label: "Голубой" },
  { value: "#9AC6FF", label: "Пастельный голубой" },
  { value: "#4FA3E0", label: "Небесный" },
  { value: "#67C5D8", label: "Бирюзовый" },
  { value: "#4DB6B2", label: "Морская волна" },
  { value: "#5FD6C0", label: "Мятный" },
  { value: "#3FAE8C", label: "Изумрудный" },
  { value: "#72C99F", label: "Шалфей" },
  { value: "#63B85E", label: "Травяной" },
  { value: "#6BAF6B", label: "Лесной" },
  { value: "#7ECF8A", label: "Светло-зеленый" },
  { value: "#8BCB6F", label: "Зеленый" },
  { value: "#A0B455", label: "Фисташковый" },
  { value: "#B9C86A", label: "Оливковый" },
  { value: "#D5C65F", label: "Горчичный" },
  { value: "#F3E3B0", label: "Кремовый" },
  { value: "#F2D573", label: "Солнечный" },
  { value: "#E5B84E", label: "Золотистый" },
  { value: "#F0B36A", label: "Персиковый" },
  { value: "#E68A4F", label: "Терракотовый" },
  { value: "#E99A6D", label: "Коралловый" },
  { value: "#E06A5E", label: "Гранатовый" },
  { value: "#E07070", label: "Приглушенный красный" },
  { value: "#F1848E", label: "Розовый" },
  { value: "#C95576", label: "Ягодный" },
  { value: "#E36F9E", label: "Малиновый" },
  { value: "#D985C7", label: "Орхидея" },
  { value: "#D48ABF", label: "Пыльная роза" },
  { value: "#B064C9", label: "Пурпурный" },
  { value: "#B97AD6", label: "Аметист" },
  { value: "#A6A2D8", label: "Сиреневый" },
  { value: "#95A0BF", label: "Дымчатый" },
  { value: "#A8B6C4", label: "Серо-голубой" },
  { value: "#C0C0C0", label: "Серебристый" },
  { value: "#BBBBBB", label: "Серый" },
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
  portalTarget = document.body,
}) {
  const items = useMemo(() => Object.entries(categories), [categories]);
  const usedColors = useMemo(
    () => new Set(items.map(([, item]) => normalizeColor(item.color))),
    [items]
  );

  const [editingKey, setEditingKey] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingColor, setEditingColor] = useState(CATEGORY_COLOR_PALETTE[0].value);
  const [editingIcon, setEditingIcon] = useState("tag");

  const [creatingNew, setCreatingNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newColor, setNewColor] = useState(() => getFirstAvailableColor(new Set()));
  const [newIcon, setNewIcon] = useState("tag");

  const isEditing = !!editingKey || creatingNew;
  const closeRef = useRef(null);
  useEffect(() => {
    if (!isEditing) closeRef.current?.focus();
  }, [isEditing]);

  const getUnavailableColorsForEdit = (key) => {
    const result = new Set();
    items.forEach(([itemKey, item]) => {
      if (itemKey !== key) {
        result.add(normalizeColor(item.color));
      }
    });
    return result;
  };

  const startEdit = (key, item) => {
    setCreatingNew(false);
    setEditingKey(key);
    setEditingTitle(item.title);
    setEditingColor(item.color);
    setEditingIcon(item.icon || "tag");
  };

  const saveEdit = async () => {
    const item = categories[editingKey];
    if (!item) return;

    const trimmed = editingTitle.trim();
    if (!trimmed || trimmed.length > CATEGORY_TITLE_MAX_LENGTH) return;
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

  const handleStartNew = () => {
    setEditingKey(null);
    setNewTitle("");
    setNewIcon("tag");
    setNewColor(getFirstAvailableColor(usedColors));
    setCreatingNew(true);
  };

  const handleSaveNew = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed.length > CATEGORY_TITLE_MAX_LENGTH) return;
    if (usedColors.has(normalizeColor(newColor))) return;

    try {
      await createCategory({ title: trimmed, color: newColor, icon: newIcon });
      setCreatingNew(false);
      setNewTitle("");
      setNewIcon("tag");
      await onCategoriesChanged();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelNew = () => {
    setCreatingNew(false);
    setNewTitle("");
  };

  return ReactDOM.createPortal(
    <div className="task-modal-backdrop" onClick={onClose} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    }}>
      <div
        className={
          "task-modal category-manager-modal" +
          (isEditing ? " category-manager-modal--editing" : "")
        }
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Управление категориями</h3>

        <div
          className={
            "category-manager-list" +
            (isEditing ? " category-manager-list--editing" : "")
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
                  <label className="category-manager-title-field">
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      placeholder="Название"
                      aria-label="Название категории"
                      maxLength={CATEGORY_TITLE_MAX_LENGTH}
                      autoFocus
                    />
                    <small>{editingTitle.length > CATEGORY_TITLE_MAX_LENGTH
                      ? `Сократите название до ${CATEGORY_TITLE_MAX_LENGTH} символов (сейчас ${editingTitle.length})`
                      : `До ${CATEGORY_TITLE_MAX_LENGTH} символов · ${editingTitle.length}/${CATEGORY_TITLE_MAX_LENGTH}`}</small>
                  </label>
                  <CategoryColorPalette
                    value={editingColor}
                    onChange={setEditingColor}
                    unavailableColors={getUnavailableColorsForEdit(key)}
                  />
                  <CategoryIconPicker
                    value={editingIcon}
                    onChange={setEditingIcon}
                  />
                  <button type="button" className="primary-btn" onClick={saveEdit}
                    disabled={!editingTitle.trim() || editingTitle.trim().length > CATEGORY_TITLE_MAX_LENGTH}>
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
                  <span className="category-manager-name" title={item.title}>{item.title}</span>
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

          {creatingNew && (
            <div className="category-manager-item category-manager-item--editing">
              <label className="category-manager-title-field">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Название"
                  aria-label="Название категории"
                  maxLength={CATEGORY_TITLE_MAX_LENGTH}
                  autoFocus
                />
                <small>До {CATEGORY_TITLE_MAX_LENGTH} символов · {newTitle.length}/{CATEGORY_TITLE_MAX_LENGTH}</small>
              </label>
              <CategoryColorPalette
                value={newColor}
                onChange={setNewColor}
                unavailableColors={usedColors}
              />
              <CategoryIconPicker value={newIcon} onChange={setNewIcon} />
              <button
                type="button"
                className="primary-btn"
                onClick={handleSaveNew}
                disabled={!newTitle.trim() || newTitle.trim().length > CATEGORY_TITLE_MAX_LENGTH}
              >
                Сохранить
              </button>
              <button type="button" className="secondary-btn" onClick={handleCancelNew}>
                Отмена
              </button>
            </div>
          )}

          {items.length === 0 && !creatingNew && (
            <div className="day-task-empty">
              Добавь категории, чтобы раскладывать задачи по сферам и цветам
            </div>
          )}
        </div>

        <div className="task-modal-buttons">
          {!creatingNew && !editingKey && (
            <button type="button" className="primary-btn" onClick={handleStartNew}>
              + Новая категория
            </button>
          )}
          <button ref={closeRef} type="button" className="secondary-btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}
