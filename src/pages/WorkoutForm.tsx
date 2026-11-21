import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { setVolume, todayLocalIso, formatShortDate, type Equipment } from "../lib/format";
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
import { fetchLastSession, fetchLastWeightsByExercise, fetchRecentExerciseIds } from "../lib/lastSets";
import { parseSongUrl, safeUrl } from "../lib/songs";
import ExercisePicker from "../components/ExercisePicker";
import Avatar from "../components/Avatar";
import Disclosure from "../components/Disclosure";
import { useConnections } from "../hooks/useConnections";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CloseIcon,
  MusicIcon,
  PlusIcon,
  TimerIcon,
  TrashIcon,
  ChevronDownIcon,
} from "../components/icons";
import type { WorkoutTemplate, WorkoutType } from "../types/database";

interface ExerciseOption {
  id: string;
  name: string;
  is_bodyweight: boolean;
  bodyweight_percent: number;
  is_dumbbell: boolean;
  bar_weight_kg: number | null;
}

function equipmentOf(exercise: ExerciseOption | undefined): Equipment {
  return {
    isBodyweight: !!exercise?.is_bodyweight,
    bodyweightPercent: exercise?.bodyweight_percent ?? 100,
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
  /** Date of the session the default sets were copied from, for the
   * "Last time" hint. Not persisted in the draft. */
  lastDate?: string | null;
  /** True while the last session's sets are being fetched. */
  loadingLast?: boolean;
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
  return { weight: "", reps: "", restSeconds: "" };
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

/** Rows in set_order -> blocks, grouping consecutive same-exercise sets
 * (that's how they're laid out on save). */
function rowsToBlocks(
  rows: { exercise_id: string; weight: number; reps: number; rest_time_seconds: number | null }[]
): ExerciseBlock[] {
  const blocks: ExerciseBlock[] = [];
  for (const row of rows) {
    const last = blocks[blocks.length - 1];
    const set: SetRow = {
      weight: String(row.weight),
      reps: String(row.reps),
      restSeconds: row.rest_time_seconds != null ? String(row.rest_time_seconds) : "",
    };
    if (last && last.exerciseId === row.exercise_id) last.sets.push(set);
    else blocks.push({ key: crypto.randomUUID(), exerciseId: row.exercise_id, sets: [set] });
  }
  return blocks;
}

function weightLabel(equipment: Equipment): string {
  if (equipment.isBodyweight) return "+kg";
  if (equipment.isDumbbell) return "kg ea.";
  if (equipment.barWeightKg != null) return "+kg";
  return "kg";
}

const OTHER_SPORT = "other";

export default function WorkoutForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [searchParams] = useSearchParams();
  // "Do it again" from a past workout (yours or a friend's): /workouts/new?from=<id>
  const repeatFromId = !isEdit ? searchParams.get("from") : null;
  const { user } = useAuth();
  const navigate = useNavigate();

  // Training partners: accepted connections you can tag as "training with"
  // on a new workout, so logging your session also logs a copy for them,
  // using their own last weight per exercise.
  const { rows: connectionRows } = useConnections();
  const acceptedConnections = connectionRows.filter((r) => r.status === "accepted").map((r) => r.profile);
  const [partnerIds, setPartnerIds] = useState<string[]>([]);

  function togglePartner(partnerId: string) {
    setPartnerIds((prev) => (prev.includes(partnerId) ? prev.filter((p) => p !== partnerId) : [...prev, partnerId]));
  }

  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([]);
  const [recentExerciseIds, setRecentExerciseIds] = useState<string[]>([]);
  const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null);

  const [workoutType, setWorkoutType] = useState<WorkoutType>("strength");
  const [date, setDate] = useState(todayLocalIso);
  const [warmup, setWarmup] = useState("");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("");
  const [blocks, setBlocks] = useState<ExerciseBlock[]>([]);
  const [cardioBlocks, setCardioBlocks] = useState<CardioBlockDraft[]>([]);

  // Best song of the session -- feeds the group playlist.
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [songUrl, setSongUrl] = useState("");
  // When editing a workout that already had a song, clearing the fields
  // must write nulls; otherwise song columns are left out of the payload
  // entirely (so logging still works before migration 011 is applied).
  const [hadSong, setHadSong] = useState(false);

  // Endurance-only fields
  const [sport, setSport] = useState<string>(SPORTS[0]);
  const [customSport, setCustomSport] = useState("");
  const [discipline, setDiscipline] = useState<string>("");
  const [distanceKm, setDistanceKm] = useState("");
  const [sessionDetail, setSessionDetail] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEdit || !!repeatFromId);

  // Exercise picker: adding a new block (key null) or swapping a block's exercise.
  const [picker, setPicker] = useState<{ open: boolean; replaceKey: string | null }>({ open: false, replaceKey: null });
  const closePicker = useCallback(() => setPicker({ open: false, replaceKey: null }), []);

  // Rest timer per block: start after a set, stop right before the next one.
  const [restStart, setRestStart] = useState<Record<string, number>>({});
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (Object.keys(restStart).length === 0) return;
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [restStart]);

  // Templates (private per user).
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

  // Autosaved draft (localStorage) -- only for a new workout.
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit || repeatFromId) return;
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
    setSongTitle(draft.songTitle ?? "");
    setSongArtist(draft.songArtist ?? "");
    setSongUrl(draft.songUrl ?? "");
    setDraftRestoredAt(draft.savedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isEdit || loading) return;
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
      songTitle,
      songArtist,
      songUrl,
    };
    if (draftHasContent(draft)) saveDraft(draft);
    else clearDraft();
  }, [
    isEdit,
    loading,
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
    songTitle,
    songArtist,
    songUrl,
  ]);

  function resetForm() {
    clearDraft();
    setDraftRestoredAt(null);
    setWorkoutType("strength");
    setDate(todayLocalIso());
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
    setSongTitle("");
    setSongArtist("");
    setSongUrl("");
    setRestStart({});
    setSelectedTemplateId("");
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
      .select("id, name, is_bodyweight, bodyweight_percent, is_dumbbell, bar_weight_kg")
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
    fetchRecentExerciseIds(user.id).then(setRecentExerciseIds);
    loadTemplateList(user.id);
  }, [user]);

  // Load an existing workout: for editing (id) or as the starting point of a
  // new one ("Do it again", ?from=<id>).
  useEffect(() => {
    const sourceId = id ?? repeatFromId;
    if (!sourceId || !user) return;
    let cancelled = false;
    async function load() {
      const { data: w } = await supabase.from("workouts").select("*").eq("id", sourceId!).maybeSingle();
      if (cancelled) return;
      if (!w) {
        setLoading(false);
        if (repeatFromId) setError("Couldn't find the workout to repeat.");
        return;
      }
      if (isEdit) {
        setDate(w.date);
        setNotes(w.notes ?? "");
        setDuration(w.duration_minutes != null ? String(w.duration_minutes) : "");
        setSongTitle(w.song_title ?? "");
        setSongArtist(w.song_artist ?? "");
        setSongUrl(w.song_url ?? "");
        setHadSong(!!(w.song_title || w.song_artist || w.song_url));
      }
      setWarmup(w.warmup ?? "");
      setWorkoutType(w.workout_type);

      if (w.workout_type === "endurance") {
        const { data: details } = await supabase.from("endurance_details").select("*").eq("workout_id", sourceId!).maybeSingle();
        if (details) {
          if ((SPORTS as readonly string[]).includes(details.sport)) setSport(details.sport);
          else {
            setSport(OTHER_SPORT);
            setCustomSport(details.sport);
          }
          setDiscipline(details.discipline ?? "");
          setDistanceKm(details.distance_km != null ? String(details.distance_km) : "");
          if (isEdit) setSessionDetail(details.session_detail ?? "");
        }
      } else {
        const [{ data: s }, { data: cardio }] = await Promise.all([
          supabase.from("sets").select("*").eq("workout_id", sourceId!).order("set_order"),
          supabase.from("cardio_blocks").select("*").eq("workout_id", sourceId!).order("block_order"),
        ]);
        let loaded = rowsToBlocks(s ?? []);
        // Repeating a friend's session: same exercises/reps, but your own
        // weights from your last time on each exercise (theirs where you
        // have none yet).
        if (repeatFromId && w.user_id !== user!.id) {
          const mine = await fetchLastWeightsByExercise(user!.id, [...new Set(loaded.map((b) => b.exerciseId))]);
          loaded = loaded.map((b) => ({
            ...b,
            sets: b.sets.map((set, i) => {
              const known = mine[b.exerciseId];
              const weight = known?.[i] ?? known?.[known.length - 1];
              return weight != null ? { ...set, weight: String(weight) } : set;
            }),
          }));
        }
        if (repeatFromId) loaded = loaded.map((b) => ({ ...b, sets: b.sets.map((set) => ({ ...set, restSeconds: "" })) }));
        if (cancelled) return;
        setBlocks(loaded);
        setCardioBlocks(
          (cardio ?? []).map((c) => ({
            key: crypto.randomUUID(),
            activity: c.activity as CardioActivity,
            purpose: c.purpose as CardioPurpose,
            durationMinutes: c.duration_minutes != null ? String(c.duration_minutes) : "",
            inclinePercent: c.incline_percent != null ? String(c.incline_percent) : "",
            speedKmh: c.speed_kmh != null ? String(c.speed_kmh) : "",
          }))
        );
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, repeatFromId, user]);

  async function applyTemplate(templateId: string) {
    if (templateId === selectedTemplateId) return;
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setSelectedTemplateId(templateId);
    setLoadingTemplate(true);
    setWorkoutType(template.workout_type);
    setWarmup(template.warmup ?? "");
    setNotes(template.notes ?? "");
    setDuration(template.duration_minutes != null ? String(template.duration_minutes) : "");

    if (template.workout_type === "endurance") {
      const sportValue = template.sport ?? "";
      if ((SPORTS as readonly string[]).includes(sportValue)) setSport(sportValue);
      else {
        setSport(OTHER_SPORT);
        setCustomSport(sportValue);
      }
      setDiscipline(template.discipline ?? "");
      setDistanceKm(template.distance_km != null ? String(template.distance_km) : "");
      setSessionDetail(template.session_detail ?? "");
      setBlocks([]);
    } else {
      const { data: s } = await supabase.from("template_sets").select("*").eq("template_id", templateId).order("set_order");
      setBlocks(rowsToBlocks(s ?? []));
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
    setTemplateName("");
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 3000);
    await loadTemplateList(user.id);
  }

  /** Default sets for a block = exactly what was done the last time on that
   * exercise (not the personal best). Only applied if the block still holds
   * the same exercise when the answer arrives -- picking quickly no longer
   * lets an older request overwrite a newer one. */
  async function prefillFromLastSession(key: string, exerciseId: string) {
    if (!user) return;
    const last = await fetchLastSession(user.id, exerciseId, id);
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.key !== key || b.exerciseId !== exerciseId) return b;
        if (!last || last.sets.length === 0) return { ...b, loadingLast: false, lastDate: null };
        return {
          ...b,
          loadingLast: false,
          lastDate: last.date,
          sets: last.sets.map((s) => ({ weight: String(s.weight), reps: String(s.reps), restSeconds: "" })),
        };
      })
    );
  }

  function handlePick(exerciseId: string) {
    const replaceKey = picker.replaceKey;
    closePicker();
    if (replaceKey) {
      const current = blocks.find((b) => b.key === replaceKey);
      if (!current || current.exerciseId === exerciseId) return;
      setBlocks((prev) =>
        prev.map((b) => (b.key === replaceKey ? { ...b, exerciseId, sets: [emptySet()], loadingLast: true, lastDate: undefined } : b))
      );
      cancelRest(replaceKey);
      prefillFromLastSession(replaceKey, exerciseId);
    } else {
      const key = crypto.randomUUID();
      setBlocks((prev) => [...prev, { key, exerciseId, sets: [emptySet()], loadingLast: true }]);
      prefillFromLastSession(key, exerciseId);
      // Bring the new block into view on a phone.
      setTimeout(() => document.getElementById(`block-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    }
  }

  function removeBlock(key: string) {
    const block = blocks.find((b) => b.key === key);
    const hasData = block?.sets.some((s) => s.reps.trim() !== "");
    if (hasData && !confirm("Remove this exercise and its sets?")) return;
    setBlocks((prev) => prev.filter((b) => b.key !== key));
    cancelRest(key);
  }

  function moveBlock(key: string, delta: -1 | 1) {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
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

  // New set copies the previous one's weight *and* reps -- most sets of a
  // block repeat, so usually there's nothing left to type.
  function addSet(key: string) {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.key !== key) return b;
        const previous = b.sets[b.sets.length - 1];
        const next = previous ? { weight: previous.weight, reps: previous.reps, restSeconds: "" } : emptySet();
        return { ...b, sets: [...b.sets, next] };
      })
    );
  }

  function startRest(key: string) {
    setRestStart((prev) => ({ ...prev, [key]: Date.now() }));
  }

  function cancelRest(key: string) {
    setRestStart((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

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
      prev.map((b) => (b.key === key ? { ...b, sets: b.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : b))
    );
  }

  function removeSet(key: string, index: number) {
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, sets: b.sets.filter((_, i) => i !== index) } : b)));
  }

  async function logWorkoutForPartner(
    partnerId: string,
    sessionGroupId: string,
    workoutPayload: {
      date: string;
      warmup: string | null;
      notes: string | null;
      duration_minutes: number | null;
      workout_type: WorkoutType;
    }
  ): Promise<string | null> {
    const { data: partnerWorkout, error: workoutError } = await supabase
      .from("workouts")
      .insert({ ...workoutPayload, user_id: partnerId, session_group_id: sessionGroupId })
      .select()
      .single();
    if (workoutError || !partnerWorkout) return workoutError?.message ?? "Failed to create workout.";

    if (workoutType === "endurance") {
      const resolvedSport = sport === OTHER_SPORT ? customSport.trim() : sport;
      const { error } = await supabase.from("endurance_details").insert({
        workout_id: partnerWorkout.id,
        sport: resolvedSport,
        discipline: sport === "climbing" && discipline ? discipline : null,
        distance_km: distanceKm ? Number(distanceKm) : null,
        session_detail: sessionDetail.trim() || null,
      });
      return error?.message ?? null;
    }

    const exerciseIds = [...new Set(blocks.map((b) => b.exerciseId))];
    const partnerWeights = await fetchLastWeightsByExercise(partnerId, exerciseIds);
    const nextIndex: Record<string, number> = {};
    const setRows = blocks.flatMap((block, blockIndex) =>
      block.sets.map((s, setIndex) => {
        const known = partnerWeights[block.exerciseId];
        const i = nextIndex[block.exerciseId] ?? 0;
        nextIndex[block.exerciseId] = i + 1;
        const fallback = Number(s.weight) || 0;
        const partnerWeight = known?.[i] ?? known?.[known.length - 1] ?? fallback;
        return {
          workout_id: partnerWorkout.id,
          exercise_id: block.exerciseId,
          weight: partnerWeight,
          reps: Number(s.reps) || 0,
          rest_time_seconds: s.restSeconds ? Number(s.restSeconds) : null,
          set_order: blockIndex * 1000 + setIndex,
        };
      })
    );
    const cardioRows = cardioBlocks.map((c, i) => ({
      workout_id: partnerWorkout.id,
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
    return (setsError ?? cardioError)?.message ?? null;
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!user || submitting) return;

    const resolvedSport = sport === OTHER_SPORT ? customSport.trim() : sport;
    if (workoutType === "endurance" && !resolvedSport) {
      setError("Pick a sport (or type one in).");
      return;
    }
    if (workoutType === "strength" && (blocks.length === 0 || blocks.every((b) => b.sets.length === 0))) {
      setError("Add at least one exercise with a set.");
      return;
    }
    const trimmedUrl = songUrl.trim();
    if (trimmedUrl && !safeUrl(trimmedUrl)) {
      setError("The song link doesn't look like a valid URL (it should start with https://).");
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
    const hasSong = !!(songTitle.trim() || songArtist.trim() || trimmedUrl);
    const songPayload =
      hasSong || hadSong
        ? {
            song_title: songTitle.trim() || (hasSong ? "Untitled" : null),
            song_artist: songArtist.trim() || null,
            song_url: trimmedUrl || null,
          }
        : {};
    const sessionGroupId = !isEdit && partnerIds.length > 0 ? crypto.randomUUID() : null;

    let workoutId = id;
    if (isEdit) {
      const { error: updateError } = await supabase
        .from("workouts")
        .update({ ...workoutPayload, ...songPayload })
        .eq("id", id!);
      if (updateError) {
        setError(updateError.message);
        setSubmitting(false);
        return;
      }
    } else {
      const { data: workout, error: workoutError } = await supabase
        .from("workouts")
        .insert({ ...workoutPayload, ...songPayload, user_id: user.id, session_group_id: sessionGroupId })
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
      if (detailsError) {
        setError(detailsError.message);
        setSubmitting(false);
        return;
      }
    } else {
      if (isEdit) {
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
      if (setsError || cardioError) {
        setError((setsError ?? cardioError)!.message);
        setSubmitting(false);
        return;
      }
    }

    if (sessionGroupId) {
      const partnerErrors: string[] = [];
      for (const partnerId of partnerIds) {
        const message = await logWorkoutForPartner(partnerId, sessionGroupId, workoutPayload);
        if (message) partnerErrors.push(message);
      }
      if (partnerErrors.length > 0) {
        setSubmitting(false);
        if (!isEdit) clearDraft();
        setError(`Saved your workout, but couldn't log it for everyone you trained with: ${partnerErrors.join("; ")}`);
        return;
      }
    }

    setSubmitting(false);
    if (!isEdit) clearDraft();
    navigate(`/workouts/${workoutId}`, { replace: true });
  }

  const exerciseById = useMemo(() => new Map(exerciseOptions.map((e) => [e.id, e])), [exerciseOptions]);
  const totalSets = blocks.reduce((n, b) => n + b.sets.length, 0);
  const songLink = parseSongUrl(songUrl);

  if (loading) return <p className="muted">Loading…</p>;

  const title = isEdit ? "Edit workout" : repeatFromId ? "Repeat workout" : "New workout";

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">{isEdit ? "Editing" : formatShortDate(date)}</p>
          <h1>{title}</h1>
        </div>
        {!isEdit && (draftRestoredAt || blocks.length > 0) && (
          <button type="button" className="ghost sm" onClick={() => confirm("Clear this workout and start over?") && resetForm()}>
            Start over
          </button>
        )}
      </div>

      {draftRestoredAt && (
        <div className="banner info">
          <span style={{ fontSize: 20 }}>📝</span>
          <div className="banner-body">
            <p className="banner-title">Picking up where you left off</p>
            <p className="small muted">Your unsaved workout was restored.</p>
          </div>
        </div>
      )}

      <form className="form-grid" onSubmit={handleSubmit}>
        {/* ---------- basics ---------- */}
        <div className="panel form-grid" style={{ gap: 14 }}>
          {!isEdit && (
            <div className="segmented full" role="group" aria-label="Workout type">
              <button type="button" aria-pressed={workoutType === "strength"} onClick={() => setWorkoutType("strength")}>
                🏋️ Strength
              </button>
              <button type="button" aria-pressed={workoutType === "endurance"} onClick={() => setWorkoutType("endurance")}>
                🏃 Endurance
              </button>
            </div>
          )}

          <div className="row nowrap" style={{ gap: 10 }}>
            <div className="field grow">
              <label htmlFor="date">Date</label>
              <input id="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field" style={{ width: 120 }}>
              <label htmlFor="duration">Minutes</label>
              <input
                id="duration"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="—"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>

          {!isEdit && acceptedConnections.length > 0 && (
            <div className="field">
              <span className="label">Training with</span>
              <div className="row" style={{ gap: 8 }}>
                {acceptedConnections.map((p) => {
                  const on = partnerIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="toggle-chip"
                      aria-pressed={on}
                      onClick={() => togglePartner(p.id)}
                    >
                      <Avatar name={p.name} size={26} />
                      {p.name}
                      {on && <CheckIcon width={16} height={16} style={{ color: "var(--ember)" }} />}
                    </button>
                  );
                })}
              </div>
              {partnerIds.length > 0 && (
                <p className="muted tiny" style={{ margin: 0 }}>
                  Also logs this session for them, with their own weights from last time. They can remove it from their log.
                </p>
              )}
            </div>
          )}

          {!isEdit && !repeatFromId && templates.length > 0 && (
            <div className="field">
              <span className="label">Start from a template</span>
              <div className="row" style={{ gap: 8 }}>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="toggle-chip"
                    style={{ paddingLeft: 14 }}
                    aria-pressed={selectedTemplateId === t.id}
                    disabled={loadingTemplate}
                    onClick={() => applyTemplate(t.id)}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {workoutType === "strength" ? (
          <>
            {/* ---------- exercises ---------- */}
            <div className="stack" style={{ gap: 12 }}>
              {blocks.map((block, blockIndex) => {
                const exercise = exerciseById.get(block.exerciseId);
                const equipment = equipmentOf(exercise);
                const showVol = equipment.isBodyweight || equipment.isDumbbell || equipment.barWeightKg != null;
                const running = restStart[block.key];
                return (
                  <div key={block.key} id={`block-${block.key}`} className="ex-block">
                    <div className="ex-block-head">
                      <span className="ex-num">{blockIndex + 1}</span>
                      <button
                        type="button"
                        className="ex-name-btn"
                        onClick={() => setPicker({ open: true, replaceKey: block.key })}
                        aria-label="Change exercise"
                      >
                        <span>{exercise?.name ?? "Pick an exercise"}</span>
                        <ChevronDownIcon width={16} height={16} style={{ flex: "none", opacity: 0.5 }} />
                      </button>
                      {blocks.length > 1 && (
                        <>
                          <button
                            type="button"
                            className="icon-btn sm"
                            disabled={blockIndex === 0}
                            onClick={() => moveBlock(block.key, -1)}
                            aria-label="Move up"
                          >
                            <ArrowUpIcon width={18} height={18} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn sm"
                            disabled={blockIndex === blocks.length - 1}
                            onClick={() => moveBlock(block.key, 1)}
                            aria-label="Move down"
                          >
                            <ArrowDownIcon width={18} height={18} />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="icon-btn sm danger-hover"
                        onClick={() => removeBlock(block.key)}
                        aria-label="Remove exercise"
                      >
                        <TrashIcon width={18} height={18} />
                      </button>
                    </div>

                    <div className="ex-hint">
                      {block.loadingLast ? (
                        <span>Loading last session…</span>
                      ) : block.lastDate ? (
                        <span>↺ Last time · {formatShortDate(block.lastDate)}</span>
                      ) : block.lastDate === null ? (
                        <span>First time on this one 💪</span>
                      ) : null}
                      {equipment.isDumbbell && <span>Per dumbbell · volume ×2</span>}
                      {equipment.barWeightKg != null && <span>Added to a {equipment.barWeightKg} kg bar</span>}
                      {equipment.isBodyweight && <span>Bodyweight + added kg</span>}
                    </div>

                    <div className="set-grid">
                      <div className={`set-row head${showVol ? " has-vol" : ""}`}>
                        <span>Set</span>
                        <span>{weightLabel(equipment)}</span>
                        <span>Reps</span>
                        <span>Rest s</span>
                        {showVol && <span style={{ textAlign: "right" }}>Vol</span>}
                        <span />
                      </div>
                      {block.sets.map((s, i) => {
                        const volume = setVolume({
                          equipment,
                          weight: Number(s.weight) || 0,
                          reps: Number(s.reps) || 0,
                          bodyWeightKg,
                        });
                        return (
                          <div key={i} className={`set-row enter${showVol ? " has-vol" : ""}`}>
                            <span className="set-idx">{i + 1}</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              placeholder="0"
                              aria-label={`Set ${i + 1} weight`}
                              value={s.weight}
                              onChange={(e) => updateSet(block.key, i, { weight: e.target.value })}
                              onFocus={(e) => e.target.select()}
                            />
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              placeholder="—"
                              aria-label={`Set ${i + 1} reps`}
                              value={s.reps}
                              onChange={(e) => updateSet(block.key, i, { reps: e.target.value })}
                              onFocus={(e) => e.target.select()}
                            />
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              placeholder="—"
                              aria-label={`Set ${i + 1} rest seconds`}
                              value={s.restSeconds}
                              onChange={(e) => updateSet(block.key, i, { restSeconds: e.target.value })}
                              onFocus={(e) => e.target.select()}
                            />
                            {showVol && <span className="vol">{volume ? volume.toFixed(0) : "—"}</span>}
                            <button
                              type="button"
                              className="icon-btn sm danger-hover"
                              onClick={() => removeSet(block.key, i)}
                              aria-label={`Remove set ${i + 1}`}
                            >
                              <CloseIcon width={16} height={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="ex-block-foot">
                      <button type="button" className="soft sm" onClick={() => addSet(block.key)}>
                        <PlusIcon width={16} height={16} /> Set
                      </button>
                      {running ? (
                        <>
                          <span className="rest-pill">
                            <span className="dot" />
                            {formatElapsed(running)}
                          </span>
                          <button type="button" className="primary sm" onClick={() => stopRestAndAddSet(block.key)}>
                            Next set
                          </button>
                          <button type="button" className="icon-btn sm" onClick={() => cancelRest(block.key)} aria-label="Cancel timer">
                            <CloseIcon width={16} height={16} />
                          </button>
                        </>
                      ) : (
                        <button type="button" className="ghost sm" onClick={() => startRest(block.key)}>
                          <TimerIcon width={16} height={16} /> Rest timer
                        </button>
                      )}
                    </div>
                    {exercise?.is_bodyweight && bodyWeightKg == null && (
                      <p className="muted tiny" style={{ padding: "0 14px 12px", margin: 0 }}>
                        Log your body weight in <Link to="/profile">Profile</Link> to get volume for bodyweight sets.
                      </p>
                    )}
                  </div>
                );
              })}

              {exerciseOptions.length === 0 ? (
                <div className="empty-state">
                  No exercises in the library yet — <Link to="/exercises/new">add one first</Link>.
                </div>
              ) : (
                <button type="button" className="add-exercise-btn" onClick={() => setPicker({ open: true, replaceKey: null })}>
                  <PlusIcon width={20} height={20} /> Add exercise
                </button>
              )}
            </div>

            {/* ---------- warmup & cardio ---------- */}
            <Disclosure autoOpen={!!warmup || cardioBlocks.length > 0}
              summary={
                <>
                🔥 Warm-up & cardio
                {(warmup || cardioBlocks.length > 0) && (
                  <span className="summary-hint">
                    {cardioBlocks.length > 0 ? `${cardioBlocks.length} cardio block${cardioBlocks.length > 1 ? "s" : ""}` : "added"}
                  </span>
                )}
                </>
              }
            >
                <div className="field">
                  <label htmlFor="warmup">Warm-up</label>
                  <textarea
                    id="warmup"
                    rows={2}
                    placeholder="Mobility, activation, ramp-up sets…"
                    value={warmup}
                    onChange={(e) => setWarmup(e.target.value)}
                  />
                </div>
                {cardioBlocks.map((c) => (
                  <div key={c.key} className="panel sunken" style={{ padding: 12 }}>
                    <div className="row nowrap" style={{ gap: 8 }}>
                      <select
                        value={c.activity}
                        onChange={(e) => updateCardioBlock(c.key, { activity: e.target.value as CardioActivity })}
                        aria-label="Activity"
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
                        aria-label="Purpose"
                      >
                        {CARDIO_PURPOSES.map((p) => (
                          <option key={p} value={p}>
                            {CARDIO_PURPOSE_LABELS[p]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="icon-btn sm danger-hover"
                        onClick={() => removeCardioBlock(c.key)}
                        aria-label="Remove cardio"
                      >
                        <TrashIcon width={18} height={18} />
                      </button>
                    </div>
                    <div className="row nowrap" style={{ marginTop: 10, gap: 8 }}>
                      <div className="field grow">
                        <label htmlFor={`cd-${c.key}`}>Min</label>
                        <input
                          id={`cd-${c.key}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={c.durationMinutes}
                          onChange={(e) => updateCardioBlock(c.key, { durationMinutes: e.target.value })}
                        />
                      </div>
                      <div className="field grow">
                        <label htmlFor={`ci-${c.key}`}>Incline %</label>
                        <input
                          id={`ci-${c.key}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.5"
                          value={c.inclinePercent}
                          onChange={(e) => updateCardioBlock(c.key, { inclinePercent: e.target.value })}
                        />
                      </div>
                      <div className="field grow">
                        <label htmlFor={`cs-${c.key}`}>km/h</label>
                        <input
                          id={`cs-${c.key}`}
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
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="sm" onClick={() => addCardioBlock("warmup")}>
                    <PlusIcon width={16} height={16} /> Cardio warm-up
                  </button>
                  <button type="button" className="sm" onClick={() => addCardioBlock("cooldown")}>
                    <PlusIcon width={16} height={16} /> Cool-down
                  </button>
                </div>
            </Disclosure>
          </>
        ) : (
          <div className="panel form-grid" style={{ gap: 14 }}>
            <div className="field">
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
              <div className="field">
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
            <div className="row nowrap" style={{ gap: 10 }}>
              {sport === "climbing" && (
                <div className="field grow">
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
              <div className="field grow">
                <label htmlFor="distance">Distance (km)</label>
                <input
                  id="distance"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.1"
                  placeholder="—"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="sessionDetail">{sport === "climbing" ? "Boulders / routes done" : "Session detail"}</label>
              <textarea
                id="sessionDetail"
                rows={3}
                value={sessionDetail}
                onChange={(e) => setSessionDetail(e.target.value)}
                placeholder={sport === "climbing" ? "e.g. 3x V3, 1x V5, onsight" : "Splits, effort, route, etc."}
              />
            </div>
          </div>
        )}

        {/* ---------- best song ---------- */}
        <Disclosure autoOpen={!!songTitle}
          summary={
            <>
            🎵 Best song
            <span className="summary-hint">{songTitle ? songTitle : "the track that carried the session"}</span>
            </>
          }
        >
            <div className="row nowrap" style={{ gap: 10 }}>
              <div className="field grow">
                <label htmlFor="songTitle">Title</label>
                <input
                  id="songTitle"
                  value={songTitle}
                  maxLength={200}
                  placeholder="e.g. Till I Collapse"
                  onChange={(e) => setSongTitle(e.target.value)}
                />
              </div>
              <div className="field grow">
                <label htmlFor="songArtist">Artist</label>
                <input
                  id="songArtist"
                  value={songArtist}
                  maxLength={200}
                  placeholder="e.g. Eminem"
                  onChange={(e) => setSongArtist(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="songUrl">Link (optional)</label>
              <input
                id="songUrl"
                type="url"
                inputMode="url"
                value={songUrl}
                maxLength={500}
                placeholder="Paste a Spotify or YouTube link"
                onChange={(e) => setSongUrl(e.target.value)}
              />
              {songLink && songLink.provider !== "other" && (
                <span className="chip primary" style={{ width: "fit-content" }}>
                  <MusicIcon width={14} height={14} />
                  {songLink.provider === "spotify" ? "Spotify" : songLink.provider === "youtube" ? "YouTube" : "Apple Music"} link
                </span>
              )}
              <p className="muted tiny" style={{ margin: 0 }}>
                Goes into the group playlist on the Group page.
              </p>
            </div>
        </Disclosure>

        {/* ---------- notes ---------- */}
        <Disclosure autoOpen={!!notes}
          summary={
            <>
            ✍️ {workoutType === "endurance" ? "Comment" : "Notes"}
            {notes && <span className="summary-hint">{notes}</span>}
            </>
          }
        >
            <textarea
              id="notes"
              rows={3}
              aria-label="Notes"
              placeholder="How did it feel? Anything to remember next time?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
        </Disclosure>

        {/* ---------- template ---------- */}
        <Disclosure
          summary={
            <>
            📋 Template
            <span className="summary-hint">save this plan for later</span>
            </>
          }
        >
            <div className="row nowrap" style={{ gap: 8 }}>
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name, e.g. Push day"
                aria-label="Template name"
              />
              <button type="button" onClick={saveAsTemplate} disabled={savingTemplate || !templateName.trim()}>
                {savingTemplate ? "Saving…" : templateSaved ? "Saved ✓" : "Save"}
              </button>
            </div>
            {templates.length > 0 && (
              <div className="stack" style={{ gap: 2 }}>
                <span className="muted tiny">Your templates</span>
                {templates.map((t) => (
                  <div key={t.id} className="row between nowrap">
                    <span className="truncate">{t.name}</span>
                    <button
                      type="button"
                      className="icon-btn sm danger-hover"
                      onClick={() => deleteTemplate(t.id)}
                      aria-label={`Delete template ${t.name}`}
                    >
                      <TrashIcon width={16} height={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
        </Disclosure>

        {error && <p className="error-text">{error}</p>}

        <div className="action-bar">
          <div className="summary">
            {workoutType === "strength" ? (
              <>
                <strong>{blocks.length}</strong> exercise{blocks.length === 1 ? "" : "s"} · <strong>{totalSets}</strong> set
                {totalSets === 1 ? "" : "s"}
              </>
            ) : (
              <strong>{sport === OTHER_SPORT ? customSport || "Endurance" : SPORT_LABELS[sport as keyof typeof SPORT_LABELS]}</strong>
            )}
            {partnerIds.length > 0 && <> · +{partnerIds.length}</>}
          </div>
          <button type="submit" className="primary lg" disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Finish"}
          </button>
        </div>
      </form>

      <ExercisePicker
        open={picker.open}
        exercises={exerciseOptions}
        recentIds={recentExerciseIds}
        inWorkoutIds={blocks.map((b) => b.exerciseId)}
        title={picker.replaceKey ? "Change exercise" : "Add exercise"}
        onPick={handlePick}
        onClose={closePicker}
      />
    </div>
  );
}
