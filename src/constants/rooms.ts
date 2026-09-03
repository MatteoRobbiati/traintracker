// Fixed set of chat rooms. `room` on the messages table isn't a
// CHECK-constrained list, so adding one here is a pure frontend change —
// no migration needed.
export const ROOMS = [
  { id: "general", label: "General" },
  { id: "gym", label: "Gym" },
  { id: "climbing", label: "Climbing" },
  { id: "bodyweight", label: "Bodyweight" },
  { id: "running", label: "Running" },
] as const;

export type RoomId = (typeof ROOMS)[number]["id"];

export const DEFAULT_ROOM: RoomId = "general";
