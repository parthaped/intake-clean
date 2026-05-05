import { setWorldConstructor, World, type IWorldOptions } from "@cucumber/cucumber";

import type { SendEmailResult } from "@/lib/messaging/email";
import type { ChannelPlan, PreferredContact } from "@/lib/messaging/send-request";
import type { SendSmsResult } from "@/lib/messaging/sms";
import type { RenderedMessage, TemplateContext } from "@/lib/messaging/templates";
import type { PlanDefinition } from "@/lib/constants";
import type { MessageStatus } from "@/types/database";

/**
 * Shared, mutable scenario state. Cucumber instantiates a fresh World per
 * scenario, so it's safe to keep partial inputs and rendered outputs here
 * without leaking across scenarios.
 */
export class IntakeWorld extends World {
  bytes?: number;
  fullName: string | null = null;
  matterName?: string;
  truncated?: string;
  initialsValue?: string;
  formattedSize?: string;

  firmName?: string;
  slug?: string;

  templateContext: Partial<TemplateContext> = {};
  rendered?: RenderedMessage;

  selectedPlan?: PlanDefinition;

  // ----- send-request-flow.feature scratchpad -----
  client?: {
    fullName: string;
    email: string | null;
    phone: string | null;
    preferredContact: PreferredContact;
  };
  channelPlan?: ChannelPlan;
  emailResult?: SendEmailResult;
  smsResult?: SendSmsResult;
  rolledUpStatus?: MessageStatus;

  // ----- security-attacks.feature scratchpad -----
  /** Outcomes of repeated rate-limit attempts (true = allowed, false = denied). */
  rateLimitOutcomes: boolean[] = [];
  /** Result of a Twilio signature check, set by the steps. */
  twilioVerifyOk?: boolean;
  twilioVerifyReason?: string;
  /** Result of a CRON auth check. */
  cronAuthOk?: boolean;
  cronSecret?: string;
  /** Result of an upload validation. */
  uploadOk?: boolean;
  uploadStatus?: number;
  uploadDetectedMime?: string;
  /** Result of a safeNextPath check. */
  safeNextResult?: string | null;
  /** Result of the PII redactor. */
  redactedText?: string;
  redactedTotal?: number;
  /** Sentry-style scrubber outcome. */
  scrubbedEvent?: {
    request?: { url?: string; headers?: Record<string, string>; data?: unknown };
  };

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(IntakeWorld);
