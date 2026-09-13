// Fixed set of chat rooms. `room` on the messages table isn't a
// CHECK-constrained list, so adding one here is a pure frontend change —
// no migration needed.
export const ROOMS = [
  { id: "news", label: "📣 News" },
  { id: "general", label: "General" },
  { id: "gym", label: "Gym" },
  { id: "climbing", label: "Climbing" },
  { id: "bodyweight", label: "Bodyweight" },
  { id: "running", label: "Running" },
] as const;

export type RoomId = (typeof ROOMS)[number]["id"];

export const DEFAULT_ROOM: RoomId = "general";

// Whatever's most recently posted in this room drives the "what's new"
// banner on the Dashboard (see src/pages/Dashboard.tsx) -- post an update
// here after shipping a feature/fix so people actually notice it landed.
export const NEWS_ROOM: RoomId = "news";
