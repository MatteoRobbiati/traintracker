// Curated presets for endurance workouts. `sport` is free text in the DB
// (no CHECK constraint), so picking "Other" and typing a custom name always
// works — this list is just what the form suggests.
export const SPORTS = [
  "climbing",
  "running",
  "swimming",
  "cycling",
  "tennis",
] as const;

export type Sport = (typeof SPORTS)[number];

export const SPORT_LABELS: Record<Sport, string> = {
  climbing: "Climbing",
  running: "Running",
  swimming: "Swimming",
  cycling: "Cycling",
  tennis: "Tennis",
};

export const CLIMBING_DISCIPLINES = ["boulder", "rope", "both"] as const;
export type ClimbingDiscipline = (typeof CLIMBING_DISCIPLINES)[number];
export const CLIMBING_DISCIPLINE_LABELS: Record<ClimbingDiscipline, string> = {
  boulder: "Boulder",
  rope: "Rope",
  both: "Both",
};
