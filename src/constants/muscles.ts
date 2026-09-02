// Canonical muscle ids — kept in exact sync with the CHECK constraints in
// supabase/schema.sql and with the region ids in the front/back body SVGs.
export const MUSCLES = [
  "neck",
  "traps",
  "front_delts",
  "rear_delts",
  "chest",
  "abs",
  "obliques",
  "biceps",
  "triceps",
  "forearms",
  "lats",
  "upper_back",
  "lower_back",
  "glutes",
  "quads",
  "hamstrings",
  "adductors",
  "calves",
] as const;

export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABELS: Record<Muscle, string> = {
  neck: "Neck",
  traps: "Traps",
  front_delts: "Front Delts",
  rear_delts: "Rear Delts",
  chest: "Chest",
  abs: "Abs",
  obliques: "Obliques",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  lats: "Lats",
  upper_back: "Upper Back",
  lower_back: "Lower Back",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  adductors: "Adductors",
  calves: "Calves",
};
