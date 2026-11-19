---------------------------- MODULE WebTraps ----------------------------
EXTENDS Naturals

States == {"loadingPool", "poolError", "idle", "matching", "inputError", "piiWarning",
           "outOfScope", "zeroResults", "results"}
Inputs == {"empty", "short", "long", "pii", "outOfScope", "zero", "ok"}
Ready == {"idle", "inputError", "piiWarning", "outOfScope", "zeroResults", "results"}

VARIABLES state, input, poolCached, poolStale, staleBanner, requests

vars == <<state, input, poolCached, poolStale, staleBanner, requests>>

TypeOK ==
  /\ state \in States
  /\ input \in Inputs
  /\ poolCached \in BOOLEAN
  /\ poolStale \in BOOLEAN
  /\ staleBanner \in BOOLEAN
  /\ requests \subseteq {"poolAsset"}

Init ==
  /\ state = "loadingPool"
  /\ input = "empty"
  /\ poolCached \in BOOLEAN
  /\ poolStale \in BOOLEAN
  /\ staleBanner = FALSE
  /\ requests = {}

PoolLoaded ==
  /\ state = "loadingPool"
  /\ state' = "idle"
  /\ poolCached' = TRUE
  /\ requests' = requests \cup {"poolAsset"}
  /\ UNCHANGED <<input, poolStale, staleBanner>>

PoolFailed ==
  /\ state = "loadingPool"
  /\ ~poolCached
  /\ state' = "poolError"
  /\ UNCHANGED <<input, poolCached, poolStale, staleBanner, requests>>

Retry ==
  /\ state = "poolError"
  /\ state' = "loadingPool"
  /\ UNCHANGED <<input, poolCached, poolStale, staleBanner, requests>>

Edit ==
  /\ state \in Ready
  /\ \E i \in Inputs : input' = i
  /\ state' = "idle"
  /\ staleBanner' = FALSE
  /\ UNCHANGED <<poolCached, poolStale, requests>>

Submit ==
  /\ state \in Ready
  /\ state' = "matching"
  /\ UNCHANGED <<input, poolCached, poolStale, staleBanner, requests>>

Outcome(i) ==
  CASE i \in {"empty", "short", "long"} -> "inputError"
    [] i = "pii" -> "piiWarning"
    [] i = "outOfScope" -> "outOfScope"
    [] i = "zero" -> "zeroResults"
    [] OTHER -> "results"

Finish ==
  /\ state = "matching"
  /\ state' = Outcome(input)
  /\ staleBanner' = (Outcome(input) = "results" /\ poolStale)
  /\ UNCHANGED <<input, poolCached, poolStale, requests>>

RemovePii ==
  /\ state = "piiWarning"
  /\ \E i \in Inputs \ {"pii"} : input' = i
  /\ state' = "idle"
  /\ UNCHANGED <<poolCached, poolStale, staleBanner, requests>>

WidenFilters ==
  /\ state = "zeroResults"
  /\ \E i \in {"zero", "ok"} : input' = i
  /\ state' = "idle"
  /\ UNCHANGED <<poolCached, poolStale, staleBanner, requests>>

Next == PoolLoaded \/ PoolFailed \/ Retry \/ Edit \/ Submit \/ Finish \/ RemovePii \/ WidenFilters

Spec == Init /\ [][Next]_vars /\ SF_vars(PoolLoaded) /\ WF_vars(Retry) /\ WF_vars(Finish) /\ SF_vars(Edit)

NoDescriptionInRequests == requests \subseteq {"poolAsset"}
ResultsNeedPool == state \in Ready \cup {"matching"} => poolCached
StaleAlwaysBannered == (state = "results" /\ poolStale) => staleBanner
PiiNeverMatched == state = "results" => input # "pii"
OutOfScopeNeverResults == state = "results" => input = "ok"

NeverStuck == \A s \in States : [](state = s => <>(state \in {"idle", "results"} /\ state # s) \/ s \in {"idle", "results"})
EventuallyUsable == <>(state = "idle")
=============================================================================
