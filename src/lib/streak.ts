// Training streak — deliberately not the Duolingo kind. One rest day never
// breaks it: the streak only ends once a *second* consecutive day passes
// with nothing logged. So "train, rest, train" keeps counting; "train,
// rest, rest" doesn't. That's the whole rule, encoded as "gap between two
// training days <= 2 calendar days keeps the run alive".
const DAY_MS = 86400000;

// Both of these go through Date.UTC on plain Y/M/D components -- never a
// parsed instant -- so the resulting day numbers are pure calendar-day
// counts with no UTC/local mixing. (Parsing "YYYY-MM-DD" as local midnight
// via `new Date(str)` and separately taking Date.now() as a UTC instant,
// like an earlier version of this file did, is exactly that mixing bug:
// depending on the runtime's UTC offset, local midnight can round to the
// *previous* UTC day, silently shifting every gap by one.)
function dateStrToDayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

function todayDayNumber(): number {
  const now = new Date();
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
}

export interface StreakInfo {
  /** Distinct training days in the still-alive streak; 0 if it already broke. */
  current: number;
  /** Longest streak ever, by the same rule. */
  longest: number;
  /** How many days ago the streak broke (only set when current === 0 and there's history). */
  brokenDaysAgo: number | null;
  /** True when the streak is alive but today hasn't been trained yet -- a
   * nudge state, since one more missed day (tomorrow, at the latest) breaks it. */
  onRestDay: boolean;
}

/** `dateStrings` are workout dates ('YYYY-MM-DD'), any order, duplicates fine. */
export function computeStreak(dateStrings: string[]): StreakInfo {
  const days = Array.from(new Set(dateStrings.map(dateStrToDayNumber))).sort((a, b) => a - b);
  if (days.length === 0) return { current: 0, longest: 0, brokenDaysAgo: null, onRestDay: false };

  let longest = 1;
  let runLen = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = days[i] - days[i - 1];
    if (gap <= 2) {
      runLen++;
    } else {
      longest = Math.max(longest, runLen);
      runLen = 1;
    }
  }
  longest = Math.max(longest, runLen);

  const lastDay = days[days.length - 1];
  const gapFromToday = todayDayNumber() - lastDay;
  const alive = gapFromToday <= 2;

  return {
    current: alive ? runLen : 0,
    longest,
    brokenDaysAgo: alive ? null : gapFromToday,
    onRestDay: alive && gapFromToday >= 1,
  };
}
