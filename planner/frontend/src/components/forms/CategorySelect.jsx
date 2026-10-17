import CategoryPicker from "./CategoryPicker";

export default function CategorySelect({
  value,
  categories = {},
  onChange,
  onManageClick,
  placeholder = "Без категории",
  label = "Категория",
  disabled = false,
  includeAll = false,
}) {
  const options = [
    { value: "", title: includeAll ? "Все категории" : placeholder },
    ...Object.entries(categories).map(([key, category]) => ({ ...category, value: key })),
  ];
  return <CategoryPicker value={value} options={options} onChange={onChange}
    onManageClick={onManageClick} placeholder={placeholder} label={label} disabled={disabled} />;
}
