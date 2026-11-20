---------------------------- MODULE WebTraps ----------------------------
EXTENDS Naturals

States == {"loadingPool", "poolError", "idle", "matching", "inputError", "piiWarning",
           "outOfScope", "zeroResults", "results"}
Inputs == {"empty", "short", "long", "pii", "outOfScope", "zero", "ok"}
Likes == {"none", "some", "pii"}
Ready == {"idle", "inputError", "piiWarning", "outOfScope", "zeroResults", "results"}
Shown == Ready \ {"idle"}

VARIABLES state, input, likes, poolCached, poolStale, staleBanner, requests, shownFor, shownLikes

vars == <<state, input, likes, poolCached, poolStale, staleBanner, requests, shownFor, shownLikes>>

TypeOK ==
  /\ state \in States
  /\ input \in Inputs
  /\ likes \in Likes
  /\ poolCached \in BOOLEAN
  /\ poolStale \in BOOLEAN
  /\ staleBanner \in BOOLEAN
  /\ requests \subseteq {"poolAsset"}
  /\ shownFor \in Inputs \cup {"none"}
  /\ shownLikes \in Likes \cup {"none"}

Init ==
  /\ state = "loadingPool"
  /\ input = "empty"
  /\ likes = "none"
  /\ poolCached \in BOOLEAN
  /\ poolStale \in BOOLEAN
  /\ staleBanner = FALSE
  /\ requests = {}
  /\ shownFor = "none"
  /\ shownLikes = "none"

PoolLoaded ==
  /\ state = "loadingPool"
  /\ state' = "idle"
  /\ poolCached' = TRUE
  /\ requests' = requests \cup {"poolAsset"}
  /\ UNCHANGED <<input, likes, poolStale, staleBanner, shownFor, shownLikes>>

PoolFailed ==
  /\ state = "loadingPool"
  /\ ~poolCached
  /\ state' = "poolError"
  /\ UNCHANGED <<input, likes, poolCached, poolStale, staleBanner, requests, shownFor, shownLikes>>

Retry ==
  /\ state = "poolError"
  /\ state' = "loadingPool"
  /\ UNCHANGED <<input, likes, poolCached, poolStale, staleBanner, requests, shownFor, shownLikes>>

Edit ==
  /\ state \in Ready
  /\ \E i \in Inputs, l \in Likes : input' = i /\ likes' = l
  /\ state' = "idle"
  /\ staleBanner' = FALSE
  /\ shownFor' = "none"
  /\ shownLikes' = "none"
  /\ UNCHANGED <<poolCached, poolStale, requests>>

Submit ==
  /\ state \in Ready
  /\ state' = "matching"
  /\ UNCHANGED <<input, likes, poolCached, poolStale, staleBanner, requests, shownFor, shownLikes>>

Outcome(i, l) ==
  CASE i \in {"empty", "short", "long"} -> "inputError"
    [] i = "pii" \/ l = "pii" -> "piiWarning"
    [] i = "outOfScope" -> "outOfScope"
    [] i = "zero" -> "zeroResults"
    [] OTHER -> "results"

Finish ==
  /\ state = "matching"
  /\ state' = Outcome(input, likes)
  /\ staleBanner' = (Outcome(input, likes) = "results" /\ poolStale)
  /\ shownFor' = input
  /\ shownLikes' = likes
  /\ UNCHANGED <<input, likes, poolCached, poolStale, requests>>

RemovePii ==
  /\ state = "piiWarning"
  /\ \E i \in Inputs \ {"pii"}, l \in Likes \ {"pii"} : input' = i /\ likes' = l
  /\ state' = "idle"
  /\ shownFor' = "none"
  /\ shownLikes' = "none"
  /\ UNCHANGED <<poolCached, poolStale, staleBanner, requests>>

WidenFilters ==
  /\ state = "zeroResults"
  /\ \E i \in {"zero", "ok"} : input' = i
  /\ state' = "matching"
  /\ shownFor' = "none"
  /\ shownLikes' = "none"
  /\ UNCHANGED <<likes, poolCached, poolStale, staleBanner, requests>>

Next == PoolLoaded \/ PoolFailed \/ Retry \/ Edit \/ Submit \/ Finish \/ RemovePii \/ WidenFilters

Spec == Init /\ [][Next]_vars /\ SF_vars(PoolLoaded) /\ WF_vars(Retry) /\ WF_vars(Finish) /\ SF_vars(Edit)

NoDescriptionInRequests == requests \subseteq {"poolAsset"}
ResultsNeedPool == state \in Ready \cup {"matching"} => poolCached
StaleAlwaysBannered == (state = "results" /\ poolStale) => staleBanner
PiiNeverMatched == state = "results" => input # "pii" /\ likes # "pii"
OutOfScopeNeverResults == state = "results" => input = "ok"
ShownMatchesForm == state \in Shown => shownFor = input /\ shownLikes = likes
LikesOnlyReorder == (state \in Shown /\ likes = "some") => state = Outcome(input, "none")

NeverStuck == \A s \in States : [](state = s => <>(state \in {"idle", "results"} /\ state # s) \/ s \in {"idle", "results"})
EventuallyUsable == <>(state = "idle")
=============================================================================
