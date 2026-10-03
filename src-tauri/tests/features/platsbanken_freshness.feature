Feature: Platsbanken publication freshness ranking
  Age is the number of days from publication_date to an injected today.
  0 to 7 days gets a boost and a fresh:Nd reason.
  8 to 60 days gets no score change and no age reason.
  61 days and older gets a penalty and a stale:Nd reason.
  A future date counts as 0 days old.
  A missing or unreadable date is posted:unknown, with no score change.
  The ranking does not guess a date from any other shape.

  Scenario Outline: Age bands and their boundaries
    Given today is "2026-10-02"
    And a Platsbanken lead published "<published>" with api relevance 5.0 and no favorite terms
    When the lead is ranked for publication freshness
    Then the publication age tag is "<tag>"
    And the freshness score adjustment is <direction>

    Examples:
      | published            | tag        | direction |
      | 2026-10-05T00:00:00  | fresh:0d   | positive  |
      | 2026-10-02T00:00:00  | fresh:0d   | positive  |
      | 2026-10-01T00:00:00Z | fresh:1d   | positive  |
      | 2026-09-25           | fresh:7d   | positive  |
      | 2026-09-24T00:00:00  | none       | zero      |
      | 2026-09-15T00:00:00  | none       | zero      |
      | 2026-09-02T00:00:00  | none       | zero      |
      | 2026-09-01T00:00:00  | none       | zero      |
      | 2026-08-03T00:00:00  | none       | zero      |
      | 2026-08-02T00:00:00  | stale:61d  | negative  |
      | 2026-05-01T00:00:00  | stale:154d | negative  |

  Scenario Outline: Unreadable publication dates stay unknown
    Given today is "2026-10-02"
    And a Platsbanken lead published "<published>" with api relevance 5.0 and no favorite terms
    When the lead is ranked for publication freshness
    Then the publication age tag is "posted:unknown"
    And the freshness score adjustment is zero

    Examples:
      | published           |
      | not-a-date          |
      | 01/08/2026          |
      | August 1, 2026      |
      | 2026-02-31T00:00:00 |
      | 2026-02-29T00:00:00 |
      | 2026-13-01T00:00:00 |
      | 2026-10-01 00:00:00 |
      | 20260801            |

  Scenario: Missing publication date is neutral
    Given today is "2026-10-02"
    And a Platsbanken lead with no publication date and api relevance 5.0 and no favorite terms
    When the lead is ranked for publication freshness
    Then the publication age tag is "posted:unknown"
    And the freshness score adjustment is zero

  Scenario: The same posting ages only when the injected today changes
    Given today is "2026-10-02"
    And a Platsbanken lead published "2026-10-01T00:00:00" with api relevance 5.0 and no favorite terms
    When the lead is ranked for publication freshness
    Then the publication age tag is "fresh:1d"
    Given today is "2026-12-01"
    When the lead is ranked for publication freshness
    Then the publication age tag is "stale:61d"

  Scenario: Fresh lead ranks above a slightly stronger stale lead
    Given today is "2026-10-02"
    And a Platsbanken lead "fresh-role" published "2026-10-01T00:00:00" with api relevance 10.0 and no favorite terms
    And a Platsbanken lead "stale-role" published "2026-05-01T00:00:00" with api relevance 10.5 and no favorite terms
    When the leads are ranked together
    Then "fresh-role" appears before "stale-role" in the results
    And "fresh-role" publication age tag is "fresh:1d"
    And "stale-role" publication age tag is "stale:154d"

  Scenario: A stale favorite stays above fresh generic leads
    Given today is "2026-10-02"
    And 10 fresh generic leads published "2026-10-01T00:00:00" with api relevance 2.0
    And a Platsbanken lead "stale-strong" published "2026-01-01T00:00:00" with api relevance 2.0 and favorite term "machine learning"
    When the leads are ranked together
    Then "stale-strong" appears before every fresh generic lead
    And "stale-strong" still appears in the first 10 results
    And "stale-strong" publication age tag is "stale:274d"

  Scenario: A lead with no date keeps the place it had before freshness
    Given today is "2026-10-02"
    And a Platsbanken lead "neutral-age" published "2026-09-12T00:00:00" with api relevance 10.0 and no favorite terms
    And a Platsbanken lead "unknown-date" with no publication date and api relevance 10.0 and no favorite terms
    When the leads are ranked together
    Then "unknown-date" publication age tag is "posted:unknown"
    And "neutral-age" publication age tag is "none"
    And "unknown-date" rank score equals "neutral-age" rank score
    And "unknown-date" rank score equals its pre-freshness baseline
    And "neutral-age" appears before "unknown-date" in the results
