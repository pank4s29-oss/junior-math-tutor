import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { authenticateSupabaseRequest, type SupabaseAuthenticatedUser } from "../supabaseAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: SupabaseAuthenticatedUser | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: SupabaseAuthenticatedUser | null = null;

  try {
    user = await authenticateSupabaseRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
