Feature: Firm slug generation during onboarding
  As a new firm signing up
  I want my firm name to become a clean URL slug
  So that public links to my onboarding namespace look professional.

  Scenario: A typical firm name slugifies cleanly
    Given a firm named "Smith & Jones, LLC"
    When the firm is onboarded
    Then the generated slug is "smith-jones-llc"

  Scenario: Leading and trailing whitespace is trimmed
    Given a firm named "   Acme Law   "
    When the firm is onboarded
    Then the generated slug is "acme-law"

  Scenario: Digits and existing dashes are preserved
    Given a firm named "Plan 2024 - Solo"
    When the firm is onboarded
    Then the generated slug is "plan-2024-solo"

  Scenario: A pure-punctuation firm name produces an empty slug
    # The onboarding flow falls back to a userId-prefixed slug in this case;
    # here we just assert the slugify primitive's output.
    Given a firm named "!!!"
    When the firm is onboarded
    Then the generated slug is ""
