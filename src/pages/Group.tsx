import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { supabase } from "../lib/supabaseClient";
import { setVolume } from "../lib/format";
import { MUSCLE_LABELS, type Muscle } from "../constants/muscles";

// Categorical palette — distinguishable in both light and dark, consistent
// with the app's ember/focus accent pair.
const PALETTE = ["#D9531E", "#1E6E62", "#4C6EF5", "#C2410C", "#7C5CBF", "#0E7490", "#B3261E", "#6B7280"];

interface SetRow {
  weight: number;
  reps: number;
  workout: { user_id: string; date: string } | null;
  exercise: { id: string; name: string; is_bodyweight: boolean; primary_muscles: Muscle[] } | null;
}

function isoWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export default function Group() {
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [bodyWeights, setBodyWeights] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<SetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExercise, setSelectedExercise] = useState<string>("");
  const [muscleUserFilter, setMuscleUserFilter] = useState<string>("");

  useEffect(() => {
    async function load() {
      const [{ data: profs }, { data: sets }, { data: weights }] = await Promise.all([
        supabase.from("profiles").select("id, name"),
        supabase
          .from("sets")
          .select("weight, reps, workout:workouts(user_id, date), exercise:exercises(id, name, is_bodyweight, primary_muscles)"),
        supabase.from("body_weight_logs").select("user_id, weight_kg, recorded_at").order("recorded_at", { ascending: false }),
      ]);

      const profMap: Record<string, string> = {};
      (profs ?? []).forEach((p) => (profMap[p.id] = p.name));
      setProfiles(profMap);

      const bwMap: Record<string, number> = {};
      (weights ?? []).forEach((w) => {
        if (!(w.user_id in bwMap)) bwMap[w.user_id] = w.weight_kg;
      });
      setBodyWeights(bwMap);

      setRows((sets as unknown as SetRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const enriched = useMemo(
    () =>
      rows
        .filter((r) => r.workout && r.exercise)
        .map((r) => ({
          userId: r.workout!.user_id,
          userName: profiles[r.workout!.user_id] ?? "Unknown",
          date: r.workout!.date,
          week: isoWeekLabel(r.workout!.date),
          exerciseId: r.exercise!.id,
          exerciseName: r.exercise!.name,
          primaryMuscles: r.exercise!.primary_muscles,
          volume: setVolume({
            isBodyweight: r.exercise!.is_bodyweight,
            weight: r.weight,
            reps: r.reps,
            bodyWeightKg: bodyWeights[r.workout!.user_id] ?? null,
          }),
        })),
    [rows, profiles, bodyWeights]
  );

  const userNames = useMemo(() => Array.from(new Set(Object.values(profiles))).sort(), [profiles]);

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

  // Muscle distribution (volume split evenly across an exercise's primary muscles)
  const muscleDistribution = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of enriched) {
      if (muscleUserFilter && r.userName !== muscleUserFilter) continue;
      if (r.primaryMuscles.length === 0) continue;
      const share = r.volume / r.primaryMuscles.length;
      for (const m of r.primaryMuscles) {
        totals.set(m, (totals.get(m) ?? 0) + share);
      }
    }
    return Array.from(totals.entries())
      .map(([muscle, value]) => ({ name: MUSCLE_LABELS[muscle as Muscle] ?? muscle, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [enriched, muscleUserFilter]);

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

  if (loading) return <p className="muted">Loading…</p>;
  if (enriched.length === 0)
    return (
      <p className="muted">
        Nothing to compare yet — either no workouts logged, or you're not connected with anyone. Head to{" "}
        <Link to="/profile">Profile</Link> to request access to a friend's data.
      </p>
    );

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1>Group</h1>

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

      <div className="panel">
        <div className="row between">
          <h3>Muscle distribution</h3>
          <select value={muscleUserFilter} onChange={(e) => setMuscleUserFilter(e.target.value)} style={{ width: "auto" }}>
            <option value="">Everyone</option>
            {userNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={muscleDistribution} dataKey="value" nameKey="name" outerRadius={110} label={{ fontSize: 11 }}>
              {muscleDistribution.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

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
    </div>
  );
}
