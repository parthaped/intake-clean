"use client";

import { createBrowserClient } from "@supabase/ssr";

import { requireSupabaseEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export function getBrowserSupabase() {
  const { url, anonKey } = requireSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
