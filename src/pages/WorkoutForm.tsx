import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { setVolume, type Equipment } from "../lib/format";
import { SPORTS, SPORT_LABELS, CLIMBING_DISCIPLINES, CLIMBING_DISCIPLINE_LABELS } from "../constants/sports";
import {
  CARDIO_ACTIVITIES,
  CARDIO_ACTIVITY_LABELS,
  CARDIO_PURPOSES,
  CARDIO_PURPOSE_LABELS,
  type CardioActivity,
  type CardioPurpose,
} from "../constants/cardio";
import { saveWorkoutAsTemplate } from "../lib/templates";
import { loadDraft, saveDraft, clearDraft, draftHasContent } from "../lib/workoutDraft";
import SearchableSelect from "../components/SearchableSelect";
import type { WorkoutTemplate, WorkoutType } from "../types/database";

interface ExerciseOption {
  id: string;
  name: string;
  is_bodyweight: boolean;
  is_dumbbell: boolean;
  bar_weight_kg: number | null;
}

function equipmentOf(exercise: ExerciseOption | undefined): Equipment {
  return {
    isBodyweight: !!exercise?.is_bodyweight,
    isDumbbell: !!exercise?.is_dumbbell,
    barWeightKg: exercise?.bar_weight_kg ?? null,
  };
}

interface SetRow {
  weight: string;
  reps: string;
  restSeconds: string;
}

interface ExerciseBlock {
  key: string;
  exerciseId: string;
  sets: SetRow[];
}

interface CardioBlockDraft {
  key: string;
  activity: CardioActivity;
  purpose: CardioPurpose;
  durationMinutes: string;
  inclinePercent: string;
  speedKmh: string;
}

function emptySet(): SetRow {
  return { weight: "0", reps: "", restSeconds: "" };
}

function emptyCardioBlock(purpose: CardioPurpose = "warmup"): CardioBlockDraft {
  return { key: crypto.randomUUID(), activity: "run", purpose, durationMinutes: "", inclinePercent: "", speedKmh: "" };
}

function formatElapsed(startedAt: number): string {
  const totalSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Prefills a newly added block from the sets logged last time this user did
// this exercise, so re-adding "Bench Press" starts from what was actually
// lifted last time instead of blank fields.
async function fetchLastSets(userId: string, exerciseId: string): Promise<SetRow[]> {
  const { data } = await supabase
    .from("sets")
    .select("workout_id, weight, reps, rest_time_seconds, set_order, workout:workouts!inner(date, user_id)")
    .eq("exercise_id", exerciseId)
    .eq("workout.user_id", userId)
    .order("date", { foreignTable: "workout", ascending: false })
    .order("set_order", { ascending: true })
    .limit(30);

  if (!data || data.length === 0) return [emptySet()];
  const latestWorkoutId = (data[0] as any).workout_id;
  const rows = (data as any[]).filter((r) => r.workout_id === latestWorkoutId);
  return rows.map((r) => ({
    weight: String(r.weight),
    reps: String(r.reps),
    restSeconds: r.rest_time_seconds != null ? String(r.rest_time_seconds) : "",
  }));
}

const OTHER_SPORT = "other";

export default function WorkoutForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([]);
  const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null);

  const [workoutType, setWorkoutType] = useState<WorkoutType>("strength");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [warmup, setWarmup] = useState("");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("");
  const [blocks, setBlocks] = useState<ExerciseBlock[]>([]);
  // Cardio *within* a strength workout (warmup/cooldown on a
  // treadmill/bike/elliptical, or a standalone finisher) -- distinct from
  // picking "Endurance" as the whole workout's type.
  const [cardioBlocks, setCardioBlocks] = useState<CardioBlockDraft[]>([]);

  // Endurance-only fields
  const [sport, setSport] = useState<string>(SPORTS[0]);
  const [customSport, setCustomSport] = useState("");
  const [discipline, setDiscipline] = useState<string>("");
  const [distanceKm, setDistanceKm] = useState("");
  const [sessionDetail, setSessionDetail] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  // Rest timer: a literal stopwatch per exercise block, for use *during* the
  // workout -- start it after finishing a set, stop it right before the
  // next one. Stopping fills the just-finished set's rest field and adds
  // the next set row in one go, instead of typing a number in after the fact.
  const [restStart, setRestStart] = useState<Record<string, number>>({});
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (Object.keys(restStart).length === 0) return;
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [restStart]);

  // Templates: reusable session plans, private per user (see NOTICE-less
  // RLS on workout_templates/template_sets -- not even shared with
  // connections). Loaded once so the picker and "save as" can both use them.
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

  // Autosaved draft (localStorage, see src/lib/workoutDraft.ts) -- only for
  // a new, not-yet-submitted workout. Editing an existing one is already
  // backed by the database, so it doesn't touch this.
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);

  // Restore on mount, before the user's typed anything -- silently, not a
  // prompt, so reopening "Log a workout" after switching sections just
  // picks up where you left off. The banner + "Discard" button (rendered
  // near the top of the form) are the only visible sign it happened.
  useEffect(() => {
    if (isEdit) return;
    const draft = loadDraft();
    if (!draft || !draftHasContent(draft)) return;
    setWorkoutType(draft.workoutType);
    setDate(draft.date);
    setWarmup(draft.warmup);
    setNotes(draft.notes);
    setDuration(draft.duration);
    setBlocks(draft.blocks.map((b) => ({ key: crypto.randomUUID(), exerciseId: b.exerciseId, sets: b.sets })));
    setCardioBlocks(
      draft.cardioBlocks.map((c) => ({
        key: crypto.randomUUID(),
        activity: c.activity as CardioActivity,
        purpose: c.purpose as CardioPurpose,
        durationMinutes: c.durationMinutes,
        inclinePercent: c.inclinePercent,
        speedKmh: c.speedKmh,
      }))
    );
    setSport(draft.sport);
    setCustomSport(draft.customSport);
    setDiscipline(draft.discipline);
    setDistanceKm(draft.distanceKm);
    setSessionDetail(draft.sessionDetail);
    setDraftRestoredAt(draft.savedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave on every change. Clears instead of writing once the form is
  // back to nothing worth keeping (e.g. after discarding), so an abandoned
  // blank form doesn't leave a phantom "in progress" banner around.
  useEffect(() => {
    if (isEdit) return;
    const draft = {
      workoutType,
      date,
      warmup,
      notes,
      duration,
      blocks: blocks.map((b) => ({ exerciseId: b.exerciseId, sets: b.sets })),
      cardioBlocks: cardioBlocks.map((c) => ({
        activity: c.activity,
        purpose: c.purpose,
        durationMinutes: c.durationMinutes,
        inclinePercent: c.inclinePercent,
        speedKmh: c.speedKmh,
      })),
      sport,
      customSport,
      discipline,
      distanceKm,
      sessionDetail,
    };
    if (draftHasContent(draft)) saveDraft(draft);
    else clearDraft();
  }, [
    isEdit,
    workoutType,
    date,
    warmup,
    notes,
    duration,
    blocks,
    cardioBlocks,
    sport,
    customSport,
    discipline,
    distanceKm,
    sessionDetail,
  ]);

  function discardDraft() {
    clearDraft();
    setDraftRestoredAt(null);
    setWorkoutType("strength");
    setDate(new Date().toISOString().slice(0, 10));
    setWarmup("");
    setNotes("");
    setDuration("");
    setBlocks([]);
    setCardioBlocks([]);
    setSport(SPORTS[0]);
    setCustomSport("");
    setDiscipline("");
    setDistanceKm("");
    setSessionDetail("");
  }

  async function loadTemplateList(userId: string) {
    const { data } = await supabase
      .from("workout_templates")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setTemplates(data ?? []);
  }

  useEffect(() => {
    if (!user) return;
    supabase
      .from("exercises")
      .select("id, name, is_bodyweight, is_dumbbell, bar_weight_kg")
      .order("name")
      .then(({ data }) => setExerciseOptions(data ?? []));
    supabase
      .from("body_weight_logs")
      .select("weight_kg")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setBodyWeightKg(data?.weight_kg ?? null));
    loadTemplateList(user.id);
  }, [user]);

  // Load the existing workout (+ sets, or endurance details) when editing.
  // Sets are reconstructed into "blocks" by grouping consecutive
  // same-exercise sets in set_order (that's how they were laid out on save).
  useEffect(() => {
    if (!id) return;
    async function load() {
      const { data: w } = await supabase.from("workouts").select("*").eq("id", id!).single();
      if (!w) {
        setLoading(false);
        return;
      }
      setDate(w.date);
      setWarmup(w.warmup ?? "");
      setNotes(w.notes ?? "");
      setDuration(w.duration_minutes != null ? String(w.duration_minutes) : "");
      setWorkoutType(w.workout_type);

      if (w.workout_type === "endurance") {
        const { data: details } = await supabase
          .from("endurance_details")
          .select("*")
          .eq("workout_id", id!)
          .single();
        if (details) {
          if ((SPORTS as readonly string[]).includes(details.sport)) {
            setSport(details.sport);
          } else {
            setSport(OTHER_SPORT);
            setCustomSport(details.sport);
          }
          setDiscipline(details.discipline ?? "");
          setDistanceKm(details.distance_km != null ? String(details.distance_km) : "");
          setSessionDetail(details.session_detail ?? "");
        }
      } else {
        const [{ data: s }, { data: cardio }] = await Promise.all([
          supabase.from("sets").select("*").eq("workout_id", id!).order("set_order"),
          supabase.from("cardio_blocks").select("*").eq("workout_id", id!).order("block_order"),
        ]);
        const loadedBlocks: ExerciseBlock[] = [];
        for (const row of s ?? []) {
          const last = loadedBlocks[loadedBlocks.length - 1];
          const set: SetRow = {
            weight: String(row.weight),
            reps: String(row.reps),
            restSeconds: row.rest_time_seconds != null ? String(row.rest_time_seconds) : "",
          };
          if (last && last.exerciseId === row.exercise_id) {
            last.sets.push(set);
          } else {
            loadedBlocks.push({ key: crypto.randomUUID(), exerciseId: row.exercise_id, sets: [set] });
          }
        }
        setBlocks(loadedBlocks);
        setCardioBlocks(
          (cardio ?? []).map((c) => ({
            key: c.id,
            activity: c.activity as CardioActivity,
            purpose: c.purpose as CardioPurpose,
            durationMinutes: c.duration_minutes != null ? String(c.duration_minutes) : "",
            inclinePercent: c.incline_percent != null ? String(c.incline_percent) : "",
            speedKmh: c.speed_kmh != null ? String(c.speed_kmh) : "",
          }))
        );
      }
      setLoading(false);
    }
    load();
  }, [id]);

  // Loads a saved template into the current (unsaved) form -- everything
  // except `date`, which stays at whatever the user already picked (usually
  // today).
  async function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    setLoadingTemplate(true);
    setWorkoutType(template.workout_type);
    setWarmup(template.warmup ?? "");
    setNotes(template.notes ?? "");
    setDuration(template.duration_minutes != null ? String(template.duration_minutes) : "");

    if (template.workout_type === "endurance") {
      const sportValue = template.sport ?? "";
      if ((SPORTS as readonly string[]).includes(sportValue)) {
        setSport(sportValue);
      } else {
        setSport(OTHER_SPORT);
        setCustomSport(sportValue);
      }
      setDiscipline(template.discipline ?? "");
      setDistanceKm(template.distance_km != null ? String(template.distance_km) : "");
      setSessionDetail(template.session_detail ?? "");
      setBlocks([]);
    } else {
      const { data: s } = await supabase
        .from("template_sets")
        .select("*")
        .eq("template_id", templateId)
        .order("set_order");
      const loadedBlocks: ExerciseBlock[] = [];
      for (const row of s ?? []) {
        const last = loadedBlocks[loadedBlocks.length - 1];
        const set: SetRow = {
          weight: String(row.weight),
          reps: String(row.reps),
          restSeconds: row.rest_time_seconds != null ? String(row.rest_time_seconds) : "",
        };
        if (last && last.exerciseId === row.exercise_id) {
          last.sets.push(set);
        } else {
          loadedBlocks.push({ key: crypto.randomUUID(), exerciseId: row.exercise_id, sets: [set] });
        }
      }
      setBlocks(loadedBlocks);
    }
    setLoadingTemplate(false);
  }

  async function deleteTemplate(templateId: string) {
    if (!confirm("Delete this template?")) return;
    const { error } = await supabase.from("workout_templates").delete().eq("id", templateId);
    if (error) {
      setError(error.message);
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    if (selectedTemplateId === templateId) setSelectedTemplateId("");
  }

  async function saveAsTemplate() {
    if (!user || !templateName.trim()) return;
    setSavingTemplate(true);
    setError(null);

    const resolvedSport = sport === OTHER_SPORT ? customSport.trim() : sport;
    const { error: saveError } = await saveWorkoutAsTemplate({
      userId: user.id,
      name: templateName.trim(),
      workoutType,
      warmup: warmup.trim() || null,
      notes: notes.trim() || null,
      durationMinutes: duration ? Number(duration) : null,
      sport: resolvedSport,
      discipline: sport === "climbing" && discipline ? discipline : null,
      distanceKm: distanceKm ? Number(distanceKm) : null,
      sessionDetail: sessionDetail.trim() || null,
      sets: blocks.flatMap((block) =>
        block.sets.map((s) => ({
          exerciseId: block.exerciseId,
          weight: Number(s.weight) || 0,
          reps: Number(s.reps) || 0,
          restTimeSeconds: s.restSeconds ? Number(s.restSeconds) : null,
        }))
      ),
    });

    setSavingTemplate(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setShowSaveTemplate(false);
    setTemplateName("");
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 3000);
    await loadTemplateList(user.id);
  }

  async function addBlock() {
    if (exerciseOptions.length === 0 || !user) return;
    const exerciseId = exerciseOptions[0].id;
    const key = crypto.randomUUID();
    setBlocks((prev) => [...prev, { key, exerciseId, sets: [emptySet()] }]);
    const sets = await fetchLastSets(user.id, exerciseId);
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, sets } : b)));
  }

  async function updateBlock(key: string, exerciseId: string) {
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, exerciseId } : b)));
    if (!user) return;
    const sets = await fetchLastSets(user.id, exerciseId);
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, sets } : b)));
  }

  function removeBlock(key: string) {
    setBlocks((prev) => prev.filter((b) => b.key !== key));
    cancelRest(key);
  }

  function addCardioBlock(purpose?: CardioPurpose) {
    setCardioBlocks((prev) => [...prev, emptyCardioBlock(purpose)]);
  }

  function updateCardioBlock(key: string, patch: Partial<CardioBlockDraft>) {
    setCardioBlocks((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function removeCardioBlock(key: string) {
    setCardioBlocks((prev) => prev.filter((c) => c.key !== key));
  }

  function addSet(key: string) {
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, sets: [...b.sets, emptySet()] } : b)));
  }

  function startRest(key: string) {
    setRestStart((prev) => ({ ...prev, [key]: Date.now() }));
  }

  function cancelRest(key: string) {
    setRestStart((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  /** Stops the timer, writes the elapsed seconds onto the set that was just
   * finished (the last one), and adds a fresh set row for the next one. */
  function stopRestAndAddSet(key: string) {
    const startedAt = restStart[key];
    if (startedAt) {
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.key !== key || b.sets.length === 0) return b;
          const sets = [...b.sets];
          sets[sets.length - 1] = { ...sets[sets.length - 1], restSeconds: String(elapsedSec) };
          return { ...b, sets };
        })
      );
    }
    cancelRest(key);
    addSet(key);
  }

  function updateSet(key: string, index: number, patch: Partial<SetRow>) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.key === key ? { ...b, sets: b.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : b
      )
    );
  }

  function removeSet(key: string, index: number) {
    setBlocks((prev) =>
      prev.map((b) => (b.key === key ? { ...b, sets: b.sets.filter((_, i) => i !== index) } : b))
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    const resolvedSport = sport === OTHER_SPORT ? customSport.trim() : sport;
    if (workoutType === "endurance" && !resolvedSport) {
      setError("Pick a sport (or type one in).");
      return;
    }
    if (workoutType === "strength" && (blocks.length === 0 || blocks.every((b) => b.sets.length === 0))) {
      setError("Add at least one exercise with a set.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const workoutPayload = {
      date,
      warmup: warmup.trim() || null,
      notes: notes.trim() || null,
      duration_minutes: duration ? Number(duration) : null,
      workout_type: workoutType,
    };

    let workoutId = id;
    if (isEdit) {
      const { error: updateError } = await supabase.from("workouts").update(workoutPayload).eq("id", id!);
      if (updateError) {
        setError(updateError.message);
        setSubmitting(false);
        return;
      }
    } else {
      const { data: workout, error: workoutError } = await supabase
        .from("workouts")
        .insert({ ...workoutPayload, user_id: user.id })
        .select()
        .single();
      if (workoutError || !workout) {
        setError(workoutError?.message ?? "Failed to create workout.");
        setSubmitting(false);
        return;
      }
      workoutId = workout.id;
    }

    if (workoutType === "endurance") {
      const { error: detailsError } = await supabase.from("endurance_details").upsert({
        workout_id: workoutId!,
        sport: resolvedSport,
        discipline: sport === "climbing" && discipline ? discipline : null,
        distance_km: distanceKm ? Number(distanceKm) : null,
        session_detail: sessionDetail.trim() || null,
      });
      setSubmitting(false);
      if (detailsError) {
        setError(detailsError.message);
        return;
      }
    } else {
      if (isEdit) {
        // Simplest consistent way to persist edited sets/cardio: replace
        // them all rather than diffing add/remove/reorder client-side.
        const [{ error: deleteError }, { error: deleteCardioError }] = await Promise.all([
          supabase.from("sets").delete().eq("workout_id", id!),
          supabase.from("cardio_blocks").delete().eq("workout_id", id!),
        ]);
        if (deleteError || deleteCardioError) {
          setError((deleteError ?? deleteCardioError)!.message);
          setSubmitting(false);
          return;
        }
      }
      const setRows = blocks.flatMap((block, blockIndex) =>
        block.sets.map((s, setIndex) => ({
          workout_id: workoutId!,
          exercise_id: block.exerciseId,
          weight: Number(s.weight) || 0,
          reps: Number(s.reps) || 0,
          rest_time_seconds: s.restSeconds ? Number(s.restSeconds) : null,
          set_order: blockIndex * 1000 + setIndex,
        }))
      );
      const cardioRows = cardioBlocks.map((c, i) => ({
        workout_id: workoutId!,
        activity: c.activity,
        purpose: c.purpose,
        duration_minutes: c.durationMinutes ? Number(c.durationMinutes) : null,
        incline_percent: c.inclinePercent ? Number(c.inclinePercent) : null,
        speed_kmh: c.speedKmh ? Number(c.speedKmh) : null,
        block_order: i,
      }));
      const [{ error: setsError }, { error: cardioError }] = await Promise.all([
        setRows.length > 0 ? supabase.from("sets").insert(setRows) : Promise.resolve({ error: null }),
        cardioRows.length > 0 ? supabase.from("cardio_blocks").insert(cardioRows) : Promise.resolve({ error: null }),
      ]);
      setSubmitting(false);
      if (setsError || cardioError) {
        setError((setsError ?? cardioError)!.message);
        return;
      }
    }

    if (!isEdit) clearDraft();
    navigate(`/workouts/${workoutId}`);
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1>{isEdit ? "Edit workout" : "Log a workout"}</h1>
      {draftRestoredAt && (
        <div className="panel" style={{ marginBottom: 16, borderColor: "var(--focus)" }}>
          <div className="row between">
            <span className="chip focus">📝 Workout in progress — continuing where you left off</span>
            <button type="button" className="ghost" onClick={discardDraft}>
              Discard draft
            </button>
          </div>
        </div>
      )}
      <form className="form-grid panel" onSubmit={handleSubmit}>
        {!isEdit && templates.length > 0 && (
          <div className="field">
            <label htmlFor="template">Start from a template</label>
            <div className="row">
              <select
                id="template"
                value={selectedTemplateId}
                onChange={(e) => applyTemplate(e.target.value)}
                disabled={loadingTemplate}
              >
                <option value="">— none —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {selectedTemplateId && (
                <button type="button" className="ghost" onClick={() => deleteTemplate(selectedTemplateId)}>
                  Delete template
                </button>
              )}
            </div>
          </div>
        )}

        {isEdit ? (
          <span className="chip focus" style={{ width: "fit-content" }}>
            {workoutType === "endurance" ? "Endurance" : "Strength"}
          </span>
        ) : (
          <div className="field">
            <label>Type</label>
            <div className="row">
              <button
                type="button"
                className={workoutType === "strength" ? "primary" : ""}
                onClick={() => setWorkoutType("strength")}
              >
                Strength
              </button>
              <button
                type="button"
                className={workoutType === "endurance" ? "primary" : ""}
                onClick={() => setWorkoutType("endurance")}
              >
                Endurance
              </button>
            </div>
          </div>
        )}

        <div className="row">
          <div className="field" style={{ minWidth: 160 }}>
            <label htmlFor="date">Date</label>
            <input id="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label htmlFor="duration">Duration (min)</label>
            <input
              id="duration"
              type="number"
              inputMode="numeric"
              min={0}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
        </div>

        {workoutType === "strength" ? (
          <>
            <div className="field">
              <label htmlFor="warmup">Warmup</label>
              <textarea id="warmup" rows={2} value={warmup} onChange={(e) => setWarmup(e.target.value)} />
            </div>

            <div>
              <h3>Cardio</h3>
              <p className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 12 }}>
                Warmup, cooldown, or a standalone finisher — separate from picking "Endurance" as the whole
                workout's type.
              </p>
              <div className="stack" style={{ gap: 12 }}>
                {cardioBlocks.map((c) => (
                  <div key={c.key} className="panel">
                    <div className="row between">
                      <div className="row">
                        <select
                          value={c.activity}
                          onChange={(e) => updateCardioBlock(c.key, { activity: e.target.value as CardioActivity })}
                          style={{ width: "auto" }}
                        >
                          {CARDIO_ACTIVITIES.map((a) => (
                            <option key={a} value={a}>
                              {CARDIO_ACTIVITY_LABELS[a]}
                            </option>
                          ))}
                        </select>
                        <select
                          value={c.purpose}
                          onChange={(e) => updateCardioBlock(c.key, { purpose: e.target.value as CardioPurpose })}
                          style={{ width: "auto" }}
                        >
                          {CARDIO_PURPOSES.map((p) => (
                            <option key={p} value={p}>
                              {CARDIO_PURPOSE_LABELS[p]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button type="button" className="ghost" onClick={() => removeCardioBlock(c.key)}>
                        Remove
                      </button>
                    </div>
                    <div className="row" style={{ marginTop: 10 }}>
                      <div className="field" style={{ minWidth: 110 }}>
                        <label htmlFor={`cardio-duration-${c.key}`}>Duration (min)</label>
                        <input
                          id={`cardio-duration-${c.key}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={c.durationMinutes}
                          onChange={(e) => updateCardioBlock(c.key, { durationMinutes: e.target.value })}
                        />
                      </div>
                      <div className="field" style={{ minWidth: 110 }}>
                        <label htmlFor={`cardio-incline-${c.key}`}>Incline (%)</label>
                        <input
                          id={`cardio-incline-${c.key}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.5"
                          value={c.inclinePercent}
                          onChange={(e) => updateCardioBlock(c.key, { inclinePercent: e.target.value })}
                        />
                      </div>
                      <div className="field" style={{ minWidth: 110 }}>
                        <label htmlFor={`cardio-speed-${c.key}`}>Speed (km/h)</label>
                        <input
                          id={`cardio-speed-${c.key}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.1"
                          value={c.speedKmh}
                          onChange={(e) => updateCardioBlock(c.key, { speedKmh: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <button type="button" onClick={() => addCardioBlock("warmup")}>
                  + Add warmup
                </button>
                <button type="button" onClick={() => addCardioBlock("cooldown")}>
                  + Add cooldown
                </button>
              </div>
            </div>

            <div>
              <h3>Exercises</h3>
              {exerciseOptions.length === 0 && (
                <p className="muted">No exercises in the library yet — add one first.</p>
              )}

              <div className="stack" style={{ gap: 16 }}>
                {blocks.map((block) => {
                  const exercise = exerciseOptions.find((e) => e.id === block.exerciseId);
                  const equipment = equipmentOf(exercise);
                  const showVolumeCol = equipment.isBodyweight || equipment.isDumbbell || equipment.barWeightKg != null;
                  const weightHeader = equipment.isBodyweight
                    ? "Added weight"
                    : equipment.isDumbbell
                      ? "Weight (per dumbbell)"
                      : equipment.barWeightKg != null
                        ? "Weight (added to bar)"
                        : "Weight";
                  return (
                    <div key={block.key} className="panel">
                      <div className="row between">
                        <SearchableSelect
                          options={exerciseOptions.map((e) => ({ id: e.id, label: e.name }))}
                          value={block.exerciseId}
                          onChange={(exerciseId) => updateBlock(block.key, exerciseId)}
                          placeholder="Search exercises…"
                        />
                        <button type="button" className="ghost" onClick={() => removeBlock(block.key)}>
                          Remove
                        </button>
                      </div>
                      {equipment.isDumbbell && (
                        <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
                          🏋️ Dumbbell — volume counts both (×2).
                        </p>
                      )}
                      {equipment.barWeightKg != null && (
                        <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
                          🏋️ Barbell — +{equipment.barWeightKg} kg bar added on top.
                        </p>
                      )}

                      <div className="table-scroll" style={{ marginTop: 10 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>{weightHeader}</th>
                            <th>Reps</th>
                            <th>Rest (s)</th>
                            {showVolumeCol && <th>Volume</th>}
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {block.sets.map((s, i) => {
                            const volume = setVolume({
                              equipment,
                              weight: Number(s.weight) || 0,
                              reps: Number(s.reps) || 0,
                              bodyWeightKg,
                            });
                            return (
                              <tr key={i}>
                                <td>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={s.weight}
                                    onChange={(e) => updateSet(block.key, i, { weight: e.target.value })}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    value={s.reps}
                                    onChange={(e) => updateSet(block.key, i, { reps: e.target.value })}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    value={s.restSeconds}
                                    onChange={(e) => updateSet(block.key, i, { restSeconds: e.target.value })}
                                  />
                                </td>
                                {showVolumeCol && (
                                  <td className="muted">{volume ? volume.toFixed(0) : "—"}</td>
                                )}
                                <td>
                                  <button type="button" className="ghost" onClick={() => removeSet(block.key, i)}>
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      </div>
                      <div className="row" style={{ marginTop: 6, gap: 8 }}>
                        <button type="button" className="ghost" onClick={() => addSet(block.key)}>
                          + Add set
                        </button>
                        {restStart[block.key] ? (
                          <>
                            <span className="chip focus">⏱ {formatElapsed(restStart[block.key])}</span>
                            <button type="button" className="primary" onClick={() => stopRestAndAddSet(block.key)}>
                              Stop &amp; next set
                            </button>
                            <button type="button" className="ghost" onClick={() => cancelRest(block.key)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" className="ghost" onClick={() => startRest(block.key)}>
                            ⏱ Start rest timer
                          </button>
                        )}
                      </div>
                      {exercise?.is_bodyweight && bodyWeightKg == null && (
                        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                          Log your body weight in Profile to compute volume for bodyweight sets.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addBlock}
                disabled={exerciseOptions.length === 0}
                style={{ marginTop: 12 }}
              >
                + Add exercise
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="row">
              <div className="field" style={{ minWidth: 160 }}>
                <label htmlFor="sport">Sport</label>
                <select id="sport" value={sport} onChange={(e) => setSport(e.target.value)}>
                  {SPORTS.map((s) => (
                    <option key={s} value={s}>
                      {SPORT_LABELS[s]}
                    </option>
                  ))}
                  <option value={OTHER_SPORT}>Other…</option>
                </select>
              </div>
              {sport === OTHER_SPORT && (
                <div className="field" style={{ minWidth: 160 }}>
                  <label htmlFor="customSport">Sport name</label>
                  <input
                    id="customSport"
                    required
                    value={customSport}
                    onChange={(e) => setCustomSport(e.target.value)}
                    placeholder="e.g. yoga"
                  />
                </div>
              )}
              {sport === "climbing" && (
                <div className="field" style={{ minWidth: 160 }}>
                  <label htmlFor="discipline">Discipline</label>
                  <select id="discipline" value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
                    <option value="">—</option>
                    {CLIMBING_DISCIPLINES.map((d) => (
                      <option key={d} value={d}>
                        {CLIMBING_DISCIPLINE_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field" style={{ minWidth: 140 }}>
                <label htmlFor="distance">Distance (km)</label>
                <input
                  id="distance"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.1"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="sessionDetail">
                {sport === "climbing" ? "Boulders / routes done" : "Session detail"}
              </label>
              <textarea
                id="sessionDetail"
                rows={3}
                value={sessionDetail}
                onChange={(e) => setSessionDetail(e.target.value)}
                placeholder={sport === "climbing" ? "e.g. 3x V3, 1x V5, onsight" : "Splits, effort, route, etc."}
              />
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="notes">{workoutType === "endurance" ? "General comment" : "Notes"}</label>
          <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="field">
          <label>Template</label>
          {showSaveTemplate ? (
            <div className="row">
              <input
                autoFocus
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name"
                style={{ maxWidth: 240 }}
              />
              <button type="button" onClick={saveAsTemplate} disabled={savingTemplate || !templateName.trim()}>
                {savingTemplate ? "Saving…" : "Save"}
              </button>
              <button type="button" className="ghost" onClick={() => setShowSaveTemplate(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="row">
              <button type="button" className="ghost" onClick={() => setShowSaveTemplate(true)}>
                Save as template
              </button>
              {templateSaved && <span className="muted">Saved.</span>}
            </div>
          )}
        </div>

        {error && <p className="error-text">{error}</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Save workout"}
          </button>
        </div>
      </form>
    </div>
  );
}
