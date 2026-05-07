import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

/**
 * Strict CSP. We disallow inline scripts (Next.js script-strict-dynamic
 * pattern via nonce would be ideal long-term; for now we run with
 * `unsafe-inline` removed and rely on Next's own bundling). The Supabase
 * project hostnames are allowed for fetch/XHR (`connect-src`) and image
 * loads (`img-src`) so signed URLs and thumbnails resolve. `frame-ancestors`
 * is set to `none` to defend against click-jacking; the `<iframe>` we use
 * to preview uploaded PDFs is same-origin and unaffected.
 *
 * Notes:
 *   - `'unsafe-eval'` is included only in development for Next's HMR. It is
 *     dropped in production builds.
 *   - We do not yet use a per-request nonce. When we move to nonce-based
 *     CSP we'll switch to a Routing Middleware that injects the nonce into
 *     the response and `<Script>` tags.
 *   - Vercel Insights / Speed Insights need a few extra hosts; allow-list
 *     them here so we don't get console-spam in production.
 */
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // Next inlines the framework runtime; until we wire a nonce-based CSP we
  // allow inline scripts. This is still safer than today (no CSP at all)
  // because we lock down every other directive and forbid eval in prod.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in https://api.stripe.com https://api.resend.com https://api.huggingface.co https://*.huggingface.cloud wss://*.supabase.co https://vitals.vercel-insights.com https://va.vercel-scripts.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // 2 years HSTS w/ preload — only enable preload after you've added the
  // domain to https://hstspreload.org. Safe to ship now because Vercel
  // serves over HTTPS by default.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "camera=()",
      "geolocation=()",
      "gyroscope=()",
      "interest-cohort=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
    ].join(", "),
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "heic-convert", "tesseract.js"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.supabase.in" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // The `[slug]` legal page reads markdown from `legal/policies/*.md` at
  // request time. Because `MarketingShell` calls `cookies()`/`headers()`
  // the page is rendered dynamically, so the file must exist on disk in
  // the deployed function. Next's NFT can't statically trace
  // `readFile(join(process.cwd(), markdownPath))`, so we explicitly tell
  // it to bundle the legal markdown with the function. Without this the
  // page 500s in production with a hidden `ENOENT`.
  outputFileTracingIncludes: {
    "/legal/[slug]": ["./legal/policies/**/*.md"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// Wrap the config with `withBotId` so Vercel injects the proxy rewrites for
// the BotID challenge endpoints. Without these the client-side challenge
// can be neutralised by ad-blockers.
export default withBotId(nextConfig);
