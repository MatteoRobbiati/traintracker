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
  return new Date(iso).toLocaleDateString(undefined, {
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
  if (equipment.isBodyweight) return (bodyWeightKg ?? 0) + weight;
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
