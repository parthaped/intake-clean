Feature: Human-friendly formatting helpers
  As a firm staff member viewing the dashboard
  I want byte sizes, dates, and names to render cleanly
  So that file lists and activity feeds are easy to scan.

  Scenario Outline: Files render their size in the smallest sensible unit
    Given an uploaded file of <bytes> bytes
    When the dashboard renders its size
    Then the formatted size is "<formatted>"

    Examples:
      | bytes      | formatted |
      | 0          | 0 B       |
      | 512        | 512 B     |
      | 1024       | 1 KB      |
      | 1572864    | 1.5 MB    |
      | 1073741824 | 1 GB      |

  Scenario: Invalid byte counts never crash the UI
    Given an uploaded file with a non-finite size
    When the dashboard renders its size
    Then the formatted size is "0 B"

  Scenario: Avatar falls back to a question mark for missing names
    Given a profile with no full name
    When we render the avatar initials
    Then the initials are "?"

  Scenario: Avatar uses up to two leading initials
    Given a profile named "Ada Lovelace"
    When we render the avatar initials
    Then the initials are "AL"

  Scenario: Avatar uppercases the result
    Given a profile named "ada lovelace"
    When we render the avatar initials
    Then the initials are "AL"

  Scenario: Long matter names truncate with an ellipsis
    Given the matter name "This is a really long matter name that should be cut off"
    When we truncate it to 20 characters
    Then the displayed name has length 20
    And the displayed name ends with "…"
