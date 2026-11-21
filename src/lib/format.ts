// Small formatting helpers shared across pages.

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);

  if (diffSec < 30) return "just now";
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = diffSec;
  for (const [size, name] of units) {
    if (value < size) {
      const rounded = Math.round(value);
      return `${rounded} ${name}${rounded === 1 ? "" : "s"} ago`;
    }
    value /= size;
  }
  return then > now ? "in the future" : "a while ago";
}

export function formatDate(iso: string): string {
  // A bare "YYYY-MM-DD" is parsed as UTC midnight by Date, which shows up as
  // the previous day anywhere west of UTC -- read it as a local date instead.
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * How an exercise's logged `weight` relates to what's actually being moved.
 * Mutually exclusive by construction (see the exercise_equipment_exclusive
 * CHECK constraint in supabase/schema.sql) -- at most one of these applies.
 */
export interface Equipment {
  isBodyweight: boolean;
  /** Only meaningful when isBodyweight is true: what fraction of body weight
   * this specific movement actually loads -- a pull-up is ~100%, a back
   * extension more like 65%. Defaults to 100 (full body weight) wherever a
   * caller doesn't have a real value. */
  bodyweightPercent: number;
  /** Logged weight is per dumbbell (both hands work the same weight); the
   * total being moved is double that. */
  isDumbbell: boolean;
  /** Logged weight is what's *added* to the bar; the bar itself weighs this
   * much on top. null for anything that isn't a barbell exercise. */
  barWeightKg: number | null;
}

/**
 * The actual total weight being moved for one set -- distinct from the raw
 * `weight` value logged, which for bodyweight/dumbbell/barbell exercises is
 * only part of the picture. Used for volume below, and anywhere a PB or
 * table wants to show the true total explicitly rather than just the raw
 * logged number (added weight may be negative for assisted bodyweight
 * movements, so this can come out lower than the logged weight too).
 */
export function effectiveWeight(equipment: Equipment, weight: number, bodyWeightKg: number | null): number {
  if (equipment.isBodyweight) return (bodyWeightKg ?? 0) * (equipment.bodyweightPercent / 100) + weight;
  if (equipment.barWeightKg != null) return equipment.barWeightKg + weight;
  if (equipment.isDumbbell) return weight * 2;
  return weight;
}

/** Volume for one set: effectiveWeight() × reps. */
export function setVolume(params: {
  equipment: Equipment;
  weight: number;
  reps: number;
  bodyWeightKg: number | null;
}): number {
  const { equipment, weight, reps, bodyWeightKg } = params;
  return effectiveWeight(equipment, weight, bodyWeightKg) * reps;
}

/** Today's date as YYYY-MM-DD in the *local* timezone. `toISOString()` is
 * UTC, which right after midnight (CET/CEST) still says yesterday. */
export function todayLocalIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Mon 17 Nov" -- compact, for cards and hints. Date-only strings are read
 * as local dates, so they never shift by a day. */
export function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate.length === 10 ? `${isoDate}T00:00:00` : isoDate);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** "60 kg" / "60.5 kg", trimming a pointless ".0". */
export function formatKg(kg: number): string {
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;
}
