import { MUSCLES, MUSCLE_LABELS, type Muscle } from "../constants/muscles";

interface Props {
  label: string;
  selected: Muscle[];
  onChange: (next: Muscle[]) => void;
  disabledMuscles?: Muscle[];
}

export default function MuscleChecklist({ label, selected, onChange, disabledMuscles = [] }: Props) {
  function toggle(m: Muscle) {
    if (selected.includes(m)) onChange(selected.filter((x) => x !== m));
    else onChange([...selected, m]);
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ gap: "6px 10px" }}>
        {MUSCLES.map((m) => {
          const disabled = disabledMuscles.includes(m);
          return (
            <label
              key={m}
              className="chip"
              style={{
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.4 : 1,
                background: selected.includes(m) ? "var(--ember-muted)" : undefined,
                borderColor: selected.includes(m) ? "var(--ember)" : undefined,
              }}
            >
              <input
                type="checkbox"
                style={{ width: "auto", marginRight: 6 }}
                checked={selected.includes(m)}
                disabled={disabled}
                onChange={() => toggle(m)}
              />
              {MUSCLE_LABELS[m]}
            </label>
          );
        })}
      </div>
    </div>
  );
}
