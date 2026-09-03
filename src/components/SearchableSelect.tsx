import { useEffect, useRef, useState } from "react";

export interface SearchableOption {
  id: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

// A text-input-driven stand-in for a native <select>, for option lists that
// can grow large (the shared exercise library) -- typing filters the list
// instead of forcing a blind scroll through every option.
export default function SearchableSelect({ options, value, onChange, placeholder, disabled }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    function onDocPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, []);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="searchable-select" ref={rootRef}>
      <input
        type="text"
        disabled={disabled}
        placeholder={placeholder ?? "Search…"}
        value={open ? query : (selected?.label ?? "")}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setOpen(true);
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered.length > 0) {
            e.preventDefault();
            pick(filtered[0].id);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
      />
      {open && (
        <div className="searchable-select-menu">
          {filtered.length === 0 && <div className="searchable-select-empty muted">No matches.</div>}
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`searchable-select-option${o.id === value ? " active" : ""}`}
              // Prevents the input's blur (which would close the menu) from
              // firing before the click is registered.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
