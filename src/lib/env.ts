/**
 * Centralised access to environment variables. Each property is computed lazily
 * so that the build doesn't fail when optional integrations are not configured.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "") return undefined;
  return value;
}

export const env = {
  appUrl: read("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",

  supabaseUrl: read("NEXT_PUBLIC_SUPABASE_URL"),
  // Accept the new publishable key naming (recommended) or the legacy anon key.
  supabaseAnonKey:
    read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? read("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  // Accept the new secret key naming or the legacy service-role key.
  supabaseServiceRoleKey:
    read("SUPABASE_SECRET_KEY") ?? read("SUPABASE_SERVICE_ROLE_KEY"),

  resendApiKey: read("RESEND_API_KEY"),
  resendFromEmail: read("RESEND_FROM_EMAIL") ?? "IntakeClean <onboarding@resend.dev>",

  twilioAccountSid: read("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: read("TWILIO_AUTH_TOKEN"),
  twilioPhoneNumber: read("TWILIO_PHONE_NUMBER"),

  stripeSecretKey: read("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: read("STRIPE_WEBHOOK_SECRET"),
  stripePublishableKey: read("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
  stripePriceStarter: read("STRIPE_PRICE_STARTER"),
  stripePriceSolo: read("STRIPE_PRICE_SOLO"),
  stripePriceFirm: read("STRIPE_PRICE_FIRM"),

  googleDocAiProjectId: read("GOOGLE_DOCUMENT_AI_PROJECT_ID"),
  googleDocAiLocation: read("GOOGLE_DOCUMENT_AI_LOCATION") ?? "us",
  googleDocAiProcessorId: read("GOOGLE_DOCUMENT_AI_PROCESSOR_ID"),
  googleApplicationCredentialsJson: read("GOOGLE_APPLICATION_CREDENTIALS_JSON"),

  openAiApiKey: read("OPENAI_API_KEY"),

  devBypassBilling: read("DEV_BYPASS_BILLING") === "true",
  adminDebug: read("ADMIN_DEBUG") === "true",
} as const;

export const integrations = {
  hasSupabase: Boolean(env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceRoleKey),
  hasResend: Boolean(env.resendApiKey),
  hasTwilio: Boolean(env.twilioAccountSid && env.twilioAuthToken && env.twilioPhoneNumber),
  hasStripe: Boolean(env.stripeSecretKey && env.stripePublishableKey),
  hasGoogleDocAi: Boolean(
    env.googleDocAiProjectId && env.googleDocAiProcessorId && env.googleApplicationCredentialsJson,
  ),
  hasOpenAi: Boolean(env.openAiApiKey),
};

/** Throw a clear, descriptive error if Supabase isn't configured. */
export function requireSupabaseEnv(): { url: string; anonKey: string } {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      "Supabase env not configured. Set NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }
  return { url: env.supabaseUrl, anonKey: env.supabaseAnonKey };
}
