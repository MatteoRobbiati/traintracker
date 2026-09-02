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
 * Volume for one set. Bodyweight exercises count (body weight + added weight)
 * × reps — added weight may be 0 (plain bodyweight) or negative (assisted).
 * Loaded exercises are just weight × reps.
 */
export function setVolume(params: {
  isBodyweight: boolean;
  weight: number;
  reps: number;
  bodyWeightKg: number | null;
}): number {
  const { isBodyweight, weight, reps, bodyWeightKg } = params;
  if (isBodyweight) {
    const bw = bodyWeightKg ?? 0;
    return (bw + weight) * reps;
  }
  return weight * reps;
}
