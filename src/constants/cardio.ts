// Cardio *within* a strength workout (warmup/cooldown on a
// treadmill/bike/elliptical, or a standalone finisher) -- see
// supabase/schema.sql cardio_blocks. Distinct from a whole endurance-type
// workout (src/constants/sports.ts), which is a different logging flow.
export const CARDIO_ACTIVITIES = ["run", "walk", "bike", "elliptical"] as const;
export type CardioActivity = (typeof CARDIO_ACTIVITIES)[number];

export const CARDIO_ACTIVITY_LABELS: Record<CardioActivity, string> = {
  run: "Run",
  walk: "Walk",
  bike: "Bike",
  elliptical: "Elliptical",
};

export const CARDIO_PURPOSES = ["warmup", "cooldown", "standalone"] as const;
export type CardioPurpose = (typeof CARDIO_PURPOSES)[number];

export const CARDIO_PURPOSE_LABELS: Record<CardioPurpose, string> = {
  warmup: "Warmup",
  cooldown: "Cooldown",
  standalone: "Standalone",
};
