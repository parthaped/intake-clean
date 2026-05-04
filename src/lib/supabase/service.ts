import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/types/database";

let cached: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Service-role Supabase client. Bypasses RLS and must NEVER be imported by a
 * client component. Use it for token-based public flows (the upload portal),
 * background processing jobs, and webhook handlers.
 */
export function getServiceSupabase() {
  if (cached) return cached;

  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      "Supabase secret key is required for server-side operations. Set SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }

  cached = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
