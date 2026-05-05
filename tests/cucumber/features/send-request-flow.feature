Feature: Sending document-request messages to clients
  As a firm sending a document request to a client
  I want the right channels to fire based on the client's preferences and contact info
  And I want the rolled-up status to honestly reflect what happened
  So that staff trust the dashboard and clients only get messages they opted into.

  Background:
    Given the firm "Acme Law" is requesting documents from "Jane Doe" for matter "Estate of John Doe"
    And the upload link is "https://intakeclean.test/u/abc123"

  Scenario: Email-only client with an email address on file
    Given the client prefers "email" and has email "jane@example.test" and phone "+15551234567"
    When we plan the dispatch and send the initial outreach
    Then email is sent
    And SMS is not sent
    And the rolled-up request status is "sent_mock"
    And neither the email nor the SMS contains an unresolved placeholder

  Scenario: SMS-only client with a phone number on file
    Given the client prefers "sms" and has email "jane@example.test" and phone "+15551234567"
    When we plan the dispatch and send the initial outreach
    Then SMS is sent
    And email is not sent
    And the rolled-up request status is "sent_mock"

  Scenario: Client opted into both channels with both contacts on file
    Given the client prefers "both" and has email "jane@example.test" and phone "+15551234567"
    When we plan the dispatch and send the initial outreach
    Then email is sent
    And SMS is sent
    And the rolled-up request status is "sent_mock"

  Scenario: Client opted into both but only has an email
    Given the client prefers "both" and has email "jane@example.test" and phone ""
    When we plan the dispatch and send the initial outreach
    Then email is sent
    And SMS is not sent
    And the rolled-up request status is "sent_mock"

  Scenario: Client opted into email but no email is on file
    Given the client prefers "email" and has email "" and phone "+15551234567"
    When we plan the dispatch and send the initial outreach
    Then email is not sent
    And SMS is not sent
    And the dispatch reports "no_contact"
    And the rolled-up request status is "failed"

  Scenario: Reminder uses the friendly-reminder copy and same dispatch rules
    Given the client prefers "email" and has email "jane@example.test" and phone "+15551234567"
    When we plan the dispatch and send the reminder
    Then email is sent
    And the email subject is "Friendly reminder: documents needed for Estate of John Doe"
    And the rolled-up request status is "sent_mock"
