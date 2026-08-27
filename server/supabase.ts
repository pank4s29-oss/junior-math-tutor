import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

type TeacherUnitRow = {
  id: string;
  grade: "seven" | "eight" | "nine";
  unit_key: string;
  name: string;
  teaching_rules: string;
  is_approved: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

type ApprovedContentRow = {
  id: string;
  unit_id: string;
  type: "concept" | "example" | "misconception" | "rubric";
  title: string;
  body: string;
  is_approved: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

type TeacherEscalationRow = {
  id: string;
  attempt_id: string;
  reason: "wrong_answer" | "unclear_photo" | "teacher_help" | "safety_concern";
  detail: string | null;
  priority: string;
  status: "new" | "reviewing" | "resolved";
  notification_delivered: boolean;
  created_at: string;
  updated_at: string;
};

export type SupabaseDatabase = {
  public: {
    Tables: {
      teacher_units: {
        Row: TeacherUnitRow;
        Insert: {
          id?: string;
          grade: TeacherUnitRow["grade"];
          unit_key: string;
          name: string;
          teaching_rules: string;
          is_approved?: boolean;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<TeacherUnitRow, "id" | "created_at">>;
        Relationships: [];
      };
      approved_contents: {
        Row: ApprovedContentRow;
        Insert: {
          id?: string;
          unit_id: string;
          type: ApprovedContentRow["type"];
          title: string;
          body: string;
          is_approved?: boolean;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ApprovedContentRow, "id" | "unit_id" | "created_at">>;
        Relationships: [];
      };
      teacher_escalations: {
        Row: TeacherEscalationRow;
        Insert: {
          id?: string;
          attempt_id: string;
          reason: TeacherEscalationRow["reason"];
          detail?: string | null;
          priority?: string;
          status?: TeacherEscalationRow["status"];
          notification_delivered?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<TeacherEscalationRow, "id" | "attempt_id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      grade_level: TeacherUnitRow["grade"];
      content_type: ApprovedContentRow["type"];
    };
    CompositeTypes: Record<string, never>;
  };
};

/**
 * Server-only Supabase client. The secret key bypasses RLS and must never be
 * imported by client code or exposed through a VITE_/NEXT_PUBLIC_ variable.
 */
let serverClient: SupabaseClient<SupabaseDatabase> | undefined;

const supabaseServerFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  // A new-style `sb_secret_` key is an apikey, not an OAuth Bearer token.
  // Supabase SDK adds the latter as a fallback; removing it keeps all server
  // requests on the documented apikey route and avoids intermittent JWT iat checks.
  headers.delete("authorization");
  return fetch(input, { ...init, headers });
};

export function getSupabaseServerClient() {
  if (!ENV.supabaseUrl || !ENV.supabaseSecretKey) {
    throw new Error("Supabase 伺服器端連線尚未設定，請確認 SUPABASE_URL 與 SUPABASE_SECRET_KEY。");
  }

  if (!serverClient) {
    serverClient = createClient<SupabaseDatabase>(ENV.supabaseUrl, ENV.supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { fetch: supabaseServerFetch },
    });
  }

  return serverClient;
}
