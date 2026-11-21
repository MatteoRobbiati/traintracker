import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { formatDate, setVolume, type Equipment } from "../lib/format";
import { saveWorkoutAsTemplate } from "../lib/templates";
import { SPORT_LABELS, CLIMBING_DISCIPLINE_LABELS, type ClimbingDiscipline } from "../constants/sports";
import { CARDIO_ACTIVITY_LABELS, CARDIO_PURPOSE_LABELS, type CardioActivity, type CardioPurpose } from "../constants/cardio";
import Avatar from "../components/Avatar";
import SongCard from "../components/SongCard";
import Disclosure from "../components/Disclosure";
import { EditIcon, RepeatIcon, TrashIcon, CloseIcon } from "../components/icons";
import type { Exercise, EnduranceDetails, Workout, WorkoutSet, CardioBlock } from "../types/database";

type ExerciseEquipmentFields = Pick<
  Exercise,
  "id" | "name" | "is_bodyweight" | "bodyweight_percent" | "is_dumbbell" | "bar_weight_kg"
>;
type SetWithExercise = WorkoutSet & { exercise: ExerciseEquipmentFields };

function equipmentOf(exercise: ExerciseEquipmentFields): Equipment {
  return {
    isBodyweight: exercise.is_bodyweight,
    bodyweightPercent: exercise.bodyweight_percent,
    isDumbbell: exercise.is_dumbbell,
    barWeightKg: exercise.bar_weight_kg,
  };
}

interface EditRow {
  weight: string;
  reps: string;
  rest: string;
}

function sportLabel(sport: string): string {
  return (SPORT_LABELS as Record<string, string>)[sport] ?? sport;
}

function cardioBlockDetails(c: CardioBlock): string {
  const parts: string[] = [];
  if (c.duration_minutes != null) parts.push(`${c.duration_minutes} min`);
  if (c.speed_kmh != null) parts.push(`${c.speed_kmh} km/h`);
  if (c.incline_percent != null) parts.push(`${c.incline_percent}% incline`);
  return parts.join(" · ") || "No details logged";
}

function weightHeader(e: Equipment): string {
  if (e.isBodyweight) return "+kg";
  if (e.isDumbbell) return "kg ea.";
  if (e.barWeightKg != null) return "+kg bar";
  return "kg";
}

export default function WorkoutDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [sets, setSets] = useState<SetWithExercise[]>([]);
  const [cardioBlocks, setCardioBlocks] = useState<CardioBlock[]>([]);
  const [endurance, setEndurance] = useState<EnduranceDetails | null>(null);
  const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Training partners: who logged this for you (if not yourself), and whose
  // copies came out of the same "Training with" submit.
  const [loggedByName, setLoggedByName] = useState<string | null>(null);
  const [sessionPartners, setSessionPartners] = useState<{ workoutId: string; name: string }[]>([]);

  const [editingSets, setEditingSets] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, EditRow>>({});
  const [savingSets, setSavingSets] = useState(false);

  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const workoutId = id;
    let cancelled = false;
    async function load() {
      const { data: w } = await supabase.from("workouts").select("*").eq("id", workoutId).maybeSingle();
      if (cancelled) return;
      setWorkout(w ?? null);
      if (!w) {
        setLoading(false);
        return;
      }

      const ownerPromise = supabase.from("profiles").select("name").eq("id", w.user_id).maybeSingle();

      if (w.workout_type === "endurance") {
        const { data: details } = await supabase.from("endurance_details").select("*").eq("workout_id", workoutId).maybeSingle();
        setEndurance(details ?? null);
      } else {
        const [{ data: s }, { data: cardio }, { data: bw }] = await Promise.all([
          supabase
            .from("sets")
            .select("*, exercise:exercises(id, name, is_bodyweight, bodyweight_percent, is_dumbbell, bar_weight_kg)")
            .eq("workout_id", workoutId)
            .order("set_order"),
          supabase.from("cardio_blocks").select("*").eq("workout_id", workoutId).order("block_order"),
          supabase
            .from("body_weight_logs")
            .select("weight_kg")
            .eq("user_id", w.user_id)
            .order("recorded_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (cancelled) return;
        setSets((s as unknown as SetWithExercise[]) ?? []);
        setCardioBlocks(cardio ?? []);
        setBodyWeightKg(bw?.weight_kg ?? null);
      }

      const { data: owner } = await ownerPromise;
      setOwnerName(owner?.name ?? null);

      if (w.logged_by_id && w.logged_by_id !== w.user_id) {
        const { data: logger } = await supabase.from("profiles").select("name").eq("id", w.logged_by_id).maybeSingle();
        setLoggedByName(logger?.name ?? "A friend");
      }
      if (w.session_group_id) {
        const { data: siblings } = await supabase
          .from("workouts")
          .select("id, profile:profiles!user_id(name)")
          .eq("session_group_id", w.session_group_id)
          .neq("id", w.id);
        setSessionPartners(
          ((siblings as unknown as { id: string; profile: { name: string } | null }[]) ?? []).map((s) => ({
            workoutId: s.id,
            name: s.profile?.name ?? "?",
          }))
        );
      }

      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const grouped = useMemo(() => {
    // Keyed by exercise *position* (consecutive runs), so doing the same
    // exercise twice in a session shows up as two cards, as it was logged.
    const groups: { key: string; name: string; equipment: Equipment; sets: SetWithExercise[] }[] = [];
    for (const s of sets) {
      const last = groups[groups.length - 1];
      if (last && last.sets[0].exercise_id === s.exercise_id) last.sets.push(s);
      else groups.push({ key: s.id, name: s.exercise.name, equipment: equipmentOf(s.exercise), sets: [s] });
    }
    return groups;
  }, [sets]);

  const totalVolume = useMemo(
    () =>
      sets.reduce(
        (sum, s) => sum + setVolume({ equipment: equipmentOf(s.exercise), weight: s.weight, reps: s.reps, bodyWeightKg }),
        0
      ),
    [sets, bodyWeightKg]
  );

  async function deleteWorkout(confirmText: string) {
    if (!id || !confirm(confirmText)) return;
    setDeleting(true);
    setError(null);
    const { error, count } = await supabase.from("workouts").delete({ count: "exact" }).eq("id", id);
    setDeleting(false);
    if (error) {
      setError(`Couldn't delete: ${error.message}`);
      return;
    }
    if (count === 0) {
      // RLS silently filters deletes it doesn't allow -- say so instead of
      // pretending it worked.
      setError("Couldn't delete this workout (no permission). Only the person it belongs to can remove it.");
      return;
    }
    navigate("/workouts", { replace: true });
  }

  function startEditingSets() {
    const values: Record<string, EditRow> = {};
    for (const s of sets) {
      values[s.id] = {
        weight: String(s.weight),
        reps: String(s.reps),
        rest: s.rest_time_seconds != null ? String(s.rest_time_seconds) : "",
      };
    }
    setEditValues(values);
    setEditingSets(true);
  }

  function updateEditRow(setId: string, patch: Partial<EditRow>) {
    setEditValues((prev) => ({ ...prev, [setId]: { ...prev[setId], ...patch } }));
  }

  async function removeSetRow(setId: string) {
    const { error } = await supabase.from("sets").delete().eq("id", setId);
    if (error) {
      setError(error.message);
      return;
    }
    setSets((prev) => prev.filter((s) => s.id !== setId));
    setEditValues((prev) => {
      const next = { ...prev };
      delete next[setId];
      return next;
    });
  }

  async function saveSetEdits() {
    setSavingSets(true);
    setError(null);
    const results = await Promise.all(
      sets.map((s) => {
        const edited = editValues[s.id];
        return supabase
          .from("sets")
          .update({
            weight: Number(edited.weight) || 0,
            reps: Number(edited.reps) || 0,
            rest_time_seconds: edited.rest ? Number(edited.rest) : null,
          })
          .eq("id", s.id);
      })
    );
    const failed = results.find((r) => r.error);
    setSavingSets(false);
    if (failed?.error) {
      setError(failed.error.message);
      return;
    }
    setSets((prev) =>
      prev.map((s) => ({
        ...s,
        weight: Number(editValues[s.id].weight) || 0,
        reps: Number(editValues[s.id].reps) || 0,
        rest_time_seconds: editValues[s.id].rest ? Number(editValues[s.id].rest) : null,
      }))
    );
    setEditingSets(false);
  }

  async function handleSaveAsTemplate() {
    if (!user || !workout || !templateName.trim()) return;
    setSavingTemplate(true);
    setError(null);
    const { error: saveError } = await saveWorkoutAsTemplate({
      userId: user.id,
      name: templateName.trim(),
      workoutType: workout.workout_type,
      warmup: workout.warmup,
      notes: workout.notes,
      durationMinutes: workout.duration_minutes,
      sport: endurance?.sport ?? null,
      discipline: endurance?.discipline ?? null,
      distanceKm: endurance?.distance_km ?? null,
      sessionDetail: endurance?.session_detail ?? null,
      sets: sets.map((s) => ({
        exerciseId: s.exercise_id,
        weight: s.weight,
        reps: s.reps,
        restTimeSeconds: s.rest_time_seconds,
      })),
    });
    setSavingTemplate(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setTemplateName("");
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 3000);
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (!workout)
    return (
      <div className="empty-state">
        <span className="emoji">🤷</span>
        Workout not found. <Link to="/workouts">Back to your workouts</Link>
      </div>
    );

  const isOwner = workout.user_id === user?.id;
  const isEndurance = workout.workout_type === "endurance";
  const taggedByOther = isOwner && !!loggedByName;
  const title = isEndurance && endurance ? sportLabel(endurance.sport) : isEndurance ? "Endurance" : "Strength";

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">
            {formatDate(workout.date)}
            {!isOwner && ownerName ? ` · ${ownerName}` : ""}
          </p>
          <h1>{title}</h1>
        </div>
        <Link to={`/workouts/new?from=${workout.id}`} className="btn soft">
          <RepeatIcon width={16} height={16} /> Do it again
        </Link>
      </div>

      {taggedByOther && (
        <div className="banner info">
          <Avatar name={loggedByName!} size={34} />
          <div className="banner-body">
            <p className="banner-title">{loggedByName} added you to this session</p>
            <p className="small muted">Not your workout, or didn't go? Remove it from your log.</p>
          </div>
          <button
            type="button"
            className="sm danger"
            disabled={deleting}
            onClick={() => deleteWorkout(`Remove this session (logged by ${loggedByName}) from your log?`)}
          >
            <CloseIcon width={14} height={14} /> Remove
          </button>
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        {!isEndurance && (
          <div className="stat-card">
            <p className="stat-label">Volume</p>
            <div className="stat-value">
              {Math.round(totalVolume).toLocaleString()}
              <small>kg</small>
            </div>
          </div>
        )}
        {!isEndurance && (
          <div className="stat-card">
            <p className="stat-label">Sets</p>
            <div className="stat-value">
              {sets.length}
              <small>
                {grouped.length} ex.
              </small>
            </div>
          </div>
        )}
        {isEndurance && endurance?.distance_km != null && (
          <div className="stat-card">
            <p className="stat-label">Distance</p>
            <div className="stat-value">
              {endurance.distance_km}
              <small>km</small>
            </div>
          </div>
        )}
        {workout.duration_minutes != null && (
          <div className="stat-card">
            <p className="stat-label">Duration</p>
            <div className="stat-value">
              {workout.duration_minutes}
              <small>min</small>
            </div>
          </div>
        )}
      </div>

      {sessionPartners.length > 0 && (
        <div className="panel" style={{ marginBottom: 16, padding: 14 }}>
          <p className="eyebrow">Trained together with</p>
          <div className="row" style={{ gap: 8 }}>
            {sessionPartners.map((p) => (
              <Link key={p.workoutId} to={`/workouts/${p.workoutId}`} className="toggle-chip" style={{ textDecoration: "none" }}>
                <Avatar name={p.name} size={26} />
                {p.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {workout.song_title && (
        <div style={{ marginBottom: 16 }}>
          <SongCard song={{ title: workout.song_title, artist: workout.song_artist, url: workout.song_url }} />
        </div>
      )}

      {isEndurance ? (
        <div className="panel">
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            {endurance?.discipline && (
              <span className="chip primary">
                {CLIMBING_DISCIPLINE_LABELS[endurance.discipline as ClimbingDiscipline] ?? endurance.discipline}
              </span>
            )}
          </div>
          {endurance?.session_detail && (
            <>
              <p className="eyebrow">{endurance.sport === "climbing" ? "Boulders / routes done" : "Session detail"}</p>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{endurance.session_detail}</p>
            </>
          )}
          {!endurance?.session_detail && !endurance?.discipline && (
            <p className="muted" style={{ margin: 0 }}>
              No extra details logged for this session.
            </p>
          )}
        </div>
      ) : (
        <>
          {(workout.warmup || cardioBlocks.length > 0) && (
            <div className="panel" style={{ marginBottom: 12 }}>
              {workout.warmup && (
                <>
                  <p className="eyebrow">Warm-up</p>
                  <p style={{ whiteSpace: "pre-wrap" }}>{workout.warmup}</p>
                </>
              )}
              {cardioBlocks.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  {cardioBlocks.map((c) => (
                    <div key={c.id} className="row between">
                      <span>
                        {CARDIO_ACTIVITY_LABELS[c.activity as CardioActivity] ?? c.activity}{" "}
                        <span className="muted small">
                          · {CARDIO_PURPOSE_LABELS[c.purpose as CardioPurpose] ?? c.purpose}
                        </span>
                      </span>
                      <span className="muted small">{cardioBlockDetails(c)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="stack" style={{ gap: 12 }}>
            {grouped.map((g, gi) => {
              const groupVolume = g.sets.reduce(
                (sum, s) => sum + setVolume({ equipment: g.equipment, weight: s.weight, reps: s.reps, bodyWeightKg }),
                0
              );
              return (
                <div key={g.key} className="ex-block">
                  <div className="ex-block-head" style={{ paddingRight: 14 }}>
                    <span className="ex-num">{gi + 1}</span>
                    <h3 className="grow truncate" style={{ margin: 0, fontSize: 16 }}>
                      {g.name}
                    </h3>
                    <span className="muted small num">{Math.round(groupVolume).toLocaleString()} kg</span>
                  </div>
                  <div className="ex-hint">
                    {g.equipment.isDumbbell && <span>Per dumbbell · volume ×2</span>}
                    {g.equipment.barWeightKg != null && <span>Added to a {g.equipment.barWeightKg} kg bar</span>}
                  </div>
                  <div className="table-scroll" style={{ padding: "4px 8px 8px" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{weightHeader(g.equipment)}</th>
                          <th>Reps</th>
                          <th>Rest</th>
                          <th style={{ textAlign: "right" }}>Vol</th>
                          {editingSets && <th />}
                        </tr>
                      </thead>
                      <tbody>
                        {g.sets.map((s, i) => {
                          const edited = editValues[s.id];
                          const weight = editingSets && edited ? Number(edited.weight) || 0 : s.weight;
                          const reps = editingSets && edited ? Number(edited.reps) || 0 : s.reps;
                          return (
                            <tr key={s.id}>
                              <td className="muted">{i + 1}</td>
                              {editingSets && edited ? (
                                <>
                                  <td>
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      step="any"
                                      value={edited.weight}
                                      onChange={(e) => updateEditRow(s.id, { weight: e.target.value })}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      min={0}
                                      value={edited.reps}
                                      onChange={(e) => updateEditRow(s.id, { reps: e.target.value })}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      min={0}
                                      value={edited.rest}
                                      onChange={(e) => updateEditRow(s.id, { rest: e.target.value })}
                                    />
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td style={{ fontWeight: 600 }}>{s.weight}</td>
                                  <td style={{ fontWeight: 600 }}>{s.reps}</td>
                                  <td className="muted">{s.rest_time_seconds != null ? `${s.rest_time_seconds}s` : "—"}</td>
                                </>
                              )}
                              <td className="muted" style={{ textAlign: "right" }}>
                                {setVolume({ equipment: g.equipment, weight, reps, bodyWeightKg }).toFixed(0)}
                              </td>
                              {editingSets && (
                                <td>
                                  <button
                                    type="button"
                                    className="icon-btn sm danger-hover"
                                    onClick={() => removeSetRow(s.id)}
                                    aria-label="Delete set"
                                  >
                                    <CloseIcon width={16} height={16} />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>

          {isOwner && sets.length > 0 && (
            <div className="row" style={{ marginTop: 12 }}>
              {editingSets ? (
                <>
                  <button type="button" className="primary" onClick={saveSetEdits} disabled={savingSets}>
                    {savingSets ? "Saving…" : "Save values"}
                  </button>
                  <button type="button" className="ghost" onClick={() => setEditingSets(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="sm" onClick={startEditingSets}>
                  <EditIcon width={15} height={15} /> Quick-edit numbers
                </button>
              )}
            </div>
          )}
        </>
      )}

      {workout.notes && (
        <div className="panel" style={{ marginTop: 12 }}>
          <p className="eyebrow">{isEndurance ? "Comment" : "Notes"}</p>
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{workout.notes}</p>
        </div>
      )}

      {isOwner && (
        <div style={{ marginTop: 12 }}>
          <Disclosure summary={<>📋 Save as template</>}>
            <div className="row nowrap" style={{ gap: 8 }}>
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name"
                aria-label="Template name"
              />
              <button type="button" onClick={handleSaveAsTemplate} disabled={savingTemplate || !templateName.trim()}>
                {savingTemplate ? "Saving…" : templateSaved ? "Saved ✓" : "Save"}
              </button>
            </div>
          </Disclosure>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {isOwner && (
        <div className="row" style={{ marginTop: 20, gap: 8 }}>
          <Link to={`/workouts/${workout.id}/edit`} className="btn">
            <EditIcon width={16} height={16} /> Edit workout
          </Link>
          <button
            type="button"
            className="danger"
            onClick={() => deleteWorkout(taggedByOther ? "Remove this session from your log?" : "Delete this workout?")}
            disabled={deleting}
          >
            <TrashIcon width={16} height={16} /> {deleting ? "Deleting…" : taggedByOther ? "Remove from my log" : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}
