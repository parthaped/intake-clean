Feature: Pricing plan catalog
  As a firm browsing the pricing page
  I want plan tiers to be coherent and consistent
  So that I can pick the right plan with confidence.

  Scenario Outline: Each tier exposes the correct matter limit and storage
    Given the "<tier>" plan
    Then the matter limit is <matters>
    And the storage limit is <storageGb> GB
    And storage in MB equals storage in GB times 1024

    Examples:
      | tier    | matters | storageGb |
      | starter | 3       | 5         |
      | solo    | 15      | 25        |
      | firm    | 50      | 100       |

  Scenario: Plans are ordered ascending by monthly price
    When I list the plans in declared order
    Then the monthly prices are strictly increasing

  Scenario: Exactly one plan is highlighted on the pricing page
    When I list the plans in declared order
    Then exactly one plan is highlighted
