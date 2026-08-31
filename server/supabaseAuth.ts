import type { Request } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
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

type SupabaseJwtClaims = JWTPayload & {
  email?: string | null;
  user_metadata?: { full_name?: string | null; name?: string | null };
};

function getBearerToken(req: Pick<Request, "headers">) {
  const value = req.headers.authorization;
  return typeof value === "string" && value.startsWith("Bearer ")
    ? value.slice(7).trim()
    : undefined;
}

// createRemoteJWKSet 內建快取與 cooldown，同一組金鑰不會每次請求都重新下載，
// 因此以本地驗簽取代先前「每個受保護請求都呼叫 Supabase /auth/v1/user」的做法，
// 省下一次網路往返；金鑰快取以 supabaseUrl 為 key，避免環境變數變動時使用到舊的 JWKS。
let cachedJwks: { url: string; jwks: ReturnType<typeof createRemoteJWKSet> } | undefined;

function getJwks(supabaseUrl: string) {
  if (cachedJwks?.url !== supabaseUrl) {
    cachedJwks = { url: supabaseUrl, jwks: createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)) };
  }
  return cachedJwks.jwks;
}

/**
 * 優先以 Supabase 專案的 JWKS 公鑰在本地驗證 access token 簽章與 iss/aud/exp，
 * 完全不需對 Supabase 發出網路請求；只有在專案尚未啟用非對稱簽章金鑰
 * （新專案預設會有 JWKS，舊專案僅有共用密鑰）時才退回舊的 /auth/v1/user 內省法。
 * 兩種路徑都不可信任 JWT 內的 role／user_metadata 來判定教師權限，角色一律另外查 profiles。
 */
async function verifyAccessToken(token: string, supabaseUrl: string): Promise<SupabaseJwtClaims | null> {
  try {
    const jwks = getJwks(supabaseUrl);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${supabaseUrl}/auth/v1`,
      audience: "authenticated",
    });
    return payload as SupabaseJwtClaims;
  } catch (error) {
    // JWKS 端點不存在（舊專案僅有 HS256 共用密鑰）或簽章驗證失敗，都會落到這裡。
    // 無論何者都不記錄 token 內容，避免將憑證寫入 log。
    console.warn("Local JWKS verification unavailable or failed, falling back to introspection", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return null;
  }
}

async function introspectAccessToken(token: string, supabaseUrl: string): Promise<SupabaseJwtClaims | null> {
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!publishableKey) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const authUser = await response.json() as {
    id?: string; email?: string | null;
    user_metadata?: { full_name?: string | null; name?: string | null };
    created_at?: string; updated_at?: string; last_sign_in_at?: string;
  };
  if (!authUser.id) return null;
  return {
    sub: authUser.id, email: authUser.email ?? null, user_metadata: authUser.user_metadata,
    iat: authUser.created_at ? Math.floor(new Date(authUser.created_at).getTime() / 1000) : undefined,
  };
}

/**
 * 驗證 access token 後，以 server-only key 讀取 profiles 的角色。
 * 不可由 JWT user_metadata 或前端傳來的 role 判定教師權限。
 */
export async function authenticateSupabaseRequest(
  req: Pick<Request, "headers">
): Promise<SupabaseAuthenticatedUser | null> {
  const token = getBearerToken(req);
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!token || !url) return null;

  const claims = (await verifyAccessToken(token, url)) ?? (await introspectAccessToken(token, url));
  if (!claims?.sub) return null;

  const { data: profile, error } = await (getSupabaseServerClient() as any)
    .from("profiles")
    .select("display_name, role")
    .eq("id", claims.sub)
    .maybeSingle();
  if (error || !profile) return null;

  const now = new Date();
  const issuedAt = typeof claims.iat === "number" ? new Date(claims.iat * 1000) : now;
  return {
    id: claims.sub,
    openId: claims.sub,
    email: claims.email ?? null,
    name: profile.display_name ?? claims.user_metadata?.full_name ?? claims.user_metadata?.name ?? claims.email ?? null,
    loginMethod: "supabase",
    role: profile.role === "admin" ? "admin" : profile.role === "teacher" ? "teacher" : "user",
    createdAt: issuedAt,
    updatedAt: now,
    lastSignedIn: issuedAt,
  };
}

export { getBearerToken };
