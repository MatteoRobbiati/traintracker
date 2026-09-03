// Hand-written types matching supabase/schema.sql. Keep in sync if the schema
// changes (or swap for `supabase gen types typescript` output later).
//
// These are `type` aliases rather than `interface`s on purpose: an
// `interface` doesn't structurally satisfy an index-signature type like
// `Record<string, unknown>` under `strict`, which is exactly what
// supabase-js's generic `Database` constraint requires for each table's Row.
import type { Muscle } from "../constants/muscles";

export type Profile = {
  id: string;
  name: string;
  last_seen: string;
  created_at: string;
};

export type BodyWeightLog = {
  id: string;
  user_id: string;
  weight_kg: number;
  recorded_at: string;
};

export type Exercise = {
  id: string;
  name: string;
  description: string | null;
  primary_muscles: Muscle[];
  secondary_muscles: Muscle[];
  is_bodyweight: boolean;
  created_by: string | null;
  created_at: string;
};

export type WorkoutType = "strength" | "endurance";

export type Workout = {
  id: string;
  user_id: string;
  date: string;
  notes: string | null;
  warmup: string | null;
  duration_minutes: number | null;
  workout_type: WorkoutType;
  created_at: string;
};

export type EnduranceDiscipline = "boulder" | "rope" | "both";

export type EnduranceDetails = {
  workout_id: string;
  sport: string;
  discipline: string | null;
  distance_km: number | null;
  session_detail: string | null;
};

export type WorkoutSet = {
  id: string;
  workout_id: string;
  exercise_id: string;
  weight: number;
  reps: number;
  rest_time_seconds: number | null;
  set_order: number;
};

export type ConnectionStatus = "pending" | "accepted" | "rejected";

export type Connection = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: ConnectionStatus;
  created_at: string;
  responded_at: string | null;
};

export type Message = {
  id: string;
  sender_id: string;
  room: string;
  body: string;
  created_at: string;
};

// A reusable session plan -- same shape as Workout+EnduranceDetails (minus
// `date`), private per user, never shared with the group.
export type WorkoutTemplate = {
  id: string;
  user_id: string;
  name: string;
  workout_type: WorkoutType;
  warmup: string | null;
  notes: string | null;
  duration_minutes: number | null;
  sport: string | null;
  discipline: string | null;
  distance_km: number | null;
  session_detail: string | null;
  created_at: string;
};

export type TemplateSet = {
  id: string;
  template_id: string;
  exercise_id: string;
  weight: number;
  reps: number;
  rest_time_seconds: number | null;
  set_order: number;
};

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, Pick<Profile, "id" | "name"> & Partial<Profile>>;
      body_weight_logs: Table<
        BodyWeightLog,
        Pick<BodyWeightLog, "user_id" | "weight_kg"> & Partial<BodyWeightLog>
      >;
      exercises: Table<Exercise, Pick<Exercise, "name"> & Partial<Exercise>>;
      workouts: Table<Workout, Pick<Workout, "user_id"> & Partial<Workout>>;
      sets: Table<
        WorkoutSet,
        Pick<WorkoutSet, "workout_id" | "exercise_id" | "reps"> & Partial<WorkoutSet>
      >;
      connections: Table<
        Connection,
        Pick<Connection, "requester_id" | "addressee_id"> & Partial<Connection>
      >;
      messages: Table<Message, Pick<Message, "sender_id" | "body"> & Partial<Message>>;
      endurance_details: Table<
        EnduranceDetails,
        Pick<EnduranceDetails, "workout_id" | "sport"> & Partial<EnduranceDetails>
      >;
      workout_templates: Table<
        WorkoutTemplate,
        Pick<WorkoutTemplate, "user_id" | "name"> & Partial<WorkoutTemplate>
      >;
      template_sets: Table<
        TemplateSet,
        Pick<TemplateSet, "template_id" | "exercise_id" | "reps"> & Partial<TemplateSet>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      touch_last_seen: {
        Args: Record<string, never>;
        Returns: void;
      };
      is_connected: {
        Args: { target_id: string };
        Returns: boolean;
      };
    };
  };
};
