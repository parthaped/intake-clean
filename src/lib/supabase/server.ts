import "server-only";

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { requireSupabaseEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Returns a Supabase client bound to the request cookies. Use this in Server
 * Components, Server Actions, and Route Handlers when you want RLS enforced
 * for the current authenticated user.
 */
export async function getServerSupabase() {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set({ name, value, ...options });
          });
        } catch {
          // Called from a Server Component during render — safe to ignore;
          // middleware is responsible for refreshing the session cookie.
        }
      },
    },
  });
}
