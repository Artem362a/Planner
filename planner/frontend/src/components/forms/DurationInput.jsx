import { useRef } from "react";
import { completeDurationInput, formatDurationInput } from "../../utils/durationInput";

export default function DurationInput({ id, name, value, onValueChange }) {
  const hoursRef = useRef(null);
  const minutesRef = useRef(null);
  const [hours = "", minutes = ""] = value.split(":");
  const setPart = (part, next) => {
    const h = part === "hours" ? next : hours;
    const m = part === "minutes" ? next : minutes;
    onValueChange(h || m ? `${h}:${m}` : "");
  };
  const focusPart = ref => { ref.current?.focus(); ref.current?.select(); };
  const keyDown = (event, part) => {
    if (part === "hours" && (event.key === ":" || event.key === "ArrowRight")) {
      event.preventDefault(); focusPart(minutesRef);
    } else if (part === "minutes" && (event.key === "ArrowLeft" || (event.key === "Backspace" && !minutes))) {
      event.preventDefault(); focusPart(hoursRef);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const current = Number(part === "hours" ? hours : minutes) || 0;
      const next = Math.max(0, Math.min(part === "hours" ? 99 : 59, current + (event.key === "ArrowUp" ? 1 : -1)));
      setPart(part, String(next).padStart(2, "0"));
    }
  };

  return <div className="duration-input" role="group" aria-label="Длительность (ЧЧ:ММ)"
    onClick={event => { if (event.target === event.currentTarget) focusPart(hoursRef); }}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) onValueChange(completeDurationInput(value));
    }}
    onPaste={event => {
      const text = event.clipboardData.getData("text").trim();
      if (/^(?:\d{4}|\d{1,2}:\d{2})$/.test(text)) {
        event.preventDefault(); onValueChange(formatDurationInput(text));
      }
    }}>
    <input ref={hoursRef} id={id} type="text" inputMode="numeric" className="duration-input-part"
      aria-label="Часы длительности" maxLength={2} placeholder="--" value={hours}
      onFocus={event => event.currentTarget.select()}
      onKeyDown={event => keyDown(event, "hours")}
      onChange={event => {
        const next = event.target.value.replace(/\D/g, "").slice(0, 2);
        setPart("hours", next);
        if (next.length === 2 && !event.nativeEvent.inputType?.startsWith("delete")) focusPart(minutesRef);
      }} />
    <span className="duration-input-separator" aria-hidden="true">:</span>
    <input ref={minutesRef} type="text" inputMode="numeric" className="duration-input-part"
      aria-label="Минуты длительности" maxLength={2} placeholder="--" value={minutes}
      aria-invalid={Number(minutes) > 59 || undefined}
      onFocus={event => event.currentTarget.select()}
      onKeyDown={event => keyDown(event, "minutes")}
      onChange={event => setPart("minutes", event.target.value.replace(/\D/g, "").slice(0, 2))} />
    <input type="hidden" name={name} value={value} />
  </div>;
}
