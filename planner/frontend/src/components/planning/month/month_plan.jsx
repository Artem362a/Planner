import React from 'react';

const MonthPlan = () => {
  const days = Array.from({ length: 21 }, (_, i) => i + 1);

  return (
    <>
      <div className="month-header">
        <div className="month-title">Расписание на месяц</div>
        <div className="month-name">Январь</div>
      </div>
      <div className="month-body">
        <div className="month-arrow">‹</div>
        <div className="month-grid">
          {days.map((d) => (
            <div
              key={d}
              className={
                d === 12 ? 'month-cell current' : 'month-cell'
              }
            >
              <div>{d}</div>
              {d === 2 && (
                <div className="month-dots">
                  <span className="month-dot.green" />
                </div>
              )}
              {d === 3 && (
                <div className="month-dots">
                  <span className="month-dot.green" />
                  <span className="month-dot.pink" />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="month-arrow">›</div>
      </div>
    </>
  );
};

export default MonthPlan;
