Feature: Client messaging templates
  As a firm sending document requests to a client
  I want every email and SMS to render with no leftover {placeholders}
  So that clients receive professional, complete messages.

  Background:
    Given the firm "Acme Law" is requesting documents from "Jane Doe" for matter "Estate of John Doe"
    And the upload link is "https://intakeclean.test/u/abc123"

  Scenario: Initial outreach addresses the client and includes the upload link
    When we render the initial outreach message
    Then the email subject is "Acme Law needs documents for Estate of John Doe"
    And the email body greets the client by name
    And the email body and SMS body both contain the upload link
    And no message contains an unresolved placeholder

  Scenario: Reminder uses the friendly-reminder subject line
    When we render the reminder message
    Then the email subject is "Friendly reminder: documents needed for Estate of John Doe"
    And the email body and SMS body both contain the upload link
    And no message contains an unresolved placeholder

  Scenario: Re-upload requests interpolate the item name and reason
    When we render a re-upload request for "Driver's License" because "the back side is missing"
    Then the email body contains "Item: Driver's License"
    And the email body contains "Reason: the back side is missing"
    And the SMS body contains "Driver's License"
    And no message contains an unresolved placeholder

  Scenario: Completion message thanks the client and omits the upload link
    When we render the completion message
    Then the email body and SMS body both omit the upload link
    And the SMS body contains "Jane Doe"
    And no message contains an unresolved placeholder
