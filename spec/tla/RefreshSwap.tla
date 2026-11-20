---------------------------- MODULE RefreshSwap ----------------------------
EXTENDS Naturals

Sources == {"ashby", "greenhouse", "lever", "platsbanken"}
Days == 3

VARIABLES liveDay, fetched, failed, regressed, staged, phase, day

vars == <<liveDay, fetched, failed, regressed, staged, phase, day>>

Init == liveDay = 0 /\ fetched = {} /\ failed = {} /\ regressed = FALSE /\ staged = FALSE /\ phase = "fetch" /\ day = 1

FetchOk(s) == phase = "fetch" /\ s \notin fetched \cup failed /\ fetched' = fetched \cup {s} /\ UNCHANGED <<liveDay, failed, regressed, staged, phase, day>>
FetchFail(s) == phase = "fetch" /\ s \notin fetched \cup failed /\ failed' = failed \cup {s} /\ UNCHANGED <<liveDay, fetched, regressed, staged, phase, day>>

Decide ==
  /\ phase = "fetch" /\ fetched \cup failed = Sources
  /\ \E r \in BOOLEAN : regressed' = r /\ phase' = IF failed = {} /\ ~r THEN "stage" ELSE "done"
  /\ UNCHANGED <<liveDay, fetched, failed, staged, day>>

Stage == phase = "stage" /\ staged' = TRUE /\ phase' = "rename" /\ UNCHANGED <<liveDay, fetched, failed, regressed, day>>
Rename == phase = "rename" /\ staged /\ liveDay' = day /\ staged' = FALSE /\ phase' = "done" /\ UNCHANGED <<fetched, failed, regressed, day>>
Crash == phase \in {"fetch", "stage", "rename"} /\ phase' = "done" /\ staged' = FALSE /\ UNCHANGED <<liveDay, fetched, failed, regressed, day>>

NextDay == phase = "done" /\ day < Days /\ day' = day + 1 /\ phase' = "fetch" /\ fetched' = {} /\ failed' = {} /\ regressed' = FALSE /\ UNCHANGED <<liveDay, staged>>
Idle == phase = "done" /\ day = Days /\ UNCHANGED vars

Next == (\E s \in Sources : FetchOk(s) \/ FetchFail(s)) \/ Decide \/ Stage \/ Rename \/ Crash \/ NextDay \/ Idle

Spec == Init /\ [][Next]_vars

TypeOK == liveDay \in 0..Days /\ fetched \subseteq Sources /\ failed \subseteq Sources /\ staged \in BOOLEAN /\ day \in 1..Days
SwapOnlyAfterFullPass == phase \in {"stage", "rename"} => fetched = Sources /\ failed = {} /\ ~regressed
LiveNeverAhead == liveDay <= day
LiveMovesOnlyOnPass == [][liveDay' # liveDay => phase = "rename" /\ fetched = Sources /\ failed = {} /\ ~regressed]_vars
=============================================================================
