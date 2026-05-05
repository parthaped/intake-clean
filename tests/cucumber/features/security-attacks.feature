Feature: Server-side hardening against typical attacker behaviour
  As a firm storing client passports, IDs, and SSNs
  I want every server-side surface to refuse hostile requests
  So that an attacker reaching our domain cannot read or write client data.

  # Each scenario reproduces a textbook attack against IntakeClean and asserts
  # that the relevant security control fires *before* the attacker's payload
  # reaches our backend, our database, or our downstream third-party services.

  Scenario: Attacker tries to brute-force an upload token
    Given the attacker has discovered "/api/upload/" but does not know any valid token
    When they attempt 50 uploads from the same IP within 10 seconds
    Then at least 40 of those attempts are rejected with status 429
    And no successful upload reaches storage

  Scenario: Attacker forges a Twilio inbound webhook
    Given a configured Twilio auth token "shhhh-not-the-real-token"
    When the attacker POSTs a forged inbound SMS without a signature
    Then the request is rejected as missing the Twilio signature
    When the attacker POSTs the same body with a random signature
    Then the request is rejected as having an invalid Twilio signature
    When the attacker tampers with the body after a legitimate signature was issued
    Then the request is rejected as having an invalid Twilio signature

  Scenario: Attacker grinds the cron drainer endpoint
    Given the application has a CRON_SECRET configured as "rotate-me-quarterly"
    When the attacker probes "/api/process/run" with no Authorization header
    Then the cron auth check returns false
    When the attacker probes with "Bearer wrong-but-same-length-as-secrettttt"
    Then the cron auth check returns false
    When Vercel Cron sends "Bearer rotate-me-quarterly"
    Then the cron auth check returns true

  Scenario: Attacker uploads a file disguised as a PDF
    Given the upload endpoint accepts "application/pdf" and "image/png"
    When the attacker submits a file claiming "application/pdf" whose body is HTML
    Then the upload is rejected because magic-byte sniffing detected non-PDF content
    When the attacker submits a Windows executable claiming "image/png"
    Then the upload is rejected because magic-byte sniffing detected non-PNG content

  Scenario: Attacker plants a JavaScript payload in an uploaded PDF
    Given the attacker has crafted a PDF with /OpenAction -> /JavaScript firing on open
    When the export pipeline sanitises the PDF
    Then the catalog no longer contains /OpenAction or /JS
    And the saved bytes no longer contain the literal "app.alert('pwned')"

  Scenario: Attacker pivots an open-redirect via the auth callback ?next= param
    Given the user clicks a tampered Supabase recovery link
    When the next parameter is "//evil.example.com/phish"
    Then safeNextPath returns null and the user lands on the in-app fallback
    When the next parameter is "/dashboard/settings"
    Then safeNextPath returns "/dashboard/settings"

  Scenario: OCR text containing PII is scrubbed before going to a third-party model
    Given an OCR text "Client Jane Doe SSN 123-45-6789 phone 415-555-0123"
    When the redactor runs over the text
    Then no part of the original SSN, phone, or email survives in the output

  Scenario: Sensitive request data does not leak into error monitoring
    Given a Sentry event captured during an upload-token API call
    When the scrubber runs over the event
    Then the Authorization header is replaced with "[redacted]"
    And the upload token in the URL is replaced with "[token]"
    And the request body is replaced with "[scrubbed]"
