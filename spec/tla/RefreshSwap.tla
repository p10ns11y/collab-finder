---------------------------- MODULE RefreshSwap ----------------------------
EXTENDS Naturals

Sources == {"ashby", "greenhouse", "lever", "platsbanken"}
Days == 3
MAX_SOURCE_DROP == 30

VARIABLES liveDay, fetched, failed, regressed, countDrop, staged, phase, day

vars == <<liveDay, fetched, failed, regressed, countDrop, staged, phase, day>>

Init == liveDay = 0 /\ fetched = {} /\ failed = {} /\ regressed = FALSE /\ countDrop = FALSE /\ staged = FALSE /\ phase = "fetch" /\ day = 1

FetchOk(s) == phase = "fetch" /\ s \notin fetched \cup failed /\ fetched' = fetched \cup {s} /\ UNCHANGED <<liveDay, failed, regressed, countDrop, staged, phase, day>>
FetchFail(s) == phase = "fetch" /\ s \notin fetched \cup failed /\ failed' = failed \cup {s} /\ UNCHANGED <<liveDay, fetched, regressed, countDrop, staged, phase, day>>

Decide ==
  /\ phase = "fetch" /\ fetched \cup failed = Sources
  /\ \E r, d \in BOOLEAN : regressed' = r /\ countDrop' = d /\ phase' = IF failed = {} /\ ~r /\ ~d THEN "stage" ELSE "done"
  /\ UNCHANGED <<liveDay, fetched, failed, staged, day>>

Stage == phase = "stage" /\ staged' = TRUE /\ phase' = "rename" /\ UNCHANGED <<liveDay, fetched, failed, regressed, countDrop, day>>
Rename == phase = "rename" /\ staged /\ liveDay' = day /\ staged' = FALSE /\ phase' = "done" /\ UNCHANGED <<fetched, failed, regressed, countDrop, day>>
Crash == phase \in {"fetch", "stage", "rename"} /\ phase' = "done" /\ staged' = FALSE /\ UNCHANGED <<liveDay, fetched, failed, regressed, countDrop, day>>

NextDay == phase = "done" /\ day < Days /\ day' = day + 1 /\ phase' = "fetch" /\ fetched' = {} /\ failed' = {} /\ regressed' = FALSE /\ countDrop' = FALSE /\ UNCHANGED <<liveDay, staged>>
Idle == phase = "done" /\ day = Days /\ UNCHANGED vars

Next == (\E s \in Sources : FetchOk(s) \/ FetchFail(s)) \/ Decide \/ Stage \/ Rename \/ Crash \/ NextDay \/ Idle

Spec == Init /\ [][Next]_vars

TypeOK == liveDay \in 0..Days /\ fetched \subseteq Sources /\ failed \subseteq Sources /\ staged \in BOOLEAN /\ day \in 1..Days /\ regressed \in BOOLEAN /\ countDrop \in BOOLEAN /\ phase \in {"fetch", "stage", "rename", "done"}
SwapOnlyAfterFullPass == phase \in {"stage", "rename"} => fetched = Sources /\ failed = {} /\ ~regressed /\ ~countDrop
LiveNeverAhead == liveDay <= day
LiveMovesOnlyOnPass == [][liveDay' # liveDay => phase = "rename" /\ fetched = Sources /\ failed = {} /\ ~regressed /\ ~countDrop]_vars
PartialRefresh == phase \in {"stage", "rename"} => failed = {} /\ ~countDrop
EvalRegressed == phase \in {"stage", "rename"} => ~regressed
=============================================================================
