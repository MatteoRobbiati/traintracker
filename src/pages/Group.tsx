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
import { formatDate, setVolume } from "../lib/format";
import { isBetterSet, type BestSetCandidate } from "../lib/personalBest";
import { computeStreak } from "../lib/streak";
import MuscleMap from "../components/MuscleMap";
import type { Muscle } from "../constants/muscles";

// Categorical palette — distinguishable in both light and dark, consistent
// with the app's ember/focus accent pair.
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

export default function Group() {
  // profileNames is just a lookup dict (id -> name) — profiles are visible
  // to everyone, but we must never build a UI list (legend, dropdown) from
  // its full keyset, only from ids that already appear in RLS-gated rows
  // below (sets/weight logs). Otherwise names of non-connected people leak
  // into chart legends even though their actual data stays hidden.
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<SetRow[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExercise, setSelectedExercise] = useState<string>("");
  const [muscleUserFilter, setMuscleUserFilter] = useState<string>("");
  const [muscleRangeDays, setMuscleRangeDays] = useState<number>(28);

  useEffect(() => {
    async function load() {
      const [{ data: profs }, { data: sets }, { data: weights }] = await Promise.all([
        supabase.from("profiles").select("id, name"),
        supabase
          .from("sets")
          .select(
            "workout_id, weight, reps, workout:workouts(user_id, date), exercise:exercises(id, name, is_bodyweight, primary_muscles, secondary_muscles)"
          ),
        supabase
          .from("body_weight_logs")
          .select("user_id, weight_kg, recorded_at")
          .order("recorded_at", { ascending: false }),
      ]);

      const profMap: Record<string, string> = {};
      (profs ?? []).forEach((p) => (profMap[p.id] = p.name));
      setProfileNames(profMap);

      setRows((sets as unknown as SetRow[]) ?? []);
      setWeightLogs(weights ?? []);
      setLoading(false);
    }
    load();
  }, []);

  // Latest weight per user, for bodyweight-exercise volume — weightLogs is
  // already ordered newest-first.
  const latestBodyWeight = useMemo(() => {
    const map: Record<string, number> = {};
    for (const w of weightLogs) {
      if (!(w.user_id in map)) map[w.user_id] = w.weight_kg;
    }
    return map;
  }, [weightLogs]);

  const enriched = useMemo(
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
            isBodyweight: r.exercise!.is_bodyweight,
            weight: r.weight,
            reps: r.reps,
            bodyWeightKg: latestBodyWeight[r.workout!.user_id] ?? null,
          }),
        })),
    [rows, profileNames, latestBodyWeight]
  );

  // Every id we're actually allowed to see (RLS already enforced this on
  // the queries above) — the only safe source for "who shows up in charts".
  const userNames = useMemo(() => {
    const ids = new Set<string>([...enriched.map((r) => r.userId), ...weightLogs.map((w) => w.user_id)]);
    return Array.from(ids)
      .map((id) => profileNames[id] ?? "Unknown")
      .sort();
  }, [enriched, weightLogs, profileNames]);

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

  // Body weight over time, one line per visible person
  const weightSeries = useMemo(() => {
    const byDate = new Map<string, Record<string, number>>();
    for (const w of weightLogs) {
      const name = profileNames[w.user_id] ?? "Unknown";
      const date = w.recorded_at.slice(0, 10);
      const entry = byDate.get(date) ?? {};
      entry[name] = w.weight_kg;
      byDate.set(date, entry);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }));
  }, [weightLogs, profileNames]);

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

  // Group volume records: best single-session total per exercise -- a
  // separate kind of record from "massimale" above (see
  // src/lib/personalBest.ts), so a many-lighter-sets session can hold its
  // own record instead of being invisible next to the heaviest single set.
  const groupVolumeRecords = useMemo(() => {
    const byExercise = new Map<string, { workoutId: string; date: string; volume: number; holder: string }[]>();
    for (const r of enriched) {
      const list = byExercise.get(r.exerciseName) ?? [];
      list.push({ workoutId: r.workoutId, date: r.date, volume: r.volume, holder: r.userName });
      byExercise.set(r.exerciseName, list);
    }
    const result: { exerciseName: string; volume: number; holder: string; date: string }[] = [];
    for (const [exerciseName, sets] of byExercise) {
      const bySession = new Map<string, { volume: number; date: string; holder: string }>();
      for (const s of sets) {
        const key = `${s.holder}|${s.workoutId}`;
        const entry = bySession.get(key);
        if (entry) entry.volume += s.volume;
        else bySession.set(key, { volume: s.volume, date: s.date, holder: s.holder });
      }
      let best: { volume: number; date: string; holder: string } | null = null;
      for (const v of bySession.values()) {
        if (!best || v.volume > best.volume) best = v;
      }
      if (best) result.push({ exerciseName, ...best });
    }
    return result.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
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
  if (enriched.length === 0 && weightLogs.length === 0)
    return (
      <p className="muted">
        Nothing to compare yet — either no workouts/weight logged, or you're not connected with anyone. Head
        to <Link to="/profile">Profile</Link> to request access to a friend's data.
      </p>
    );

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1>Group</h1>

      {enriched.length > 0 && (
        <div className="panel">
          <h3 style={{ marginBottom: 12 }}>✨ Highlights</h3>
          <div className="highlight-grid">
            {highlights.mostActive && (
              <div className="highlight-card">
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>🏆 Most active (7d)</p>
                <h2 style={{ margin: 0 }}>{highlights.mostActive.name}</h2>
                <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
                  {highlights.mostActive.count} workout day{highlights.mostActive.count === 1 ? "" : "s"}
                </p>
              </div>
            )}
            {highlights.longestStreak && (
              <div className="highlight-card">
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
              <div className="highlight-card">
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
        </div>
      )}

      {enriched.length > 0 && (
        <>
          <div className="panel">
            <h3>Weekly volume per person</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={weeklyVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="var(--ink-soft)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--ink-soft)" />
                <Tooltip contentStyle={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }} />
                <Legend />
                {userNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={PALETTE[i % PALETTE.length]}
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
                  {workoutFrequency.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {weightLogs.length > 0 && (
        <div className="panel">
          <h3>Body weight over time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={weightSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--ink-soft)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--ink-soft)" domain={["auto", "auto"]} unit="kg" />
              <Tooltip contentStyle={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }} />
              <Legend />
              {userNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
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
              <select value={muscleUserFilter} onChange={(e) => setMuscleUserFilter(e.target.value)} style={{ width: "auto" }}>
                <option value="">Everyone</option>
                {userNames.map((n) => (
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

      {enriched.length > 0 && (
        <div className="panel">
          <div className="row between">
            <h3>Compare an exercise</h3>
            <select value={selectedExercise} onChange={(e) => setSelectedExercise(e.target.value)} style={{ width: "auto" }}>
              {exerciseOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={exerciseComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--ink-soft)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--ink-soft)" />
              <Tooltip contentStyle={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }} />
              <Legend />
              {userNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {groupRecords.length > 0 && (
        <div className="panel">
          <h3>Group records — massimale</h3>
          <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>
            Best single set ever logged, per exercise, among everyone whose data you can see.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Exercise</th>
                  <th>Best</th>
                  <th>Held by</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {groupRecords.map((r) => (
                  <tr key={r.exerciseName}>
                    <td>{r.exerciseName}</td>
                    <td>
                      {r.isBodyweight
                        ? `${r.best.reps} reps${r.best.weight ? ` (${r.best.weight > 0 ? "+" : ""}${r.best.weight} kg)` : ""}`
                        : `${r.best.weight} kg × ${r.best.reps}`}
                    </td>
                    <td>{r.holder}</td>
                    <td className="muted">{formatDate(r.best.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {groupVolumeRecords.length > 0 && (
        <div className="panel">
          <h3>Group records — best session volume</h3>
          <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>
            Highest total volume for that exercise in a single session — different from "massimale" above: a
            session of many lighter sets can out-volume one heavy single.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Exercise</th>
                  <th>Best volume</th>
                  <th>Held by</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {groupVolumeRecords.map((r) => (
                  <tr key={r.exerciseName}>
                    <td>{r.exerciseName}</td>
                    <td>{r.volume.toFixed(0)} kg</td>
                    <td>{r.holder}</td>
                    <td className="muted">{formatDate(r.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
