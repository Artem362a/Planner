const RADIUS = 78;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const percent = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export default function SuccessesDistribution({ data, recordsLabel }) {
  const slices = data.categories.slice(0, 5).map(row => ({
    key: row.category ? String(row.category.id) : "none",
    title: row.category?.title || "Без категории",
    color: row.category?.color || "var(--text-muted)",
    total: row.total,
  }));
  const otherTotal = data.categories.slice(5).reduce((total, row) => total + row.total, 0);
  if (otherTotal) slices.push({ key: "others", title: "Другие категории", color: "var(--text-muted)", total: otherTotal });

  return <figure className="successes-distribution" aria-label="Распределение успехов по категориям">
    <div className="successes-donut">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="var(--line)" strokeWidth="20" />
        {slices.map((slice, index) => {
          const length = slice.total / data.total * CIRCUMFERENCE;
          const offset = slices.slice(0, index).reduce((total, previous) => total + previous.total, 0) / data.total * CIRCUMFERENCE;
          const gap = slices.length > 1 ? Math.min(4, length * .15) : 0;
          return <circle key={slice.key} cx="100" cy="100" r={RADIUS} fill="none" strokeWidth="20"
            className="successes-donut-segment" style={{ "--success-color": slice.color }}
            strokeDasharray={`${length - gap} ${CIRCUMFERENCE - length + gap}`}
            strokeDashoffset={-offset - gap / 2} transform="rotate(-90 100 100)" />;
        })}
      </svg>
      <div className="successes-donut-total"><strong>{data.total}</strong><span>{recordsLabel}</span></div>
    </div>
    <ul className="successes-distribution-legend">{slices.map(slice => <li key={slice.key}>
      <span className="successes-distribution-dot" style={{ "--success-color": slice.color }} aria-hidden="true" />
      <span className="successes-distribution-title">{slice.title}</span>
      <span className="successes-distribution-value"><strong>{slice.total}</strong><span>{percent.format(slice.total / data.total * 100)}%</span></span>
    </li>)}</ul>
  </figure>;
}
