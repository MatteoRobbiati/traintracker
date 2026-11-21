import { Link } from "react-router-dom";
import { SPORT_LABELS } from "../constants/sports";
import { ChevronRightIcon, MusicIcon } from "./icons";

export interface WorkoutCardData {
  id: string;
  date: string;
  workout_type: "strength" | "endurance";
  duration_minutes: number | null;
  sport: string | null;
  exerciseNames: string[];
  songTitle?: string | null;
  songArtist?: string | null;
  /** Name of whoever logged it for you, when that isn't you. */
  loggedByName?: string | null;
}

function sportLabel(sport: string): string {
  return (SPORT_LABELS as Record<string, string>)[sport] ?? sport;
}

export default function WorkoutCard({ w }: { w: WorkoutCardData }) {
  const d = new Date(`${w.date}T00:00:00`);
  const isEndurance = w.workout_type === "endurance";
  const title = isEndurance
    ? w.sport
      ? sportLabel(w.sport)
      : "Endurance"
    : d.toLocaleDateString(undefined, { weekday: "long" });
  const exercises =
    w.exerciseNames.length > 3
      ? `${w.exerciseNames.slice(0, 3).join(", ")} +${w.exerciseNames.length - 3}`
      : w.exerciseNames.join(", ");

  return (
    <Link to={`/workouts/${w.id}`} className={`card-link workout-card${isEndurance ? " is-endurance" : ""}`}>
      <div className="date-badge">
        <span className="d">{d.getDate()}</span>
        <span className="m">{d.toLocaleDateString(undefined, { month: "short" })}</span>
      </div>
      <div className="grow">
        <div className="row nowrap" style={{ gap: 6 }}>
          <span className="title truncate">{title}</span>
          {w.duration_minutes != null && <span className="chip">{w.duration_minutes}′</span>}
        </div>
        {exercises && <div className="meta truncate">{exercises}</div>}
        {(w.songTitle || w.loggedByName) && (
          <div className="row nowrap" style={{ gap: 6, marginTop: 4 }}>
            {w.songTitle && (
              <span className="chip primary truncate" style={{ maxWidth: "100%", minWidth: 0 }}>
                <MusicIcon width={12} height={12} style={{ flex: "none" }} />
                <span className="truncate">
                  {w.songTitle}
                  {w.songArtist ? ` · ${w.songArtist}` : ""}
                </span>
              </span>
            )}
            {w.loggedByName && <span className="chip focus">via {w.loggedByName}</span>}
          </div>
        )}
      </div>
      <ChevronRightIcon className="chev" width={18} height={18} />
    </Link>
  );
}
