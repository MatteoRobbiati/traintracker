import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
} from "recharts";
import { supabase } from "../lib/supabaseClient";
import { formatDate, setVolume, type Equipment } from "../lib/format";
import { isBetterSet, type BestSetCandidate } from "../lib/personalBest";
import { computeStreak } from "../lib/streak";
import MuscleMap from "../components/MuscleMap";
import ContributionGraph from "../components/ContributionGraph";
import { MUSCLE_LABELS, type Muscle } from "../constants/muscles";

// Categorical palette — distinguishable in both light and dark, consistent
// with the app's ember/focus accent pair. Assigned by each person's index in
// `allUserNames` (see colorFor) rather than wherever they land in a given
// chart's own data, so one person keeps the same color in every chart *and*
// stays put even when someone else is toggled out of view via the "Show"
// picker below.
const PALETTE = ["#D9531E", "#1E6E62", "#4C6EF5", "#C2410C", "#7C5CBF", "#0E7490", "#B3261E", "#6B7280"];

interface SetRow {
  workout_id: string;
  weight: number;
  reps: number;
  workout: { user_id: string; date: string } | null;
  exercise: {
    id: string;
    name: string;
    is_bodyweight: boolean;
    bodyweight_percent: number;
    is_dumbbell: boolean;
    bar_weight_kg: number | null;
    primary_muscles: Muscle[];
    secondary_muscles: Muscle[];
  } | null;
}

interface WeightLog {
  user_id: string;
  weight_kg: number;
  recorded_at: string;
}

function isoWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

// Divides every numeric series in each row by that series' person's latest
// body weight (see normalizeByBodyWeight below) -- kg lifted per kg of the
// lifter, so a 60kg and a 100kg friend's charts compare fairly instead of
// the heavier person always winning by default. A person with no logged
// body weight is left out of that row entirely (rather than shown as 0)
// so their line/bar just doesn't render instead of looking like they did
// nothing.
function toRelativeRows(
  rows: Record<string, number | string>[],
  keyField: string,
  bodyWeightByName: Record<string, number>
): Record<string, number | string>[] {
  return rows.map((row) => {
    const out: Record<string, number | string> = { [keyField]: row[keyField] };
    for (const [k, v] of Object.entries(row)) {
      if (k === keyField || typeof v !== "number") continue;
      const bw = bodyWeightByName[k];
      if (bw) out[k] = v / bw;
    }
    return out;
  });
}

export default function Group() {
  // profileNames is just a lookup dict (id -> name) — profiles are visible
  // to everyone, but we must never build a UI list (legend, dropdown) from
  // its full keyset, only from ids that already appear in RLS-gated rows
  // below (sets/weight logs). Otherwise names of non-connected people leak
  // into chart legends even though their actual data stays hidden.
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<SetRow[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  // Every visible workout (of *any* type -- strength or endurance), just
  // user_id + date, for the combined group activity calendar below: unlike
  // `rows` (from `sets`, strength-only), this is what lets someone who only
  // logs cardio still show up in it.
  const [allWorkouts, setAllWorkouts] = useState<{ user_id: string; date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExercise, setSelectedExercise] = useState<string>("");
  const [muscleUserFilter, setMuscleUserFilter] = useState<string>("");
  const [muscleRangeDays, setMuscleRangeDays] = useState<number>(28);

  // Who to actually render below -- everyone visible by default (nobody
  // hidden yet), so a newly-accepted connection just shows up rather than
  // needing an opt-in click.
  const [hiddenNames, setHiddenNames] = useState<Set<string>>(new Set());
  function toggleVisible(name: string) {
    setHiddenNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // Volume comparisons (weekly/cumulative/exercise) can be read as raw kg or
  // "per kg of the lifter's own body weight" -- see toRelativeRows above.
  const [normalizeByBodyWeight, setNormalizeByBodyWeight] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: profs }, { data: sets }, { data: weights }, { data: workouts }] = await Promise.all([
        supabase.from("profiles").select("id, name"),
        supabase
          .from("sets")
          .select(
            "workout_id, weight, reps, workout:workouts(user_id, date), exercise:exercises(id, name, is_bodyweight, bodyweight_percent, is_dumbbell, bar_weight_kg, primary_muscles, secondary_muscles)"
          ),
        supabase
          .from("body_weight_logs")
          .select("user_id, weight_kg, recorded_at")
          .order("recorded_at", { ascending: false }),
        supabase.from("workouts").select("user_id, date"),
      ]);

      const profMap: Record<string, string> = {};
      (profs ?? []).forEach((p) => (profMap[p.id] = p.name));
      setProfileNames(profMap);

      setRows((sets as unknown as SetRow[]) ?? []);
      setWeightLogs(weights ?? []);
      setAllWorkouts(workouts ?? []);
      setLoading(false);
    }
    load();
  }, []);

  // Latest weight per user, for bodyweight-exercise volume — weightLogs is
  // already ordered newest-first. Deliberately unfiltered by the "Show"
  // picker: it feeds the physics of the volume calculation below, not what
  // gets displayed.
  const latestBodyWeight = useMemo(() => {
    const map: Record<string, number> = {};
    for (const w of weightLogs) {
      if (!(w.user_id in map)) map[w.user_id] = w.weight_kg;
    }
    return map;
  }, [weightLogs]);

  const latestBodyWeightByName = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [uid, kg] of Object.entries(latestBodyWeight)) {
      const name = profileNames[uid];
      if (name) map[name] = kg;
    }
    return map;
  }, [latestBodyWeight, profileNames]);

  const enrichedAll = useMemo(
    () =>
      rows
        .filter((r) => r.workout && r.exercise)
        .map((r) => ({
          userId: r.workout!.user_id,
          userName: profileNames[r.workout!.user_id] ?? "Unknown",
          date: r.workout!.date,
          week: isoWeekLabel(r.workout!.date),
          workoutId: r.workout_id,
          exerciseId: r.exercise!.id,
          exerciseName: r.exercise!.name,
          isBodyweight: r.exercise!.is_bodyweight,
          weight: r.weight,
          reps: r.reps,
          primaryMuscles: r.exercise!.primary_muscles,
          secondaryMuscles: r.exercise!.secondary_muscles,
          volume: setVolume({
            equipment: {
              isBodyweight: r.exercise!.is_bodyweight,
              bodyweightPercent: r.exercise!.bodyweight_percent,
              isDumbbell: r.exercise!.is_dumbbell,
              barWeightKg: r.exercise!.bar_weight_kg,
            } satisfies Equipment,
            weight: r.weight,
            reps: r.reps,
            bodyWeightKg: latestBodyWeight[r.workout!.user_id] ?? null,
          }),
        })),
    [rows, profileNames, latestBodyWeight]
  );

  // Every id we're actually allowed to see (RLS already enforced this on the
  // queries above) — the only safe source for "who shows up in charts".
  // Unfiltered by the "Show" picker on purpose: colors and the picker's own
  // checklist both key off this full list, so hiding a friend never
  // reshuffles anyone else's color.
  const allUserNames = useMemo(() => {
    const ids = new Set<string>([
      ...enrichedAll.map((r) => r.userId),
      ...weightLogs.map((w) => w.user_id),
      ...allWorkouts.map((w) => w.user_id),
    ]);
    return Array.from(ids)
      .map((id) => profileNames[id] ?? "Unknown")
      .sort();
  }, [enrichedAll, weightLogs, allWorkouts, profileNames]);

  function colorFor(name: string): string {
    const i = allUserNames.indexOf(name);
    return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
  }

  // What actually renders below, after the "Show" picker.
  const enriched = useMemo(
    () => enrichedAll.filter((r) => !hiddenNames.has(r.userName)),
    [enrichedAll, hiddenNames]
  );
  const visibleNames = useMemo(
    () => allUserNames.filter((n) => !hiddenNames.has(n)),
    [allUserNames, hiddenNames]
  );
  // Combined group activity calendar (everyone's workouts of *any* type
  // summed into one ContributionGraph) -- of any type so a cardio-only
  // person still shows up, same reasoning as allUserNames above.
  const visibleWorkoutDates = useMemo(
    () => allWorkouts.filter((w) => !hiddenNames.has(profileNames[w.user_id] ?? "Unknown")).map((w) => w.date),
    [allWorkouts, hiddenNames, profileNames]
  );

  // Weekly volume per person
  const weeklyVolume = useMemo(() => {
    const byWeek = new Map<string, Record<string, number>>();
    for (const r of enriched) {
      const entry = byWeek.get(r.week) ?? {};
      entry[r.userName] = (entry[r.userName] ?? 0) + r.volume;
      byWeek.set(r.week, entry);
    }
    return Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, values]) => ({ week, ...values }));
  }, [enriched]);

  const weeklyVolumeDisplay = useMemo(
    () => (normalizeByBodyWeight ? toRelativeRows(weeklyVolume, "week", latestBodyWeightByName) : weeklyVolume),
    [weeklyVolume, normalizeByBodyWeight, latestBodyWeightByName]
  );

  // Running total of weeklyVolume, so growth over time reads as a trend
  // instead of a bar chart that resets to zero every week.
  const cumulativeVolume = useMemo(() => {
    const totals: Record<string, number> = {};
    return weeklyVolume.map((weekRow) => {
      const { week, ...values } = weekRow;
      for (const [name, v] of Object.entries(values)) {
        totals[name] = (totals[name] ?? 0) + (v as number);
      }
      return { week, ...totals };
    });
  }, [weeklyVolume]);

  const cumulativeVolumeDisplay = useMemo(
    () =>
      normalizeByBodyWeight ? toRelativeRows(cumulativeVolume, "week", latestBodyWeightByName) : cumulativeVolume,
    [cumulativeVolume, normalizeByBodyWeight, latestBodyWeightByName]
  );

  // Workout frequency: distinct workouts per user
  const workoutFrequency = useMemo(() => {
    const seen = new Map<string, Set<string>>();
    for (const r of enriched) {
      const set = seen.get(r.userName) ?? new Set<string>();
      set.add(r.date + "|" + r.userId);
      seen.set(r.userName, set);
    }
    return Array.from(seen.entries()).map(([name, dates]) => ({ name, workouts: dates.size }));
  }, [enriched]);

  // Muscle heat: volume split across an exercise's primary AND secondary
  // muscles (secondary at half weight -- a stabilizer/assistant shouldn't
  // read as heavily trained as the actual target), normalized 0..1 against
  // the most-trained muscle for the figure. A muscle set only as secondary
  // on every exercise that touches it (e.g. glutes on a mostly-quad exercise
  // like leg extension) still needs to show up here, just dimmer -- it used
  // to be dropped entirely because this only looked at primary_muscles.
  // Scoped to a rolling window by default -- an all-time total barely moves
  // for one new session once there's weeks of history behind it, which reads
  // as "nothing changed" even though it did.
  const SECONDARY_WEIGHT = 0.5;
  const muscleIntensities = useMemo(() => {
    const cutoff = muscleRangeDays === 0 ? null : new Date(Date.now() - muscleRangeDays * 86400000);
    const totals = new Map<Muscle, number>();
    for (const r of enriched) {
      if (muscleUserFilter && r.userName !== muscleUserFilter) continue;
      if (cutoff && new Date(r.date + "T00:00:00") < cutoff) continue;
      const totalWeight = r.primaryMuscles.length + r.secondaryMuscles.length * SECONDARY_WEIGHT;
      if (totalWeight === 0) continue;
      const unit = r.volume / totalWeight;
      for (const m of r.primaryMuscles) totals.set(m, (totals.get(m) ?? 0) + unit);
      for (const m of r.secondaryMuscles) totals.set(m, (totals.get(m) ?? 0) + unit * SECONDARY_WEIGHT);
    }
    const max = Math.max(0, ...totals.values());
    const result: Partial<Record<Muscle, number>> = {};
    if (max > 0) {
      for (const [m, v] of totals) result[m] = v / max;
    }
    return result;
  }, [enriched, muscleUserFilter, muscleRangeDays]);

  const muscleHeatEmpty = Object.keys(muscleIntensities).length === 0;

  // Same per-muscle volume split as above, but kept per person instead of
  // collapsed into one figure -- the heat map answers "what does my/their
  // training emphasize", this answers "who's actually putting in the most
  // work on each muscle". Capped to the top 8 muscles by combined volume so
  // the chart stays readable instead of listing all 18.
  const muscleVolumeByPerson = useMemo(() => {
    const cutoff = muscleRangeDays === 0 ? null : new Date(Date.now() - muscleRangeDays * 86400000);
    const totals = new Map<Muscle, Record<string, number>>();
    for (const r of enriched) {
      if (cutoff && new Date(r.date + "T00:00:00") < cutoff) continue;
      const totalWeight = r.primaryMuscles.length + r.secondaryMuscles.length * SECONDARY_WEIGHT;
      if (totalWeight === 0) continue;
      const unit = r.volume / totalWeight;
      for (const m of r.primaryMuscles) {
        const entry = totals.get(m) ?? {};
        entry[r.userName] = (entry[r.userName] ?? 0) + unit;
        totals.set(m, entry);
      }
      for (const m of r.secondaryMuscles) {
        const entry = totals.get(m) ?? {};
        entry[r.userName] = (entry[r.userName] ?? 0) + unit * SECONDARY_WEIGHT;
        totals.set(m, entry);
      }
    }
    return Array.from(totals.entries())
      .map(([muscle, values]) => ({
        muscle: MUSCLE_LABELS[muscle],
        total: Object.values(values).reduce((s, v) => s + v, 0),
        ...values,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [enriched, muscleRangeDays]);

  const exerciseOptions = useMemo(
    () => Array.from(new Set(enriched.map((r) => r.exerciseName))).sort(),
    [enriched]
  );

  const exerciseComparison = useMemo(() => {
    if (!selectedExercise) return [];
    const byDate = new Map<string, Record<string, number>>();
    for (const r of enriched) {
      if (r.exerciseName !== selectedExercise) continue;
      const entry = byDate.get(r.date) ?? {};
      entry[r.userName] = Math.max(entry[r.userName] ?? 0, r.volume);
      byDate.set(r.date, entry);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }));
  }, [enriched, selectedExercise]);

  const exerciseComparisonDisplay = useMemo(
    () =>
      normalizeByBodyWeight
        ? toRelativeRows(exerciseComparison, "date", latestBodyWeightByName)
        : exerciseComparison,
    [exerciseComparison, normalizeByBodyWeight, latestBodyWeightByName]
  );

  useEffect(() => {
    if (!selectedExercise && exerciseOptions.length > 0) setSelectedExercise(exerciseOptions[0]);
  }, [exerciseOptions, selectedExercise]);

  // Group records: best set ever logged per exercise ("massimale"), and who
  // holds it -- across everyone whose data is visible (self + accepted
  // connections, same as everything else on this page).
  const groupRecords = useMemo(() => {
    const best = new Map<string, { best: BestSetCandidate; holder: string; isBodyweight: boolean }>();
    for (const r of enriched) {
      const candidate: BestSetCandidate = { weight: r.weight, reps: r.reps, date: r.date };
      const current = best.get(r.exerciseName);
      if (!current || isBetterSet(candidate, current.best, r.isBodyweight)) {
        best.set(r.exerciseName, { best: candidate, holder: r.userName, isBodyweight: r.isBodyweight });
      }
    }
    return Array.from(best.entries())
      .map(([exerciseName, v]) => ({ exerciseName, ...v }))
      .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
  }, [enriched]);

  // Group highlights: a handful of at-a-glance cards summarizing "what's
  // going on" instead of making everyone read every chart below to find out.
  const highlights = useMemo(() => {
    const weekCutoff = new Date();
    weekCutoff.setDate(weekCutoff.getDate() - 7);
    const thisWeek = enriched.filter((r) => new Date(r.date + "T00:00:00") >= weekCutoff);

    // Most active this week: distinct workout-days per person.
    const daysByUser = new Map<string, Set<string>>();
    for (const r of thisWeek) {
      const set = daysByUser.get(r.userName) ?? new Set<string>();
      set.add(r.date);
      daysByUser.set(r.userName, set);
    }
    let mostActive: { name: string; count: number } | null = null;
    for (const [name, days] of daysByUser) {
      if (!mostActive || days.size > mostActive.count) mostActive = { name, count: days.size };
    }

    // Longest current streak among everyone visible (rest-day-tolerant, see
    // src/lib/streak.ts) -- same rule as the personal Dashboard streak.
    const datesByUser = new Map<string, string[]>();
    for (const r of enriched) {
      const list = datesByUser.get(r.userName) ?? [];
      list.push(r.date);
      datesByUser.set(r.userName, list);
    }
    let longestStreak: { name: string; current: number } | null = null;
    for (const [name, dates] of datesByUser) {
      const s = computeStreak(dates);
      if (s.current > 0 && (!longestStreak || s.current > longestStreak.current)) {
        longestStreak = { name, current: s.current };
      }
    }

    // Total group volume this week.
    const weekVolume = thisWeek.reduce((sum, r) => sum + r.volume, 0);

    // Most recent new "massimale" record, among the ones already computed.
    let latestPb: { exerciseName: string; holder: string; best: BestSetCandidate; isBodyweight: boolean } | null =
      null;
    for (const r of groupRecords) {
      if (!latestPb || r.best.date > latestPb.best.date) latestPb = r;
    }

    return { mostActive, longestStreak, weekVolume, latestPb };
  }, [enriched, groupRecords]);

  if (loading) return <p className="muted">Loading…</p>;
  if (enrichedAll.length === 0 && weightLogs.length === 0 && allWorkouts.length === 0)
    return (
      <p className="muted">
        Nothing to compare yet — either no workouts/weight logged, or you're not connected with anyone. Head
        to <Link to="/connections">Connections</Link> to request access to a friend's data.
      </p>
    );

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1>Group</h1>

      {allUserNames.length > 0 && (
        <div className="panel">
          <div className="row between">
            <h3 style={{ margin: 0 }}>Show</h3>
            {hiddenNames.size > 0 && (
              <button type="button" className="ghost" onClick={() => setHiddenNames(new Set())}>
                Show everyone
              </button>
            )}
          </div>
          <div className="row" style={{ gap: "6px 10px", marginTop: 10 }}>
            {allUserNames.map((name) => {
              const visible = !hiddenNames.has(name);
              return (
                <label
                  key={name}
                  className="chip"
                  style={{
                    cursor: "pointer",
                    opacity: visible ? 1 : 0.4,
                    borderColor: visible ? colorFor(name) : undefined,
                    color: visible ? colorFor(name) : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ width: "auto", marginRight: 6 }}
                    checked={visible}
                    onChange={() => toggleVisible(name)}
                  />
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: colorFor(name),
                      marginRight: 6,
                    }}
                  />
                  {name}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {visibleNames.length === 0 ? (
        <p className="muted">Everyone's hidden — check a friend above to see their data.</p>
      ) : (
        <>
          {(enriched.length > 0 || visibleWorkoutDates.length > 0) && (
            <div className="panel">
              <h3 style={{ marginBottom: 12 }}>✨ Highlights</h3>
              <div className="highlight-grid">
                {highlights.mostActive && (
                  <div
                    className="highlight-card"
                    style={{ borderLeft: `3px solid ${colorFor(highlights.mostActive.name)}` }}
                  >
                    <p className="eyebrow" style={{ margin: "0 0 4px" }}>🏆 Most active (7d)</p>
                    <h2 style={{ margin: 0 }}>{highlights.mostActive.name}</h2>
                    <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
                      {highlights.mostActive.count} workout day{highlights.mostActive.count === 1 ? "" : "s"}
                    </p>
                  </div>
                )}
                {highlights.longestStreak && (
                  <div
                    className="highlight-card"
                    style={{ borderLeft: `3px solid ${colorFor(highlights.longestStreak.name)}` }}
                  >
                    <p className="eyebrow" style={{ margin: "0 0 4px" }}>🔥 Longest streak</p>
                    <h2 style={{ margin: 0 }}>{highlights.longestStreak.name}</h2>
                    <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
                      {highlights.longestStreak.current} day{highlights.longestStreak.current === 1 ? "" : "s"}
                    </p>
                  </div>
                )}
                <div className="highlight-card">
                  <p className="eyebrow" style={{ margin: "0 0 4px" }}>📦 Group volume (7d)</p>
                  <h2 style={{ margin: 0 }}>{highlights.weekVolume.toFixed(0)} kg</h2>
                  <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>combined, last 7 days</p>
                </div>
                {highlights.latestPb && (
                  <div
                    className="highlight-card"
                    style={{ borderLeft: `3px solid ${colorFor(highlights.latestPb.holder)}` }}
                  >
                    <p className="eyebrow" style={{ margin: "0 0 4px" }}>💪 Latest PB</p>
                    <h2 style={{ margin: 0 }}>{highlights.latestPb.holder}</h2>
                    <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
                      {highlights.latestPb.exerciseName} —{" "}
                      {highlights.latestPb.isBodyweight
                        ? `${highlights.latestPb.best.reps} reps`
                        : `${highlights.latestPb.best.weight} kg × ${highlights.latestPb.best.reps}`}{" "}
                      ({formatDate(highlights.latestPb.best.date)})
                    </p>
                  </div>
                )}
              </div>
              {visibleWorkoutDates.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <p className="eyebrow" style={{ margin: "0 0 8px" }}>
                    Group activity — everyone's workouts, combined
                  </p>
                  <ContributionGraph dates={visibleWorkoutDates} />
                </div>
              )}
            </div>
          )}

          {enriched.length > 0 && (
            <div className="panel">
              <div className="row between">
                <div>
                  <h3 style={{ margin: 0 }}>Volume comparisons</h3>
                  <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                    {normalizeByBodyWeight
                      ? "Volume ÷ each person's latest logged body weight — fair across different sizes. Anyone without a logged weight drops out of these charts."
                      : "Raw kg lifted — a heavier or bigger lifter naturally shows higher numbers here."}
                  </p>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className={!normalizeByBodyWeight ? "primary" : "ghost"}
                    onClick={() => setNormalizeByBodyWeight(false)}
                  >
                    Absolute (kg)
                  </button>
                  <button
                    type="button"
                    className={normalizeByBodyWeight ? "primary" : "ghost"}
                    onClick={() => setNormalizeByBodyWeight(true)}
                  >
                    Per kg bodyweight
                  </button>
                </div>
              </div>
            </div>
          )}

          {enriched.length > 0 && (
            <>
              <div className="panel">
                <h3>Weekly volume per person</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={weeklyVolumeDisplay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="var(--ink-soft)" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="var(--ink-soft)"
                      unit={normalizeByBodyWeight ? "×BW" : "kg"}
                    />
                    <Tooltip
                      contentStyle={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }}
                      formatter={(value: number, name: string) => [
                        normalizeByBodyWeight ? `${value.toFixed(2)}×BW` : `${value.toFixed(0)} kg`,
                        name,
                      ]}
                    />
                    <Legend />
                    {visibleNames.map((name) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={colorFor(name)}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="panel">
                <h3>Cumulative volume</h3>
                <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>
                  Running total over time — a steadily climbing line either way, but the slope shows who's ramping
                  up versus coasting.
                </p>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={cumulativeVolumeDisplay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="var(--ink-soft)" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="var(--ink-soft)"
                      unit={normalizeByBodyWeight ? "×BW" : "kg"}
                    />
                    <Tooltip
                      contentStyle={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }}
                      formatter={(value: number, name: string) => [
                        normalizeByBodyWeight ? `${value.toFixed(2)}×BW` : `${value.toFixed(0)} kg`,
                        name,
                      ]}
                    />
                    <Legend />
                    {visibleNames.map((name) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={colorFor(name)}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="panel">
                <h3>Workout frequency</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={workoutFrequency}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--ink-soft)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--ink-soft)" allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }} />
                    <Bar dataKey="workouts" radius={[6, 6, 0, 0]}>
                      {workoutFrequency.map((row) => (
                        <Cell key={row.name} fill={colorFor(row.name)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          <div className="panel">
            <div className="row between">
              <h3>Muscle heat</h3>
              <div className="row" style={{ gap: 8 }}>
                <select
                  value={muscleRangeDays}
                  onChange={(e) => setMuscleRangeDays(Number(e.target.value))}
                  style={{ width: "auto" }}
                >
                  <option value={7}>Last 7 days</option>
                  <option value={28}>Last 4 weeks</option>
                  <option value={90}>Last 3 months</option>
                  <option value={0}>All time</option>
                </select>
                <select
                  value={muscleUserFilter}
                  onChange={(e) => setMuscleUserFilter(e.target.value)}
                  style={{ width: "auto" }}
                >
                  <option value="">Everyone</option>
                  {visibleNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {muscleHeatEmpty ? (
              <p className="muted">
                No trained-muscle data for this selection{muscleRangeDays > 0 ? " and period" : ""} yet
                {muscleRangeDays > 0 ? " — try widening it to All time." : "."}
              </p>
            ) : (
              <>
                <MuscleMap intensities={muscleIntensities} />
                <div className="row" style={{ gap: 8, marginTop: 10, alignItems: "center" }}>
                  <span className="muted" style={{ fontSize: 12 }}>
                    Untrained
                  </span>
                  <div
                    style={{
                      height: 8,
                      flex: 1,
                      maxWidth: 160,
                      borderRadius: 999,
                      background: "linear-gradient(to right, var(--stone), var(--ember))",
                    }}
                  />
                  <span className="muted" style={{ fontSize: 12 }}>
                    Most trained
                  </span>
                </div>
              </>
            )}
          </div>

          {muscleVolumeByPerson.length > 0 && (
            <div className="panel">
              <h3>Muscle group volume, by person</h3>
              <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>
                Same split as Muscle heat above (primary muscles count full, secondary at half), but compared
                side by side instead of collapsed into one figure. Top 8 muscles by combined volume, same date
                range as Muscle heat.
              </p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={muscleVolumeByPerson}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="muscle" tick={{ fontSize: 11 }} stroke="var(--ink-soft)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--ink-soft)" unit="kg" />
                  <Tooltip
                    contentStyle={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }}
                    formatter={(value: number, name: string) => [`${value.toFixed(0)} kg`, name]}
                  />
                  <Legend />
                  {visibleNames.map((name) => (
                    <Bar key={name} dataKey={name} fill={colorFor(name)} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {enriched.length > 0 && (
            <div className="panel">
              <div className="row between">
                <h3>Compare an exercise</h3>
                <select
                  value={selectedExercise}
                  onChange={(e) => setSelectedExercise(e.target.value)}
                  style={{ width: "auto" }}
                >
                  {exerciseOptions.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={exerciseComparisonDisplay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--ink-soft)" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="var(--ink-soft)"
                    unit={normalizeByBodyWeight ? "×BW" : "kg"}
                  />
                  <Tooltip
                    contentStyle={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }}
                    formatter={(value: number, name: string) => [
                      normalizeByBodyWeight ? `${value.toFixed(2)}×BW` : `${value.toFixed(0)} kg`,
                      name,
                    ]}
                  />
                  <Legend />
                  {visibleNames.map((name) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={colorFor(name)}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
