import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CloseIcon, SearchIcon, PlusIcon } from "./icons";

export interface PickerExercise {
  id: string;
  name: string;
}

interface ExercisePickerProps {
  open: boolean;
  exercises: PickerExercise[];
  /** Most recent first -- shown on top when the search box is empty. */
  recentIds: string[];
  /** Exercises already in the workout get a small "added" marker. */
  inWorkoutIds?: string[];
  title?: string;
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}

/** Bottom sheet for choosing an exercise: thumb-reachable on a phone, with
 * the recently used ones first so the usual lifts are a single tap. */
export default function ExercisePicker({
  open,
  exercises,
  recentIds,
  inWorkoutIds = [],
  title = "Add exercise",
  onPick,
  onClose,
}: ExercisePickerProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    // Focusing immediately on iOS fights the slide-up animation; wait a beat.
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 220);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const recent = useMemo(
    () => recentIds.map((id) => byId.get(id)).filter((e): e is PickerExercise => !!e).slice(0, 8),
    [recentIds, byId]
  );
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? exercises.filter((e) => e.name.toLowerCase().includes(q)) : exercises),
    [exercises, q]
  );

  if (!open) return null;

  function renderOption(e: PickerExercise) {
    const added = inWorkoutIds.includes(e.id);
    return (
      <button key={e.id} type="button" className="sheet-option" onClick={() => onPick(e.id)}>
        <span>{e.name}</span>
        {added && <span className="opt-meta">in workout</span>}
      </button>
    );
  }

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <div className="grabber" />
          <div className="row between nowrap">
            <h3 style={{ margin: 0 }}>{title}</h3>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
          <div style={{ position: "relative" }}>
            <SearchIcon
              width={18}
              height={18}
              style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft)" }}
            />
            <input
              ref={inputRef}
              type="search"
              placeholder="Search exercises…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered.length > 0) {
                  e.preventDefault();
                  onPick(filtered[0].id);
                }
              }}
              style={{ paddingLeft: 40 }}
              enterKeyHint="done"
            />
          </div>
        </div>
        <div className="sheet-body">
          {!q && recent.length > 0 && (
            <>
              <div className="sheet-section-label">Recent</div>
              {recent.map(renderOption)}
              <div className="sheet-section-label">All exercises</div>
            </>
          )}
          {filtered.map(renderOption)}
          {filtered.length === 0 && (
            <div className="empty-state" style={{ margin: 8 }}>
              <p style={{ margin: "0 0 10px" }}>No exercise called “{query}”.</p>
              <Link to="/exercises/new" className="btn soft sm">
                <PlusIcon width={16} height={16} /> Create it in the library
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
