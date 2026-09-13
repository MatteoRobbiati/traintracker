import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../lib/format";

const DAY_MS = 86400000;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayNumber(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m, d) / DAY_MS);
}

interface Cell {
  dayNum: number;
  count: number; // -1 = not-yet-happened, render as a blank placeholder
}

export interface ContributionWorkout {
  id: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** What to show for this workout in the clicked-day list, e.g. "Strength" or "Running". */
  label: string;
}

interface ContributionGraphProps {
  /** Per-workout entries (id + date + label) so a clicked day can list and
   * link to what happened -- use this when the caller has real workout rows
   * (Dashboard, Profile's own calendar). */
  workouts?: ContributionWorkout[];
  /** Bare "YYYY-MM-DD" dates, no click-through detail beyond the count --
   * for an aggregate view with no single owner (Group's combined calendar)
   * or a read-only one (viewing a connection's calendar). Ignored if
   * `workouts` is also given. */
  dates?: string[];
  /** How many weeks of history to show. GitHub shows ~52; that's the point. */
  weeks?: number;
  /** Overrides the page's own --ember/--ember-muted for this graph only --
   * for showing someone else's calendar in *their* chosen accent color (see
   * src/lib/theme.ts accentColors()) rather than the current viewer's. */
  colorOverride?: { ember: string; emberMuted: string };
}

// A GitHub-contributions-style calendar: one column per week, one square per
// day, colored by how many workouts landed that day. Deliberately NOT tied
// to streak logic (see src/lib/streak.ts) -- this is just a visual density
// map, so a rest day shows as an empty square without implying anything
// broke, which is the whole point of not being Duolingo about it.
export default function ContributionGraph({ workouts, dates, weeks = 52, colorOverride }: ContributionGraphProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // dayNum of the clicked cell, so tapping it again (or the ✕) closes it --
  // a fixed panel under the grid rather than a floating tooltip, which is
  // the only thing that works reliably at phone width without spilling
  // past the panel's edge.
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<number, ContributionWorkout[]>();
    if (workouts) {
      for (const w of workouts) {
        const [y, m, d] = w.date.split("-").map(Number);
        const dn = dayNumber(y, m - 1, d);
        const list = map.get(dn) ?? [];
        list.push(w);
        map.set(dn, list);
      }
    } else {
      // No per-workout detail available -- still track a count per day (as
      // placeholder entries) so a click can at least say how many.
      for (const dateStr of dates ?? []) {
        const [y, m, d] = dateStr.split("-").map(Number);
        const dn = dayNumber(y, m - 1, d);
        const list = map.get(dn) ?? [];
        list.push({ id: `${dn}-${list.length}`, date: dateStr, label: "" });
        map.set(dn, list);
      }
    }
    return map;
  }, [workouts, dates]);

  const columns = useMemo(() => {
    const now = new Date();
    const todayDn = dayNumber(now.getFullYear(), now.getMonth(), now.getDate());
    // Weeks run Sun -> Sat, like GitHub's own graph. Extend the range to the
    // end of the current week so the grid always ends on a full column.
    const todayDow = new Date(todayDn * DAY_MS).getUTCDay();
    const endDn = todayDn + (6 - todayDow);
    const startDn = endDn - weeks * 7 + 1;

    const cols: Cell[][] = [];
    for (let w = 0; w < weeks; w++) {
      const col: Cell[] = [];
      for (let d = 0; d < 7; d++) {
        const dn = startDn + w * 7 + d;
        col.push({ dayNum: dn, count: dn > todayDn ? -1 : byDate.get(dn)?.length ?? 0 });
      }
      cols.push(col);
    }
    return cols;
  }, [byDate, weeks]);

  // Start scrolled all the way to the right (today) instead of the oldest
  // week -- on a phone-width screen almost none of the 52 weeks fit, and the
  // recent ones are what's actually useful to see first.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [columns]);

  function levelClass(count: number): string {
    if (count <= 0) return "cg-l0";
    if (count === 1) return "cg-l1";
    if (count === 2) return "cg-l2";
    return "cg-l3";
  }

  function toggleDay(dayNum: number) {
    setSelectedDay((d) => (d === dayNum ? null : dayNum));
  }

  const selectedWorkouts = selectedDay != null ? byDate.get(selectedDay) ?? [] : [];
  // Only render as links when the caller gave us real workout ids -- the
  // bare-`dates` mode fabricates placeholder ids that don't point anywhere.
  const linkable = !!workouts;

  const overrideStyle = colorOverride
    ? ({ "--ember": colorOverride.ember, "--ember-muted": colorOverride.emberMuted } as CSSProperties)
    : undefined;

  return (
    <div style={overrideStyle}>
      <div className="cg-scroll" ref={scrollRef}>
        <div className="cg-grid">
          {columns.map((col, i) => {
            const firstMonth = new Date(col[0].dayNum * DAY_MS).getUTCMonth();
            const prevMonth = i > 0 ? new Date(columns[i - 1][0].dayNum * DAY_MS).getUTCMonth() : null;
            const showLabel = i === 0 || firstMonth !== prevMonth;
            return (
              <div key={i} className="cg-col">
                <div className="cg-month-label">{showLabel ? MONTH_LABELS[firstMonth] : ""}</div>
                {col.map((cell, j) =>
                  cell.count < 0 ? (
                    <div key={j} className="cg-cell cg-empty" />
                  ) : (
                    <div
                      key={j}
                      role="button"
                      tabIndex={0}
                      className={`cg-cell ${levelClass(cell.count)} ${selectedDay === cell.dayNum ? "cg-selected" : ""}`}
                      title={`${new Date(cell.dayNum * DAY_MS).toISOString().slice(0, 10)}: ${cell.count} workout${cell.count === 1 ? "" : "s"}`}
                      onClick={() => toggleDay(cell.dayNum)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleDay(cell.dayNum);
                        }
                      }}
                    />
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="cg-legend">
        <span>Less</span>
        <span className="cg-cell cg-l0" />
        <span className="cg-cell cg-l1" />
        <span className="cg-cell cg-l2" />
        <span className="cg-cell cg-l3" />
        <span>More</span>
      </div>

      {selectedDay != null && (
        <div className="cg-day-detail">
          <div className="row between">
            <strong>{formatDate(new Date(selectedDay * DAY_MS).toISOString().slice(0, 10))}</strong>
            <button type="button" className="ghost" onClick={() => setSelectedDay(null)}>
              ✕
            </button>
          </div>
          {selectedWorkouts.length === 0 ? (
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
              No workouts logged.
            </p>
          ) : linkable ? (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {selectedWorkouts.map((w) => (
                <li key={w.id}>
                  <Link to={`/workouts/${w.id}`}>{w.label}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
              {selectedWorkouts.length} workout{selectedWorkouts.length === 1 ? "" : "s"} logged.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
