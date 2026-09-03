import { useEffect, useMemo, useRef } from "react";

const DAY_MS = 86400000;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayNumber(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m, d) / DAY_MS);
}

interface Cell {
  dayNum: number;
  count: number; // -1 = not-yet-happened, render as a blank placeholder
}

interface ContributionGraphProps {
  /** "YYYY-MM-DD" workout dates, duplicates allowed (multiple workouts same day). */
  dates: string[];
  /** How many weeks of history to show. GitHub shows ~52; that's the point. */
  weeks?: number;
}

// A GitHub-contributions-style calendar: one column per week, one square per
// day, colored by how many workouts landed that day. Deliberately NOT tied
// to streak logic (see src/lib/streak.ts) -- this is just a visual density
// map, so a rest day shows as an empty square without implying anything
// broke, which is the whole point of not being Duolingo about it.
export default function ContributionGraph({ dates, weeks = 52 }: ContributionGraphProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const map = new Map<number, number>();
    for (const dateStr of dates) {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dn = dayNumber(y, m - 1, d);
      map.set(dn, (map.get(dn) ?? 0) + 1);
    }
    return map;
  }, [dates]);

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
        col.push({ dayNum: dn, count: dn > todayDn ? -1 : counts.get(dn) ?? 0 });
      }
      cols.push(col);
    }
    return cols;
  }, [counts, weeks]);

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

  return (
    <div>
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
                      className={`cg-cell ${levelClass(cell.count)}`}
                      title={`${new Date(cell.dayNum * DAY_MS).toISOString().slice(0, 10)}: ${cell.count} workout${cell.count === 1 ? "" : "s"}`}
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
    </div>
  );
}
