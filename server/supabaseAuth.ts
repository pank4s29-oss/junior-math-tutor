import type { Request } from "express";
import { getSupabaseServerClient } from "./supabase";

export type SupabaseAuthenticatedUser = {
  id: string;
  openId: string;
  email: string | null;
  name: string | null;
  loginMethod: "supabase";
  role: "user" | "teacher" | "admin";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

function getBearerToken(req: Pick<Request, "headers">) {
  const value = req.headers.authorization;
  return typeof value === "string" && value.startsWith("Bearer ")
    ? value.slice(7).trim()
    : undefined;
}

/**
 * 透過 Supabase Auth `/user` 端點驗證 access token，再以 server-only key 讀取
 * profiles 的角色。不可由 JWT user_metadata 或前端傳來的 role 判定教師權限。
 */
export async function authenticateSupabaseRequest(
  req: Pick<Request, "headers">
): Promise<SupabaseAuthenticatedUser | null> {
  const token = getBearerToken(req);
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !publishableKey) return null;

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publishableKey, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;

  const authUser = await response.json() as {
    id?: string;
    email?: string | null;
    user_metadata?: { full_name?: string | null; name?: string | null };
    created_at?: string;
    updated_at?: string;
    last_sign_in_at?: string;
  };
  if (!authUser.id) return null;

  const { data: profile, error } = await (getSupabaseServerClient() as any)
    .from("profiles")
    .select("display_name, role")
    .eq("id", authUser.id)
    .maybeSingle();
  if (error || !profile) return null;

  const now = new Date();
  return {
    id: authUser.id,
    openId: authUser.id,
    email: authUser.email ?? null,
    name: profile.display_name ?? authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? authUser.email ?? null,
    loginMethod: "supabase",
    role: profile.role === "admin" ? "admin" : profile.role === "teacher" ? "teacher" : "user",
    createdAt: authUser.created_at ? new Date(authUser.created_at) : now,
    updatedAt: authUser.updated_at ? new Date(authUser.updated_at) : now,
    lastSignedIn: authUser.last_sign_in_at ? new Date(authUser.last_sign_in_at) : now,
  };
}

export { getBearerToken };
