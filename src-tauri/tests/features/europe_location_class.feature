Feature: Europe location class for the product lane
  A known European city stays Europe when the country code also names a US or
  Canadian admin area. Those codes are DE, NL, MT, and SK.
  An unrecognized city with only that code is Unknown.
  The product lane keeps Unknown and removes KnownNonEu.
  A known US or Canadian city with a colliding code stays KnownNonEu.
  A US state name or an unambiguous admin code stays KnownNonEu.
  Bare DE and bare SK count as Europe.

  Scenario Outline: Place class
    When the location "<location>" is classified
    Then the place is "<place>"

    Examples:
      | location          | place      |
      | Eindhoven, NL     | Europe     |
      | Rotterdam, NL     | Europe     |
      | Utrecht, NL       | Europe     |
      | The Hague, NL     | Europe     |
      | Hamburg, DE       | Europe     |
      | Frankfurt, DE     | Europe     |
      | Cologne, DE       | Europe     |
      | Stuttgart, DE     | Europe     |
      | Vienna            | Europe     |
      | Bratislava, SK    | Europe     |
      | Valletta, MT      | Europe     |
      | SK                | Europe     |
      | MT                | Europe     |
      | Berlin, DE        | Europe     |
      | DE                | Europe     |
      | Kiel, DE          | Unknown    |
      | Wilmington, DE    | KnownNonEu |
      | Dover, DE         | KnownNonEu |
      | Helena, MT        | KnownNonEu |
      | Regina, SK        | KnownNonEu |
      | San Francisco, DE | KnownNonEu |
      | Paris, TX         | KnownNonEu |
      | Amsterdam, NY     | KnownNonEu |
