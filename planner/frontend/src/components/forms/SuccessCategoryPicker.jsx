import CategoryPicker from "./CategoryPicker";

export default function SuccessCategoryPicker({ categories = [], includeAll = false, ...props }) {
  const options = [
    ...(includeAll ? [{ value: "", title: "Все категории" }] : []),
    { value: includeAll ? "none" : "", title: "Без категории" },
    ...categories.map(category => ({ ...category, value: String(category.id) })),
  ];
  return <CategoryPicker {...props} options={options} />;
}
