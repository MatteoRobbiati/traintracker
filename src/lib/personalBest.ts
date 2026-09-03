// "Personal best" for a single set. Loaded exercises: heaviest weight wins
// (reps as tiebreaker). Bodyweight exercises: most reps wins (added weight
// -- more weight added, or less assistance -- as tiebreaker), since "weight"
// alone isn't a meaningful ranking when it can be 0 or negative (assisted).
export interface BestSetCandidate {
  weight: number;
  reps: number;
  date: string;
}

export function isBetterSet(candidate: BestSetCandidate, current: BestSetCandidate | null, isBodyweight: boolean) {
  if (!current) return true;
  if (isBodyweight) {
    if (candidate.reps !== current.reps) return candidate.reps > current.reps;
    return candidate.weight > current.weight;
  }
  if (candidate.weight !== current.weight) return candidate.weight > current.weight;
  return candidate.reps > current.reps;
}
