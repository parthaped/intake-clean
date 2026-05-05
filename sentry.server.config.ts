import * as Sentry from "@sentry/nextjs";

import { scrubEvent } from "@/lib/observability/scrub";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubEvent(event);
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "http" && typeof breadcrumb.data?.body === "string") {
        breadcrumb.data.body = "[scrubbed]";
      }
      return breadcrumb;
    },
  });
}
