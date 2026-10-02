Feature: Platsbanken publication freshness ranking
  Posting age adjusts rank_score among otherwise similar leads.
  Age is computed against an injected "today", not the system clock.
  Missing or unparseable dates stay neutral.

  Scenario: Fresh posting within 7 days gets a boost
    Given today is "2026-10-02"
    And a Platsbanken lead published "2026-09-29T00:00:00" with api relevance 5.0 and no favorite terms
    When the lead is ranked for publication freshness
    Then the rank reasons include "fresh:3d"
    And the freshness score adjustment is positive

  Scenario: Posting 8 to 30 days old gets no adjustment
    Given today is "2026-10-02"
    And a Platsbanken lead published "2026-09-15T00:00:00" with api relevance 5.0 and no favorite terms
    When the lead is ranked for publication freshness
    Then the rank reasons have no freshness tag
    And the freshness score adjustment is zero

  Scenario: Posting older than 60 days gets demoted
    Given today is "2026-10-02"
    And a Platsbanken lead published "2026-05-01T00:00:00" with api relevance 5.0 and no favorite terms
    When the lead is ranked for publication freshness
    Then the rank reasons include "stale:154d"
    And the freshness score adjustment is negative

  Scenario: Missing publication date is neutral
    Given today is "2026-10-02"
    And a Platsbanken lead with no publication date and api relevance 5.0 and no favorite terms
    When the lead is ranked for publication freshness
    Then the rank reasons include "posted:unknown"
    And the freshness score adjustment is zero

  Scenario: Unparseable publication date is neutral
    Given today is "2026-10-02"
    And a Platsbanken lead published "not-a-date" with api relevance 5.0 and no favorite terms
    When the lead is ranked for publication freshness
    Then the rank reasons include "posted:unknown"
    And the freshness score adjustment is zero

  Scenario: Future publication date counts as 0 days old
    Given today is "2026-10-02"
    And a Platsbanken lead published "2026-10-05T00:00:00" with api relevance 5.0 and no favorite terms
    When the lead is ranked for publication freshness
    Then the rank reasons include "fresh:0d"
    And the freshness score adjustment is positive

  Scenario: Age is computed against injected today not the system clock
    Given today is "2026-10-02"
    And a Platsbanken lead published "2026-10-01T00:00:00" with api relevance 5.0 and no favorite terms
    When the lead is ranked for publication freshness
    Then the rank reasons include "fresh:1d"
    Given today is "2026-12-01"
    When the lead is ranked for publication freshness again
    Then the rank reasons include "stale:61d"

  Scenario: Fresh lead ranks above stale lead with similar relevance
    Given today is "2026-10-02"
    And a Platsbanken lead "fresh-role" published "2026-10-01T00:00:00" with api relevance 10.0 and no favorite terms
    And a Platsbanken lead "stale-role" published "2026-05-01T00:00:00" with api relevance 10.5 and no favorite terms
    When the leads are ranked together
    Then "fresh-role" appears before "stale-role" in the results
    And "fresh-role" has rank reason "fresh:1d"
    And "stale-role" has rank reason matching "stale:"

  Scenario: Strongly matching stale lead is demoted but not buried
    Given today is "2026-10-02"
    And a Platsbanken lead "stale-strong" published "2026-01-01T00:00:00" with api relevance 50.0 and favorite term "machine learning"
    And a Platsbanken lead "fresh-weak" published "2026-10-01T00:00:00" with api relevance 5.0 and no favorite terms
    When the leads are ranked together
    Then "stale-strong" still appears in the first 10 results
    And "fresh-weak" appears before "stale-strong" in the results

  Scenario: Lead with no date keeps neutral score relative to baseline
    Given today is "2026-10-02"
    And a Platsbanken lead "unknown-date" with no publication date and api relevance 10.0 and no favorite terms
    When the lead is ranked for publication freshness
    Then "unknown-date" has rank reason "posted:unknown"
    And "unknown-date" rank score equals its pre-freshness baseline
