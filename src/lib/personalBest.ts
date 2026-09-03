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

// A second, independent kind of "best" for an exercise: the highest total
// volume put up in a single session, rather than the heaviest single set
// ("massimale"). A session of many lighter sets can out-volume one heavy
// single, and that's worth its own record instead of being invisible next
// to the max-weight one.
export interface BestVolumeCandidate {
  volume: number;
  date: string;
}

interface VolumeSetInput {
  workoutId: string;
  date: string;
  volume: number;
}

export function bestVolumeSession(sets: VolumeSetInput[]): BestVolumeCandidate | null {
  const byWorkout = new Map<string, BestVolumeCandidate>();
  for (const s of sets) {
    const entry = byWorkout.get(s.workoutId);
    if (entry) entry.volume += s.volume;
    else byWorkout.set(s.workoutId, { volume: s.volume, date: s.date });
  }
  let best: BestVolumeCandidate | null = null;
  for (const v of byWorkout.values()) {
    if (!best || v.volume > best.volume) best = v;
  }
  return best;
}
