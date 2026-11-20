---------------------------- MODULE ApplyLedger ----------------------------
EXTENDS Naturals

Ids == {"p1", "p2", "p3"}
Runs == {"r1", "r2"}
MaxCrash == 2
States == {"none", "drafted", "filled", "awaiting", "submitting", "needsCheck", "submitted", "rejected"}

VARIABLES st, writes, sent, fresh, done, up, crashes, holder, lost, answered, blocked, granted

vars == <<st, writes, sent, fresh, done, up, crashes, holder, lost, answered, blocked, granted>>

TypeOK ==
  /\ st \in [Ids -> States]
  /\ writes \in [Ids \X States -> Nat]
  /\ sent \in [Ids -> Nat]
  /\ fresh \in [Ids -> BOOLEAN]
  /\ done \in [Ids -> BOOLEAN]
  /\ up \in BOOLEAN
  /\ crashes \in 0..MaxCrash
  /\ holder \in [Ids -> Runs \cup {"none"}]
  /\ lost \in [Runs \X Ids -> BOOLEAN]
  /\ answered \in [Ids -> BOOLEAN]
  /\ blocked \in [Ids -> BOOLEAN]
  /\ granted \in [Ids -> BOOLEAN]

Init ==
  /\ st = [i \in Ids |-> "none"]
  /\ writes = [p \in Ids \X States |-> 0]
  /\ sent = [i \in Ids |-> 0]
  /\ fresh = [i \in Ids |-> FALSE]
  /\ done = [i \in Ids |-> FALSE]
  /\ up = TRUE
  /\ crashes = 0
  /\ holder = [i \in Ids |-> "none"]
  /\ lost = [p \in Runs \X Ids |-> FALSE]
  /\ answered \in [Ids -> BOOLEAN]
  /\ blocked = [i \in Ids |-> FALSE]
  /\ granted \in [Ids -> BOOLEAN]

Write(i, from, to) ==
  /\ up
  /\ st[i] = from
  /\ st' = [st EXCEPT ![i] = to]
  /\ writes' = [writes EXCEPT ![<<i, to>>] = @ + 1]

Draft(i) == Write(i, "none", "drafted") /\ UNCHANGED <<sent, fresh, done, up, crashes, holder, lost, answered, blocked, granted>>

Fill(i) ==
  /\ up
  /\ st[i] = "drafted"
  /\ ~blocked[i]
  /\ \/ /\ answered[i]
        /\ Write(i, "drafted", "filled")
        /\ UNCHANGED <<sent, fresh, done, up, crashes, holder, lost, answered, blocked, granted>>
     \/ /\ ~answered[i]
        /\ blocked' = [blocked EXCEPT ![i] = TRUE]
        /\ UNCHANGED <<st, writes, sent, fresh, done, up, crashes, holder, lost, answered, granted>>

Await(i) == Write(i, "filled", "awaiting") /\ UNCHANGED <<sent, fresh, done, up, crashes, holder, lost, answered, blocked, granted>>

Intent(run, i) ==
  /\ granted[i] /\ answered[i]
  /\ holder[i] = "none"
  /\ Write(i, "awaiting", "submitting")
  /\ holder' = [holder EXCEPT ![i] = run]
  /\ fresh' = [fresh EXCEPT ![i] = TRUE]
  /\ UNCHANGED <<sent, done, up, crashes, lost, answered, blocked, granted>>

Send(run, i) ==
  /\ up /\ st[i] = "submitting" /\ fresh[i] /\ ~done[i]
  /\ holder[i] = run
  /\ sent' = [sent EXCEPT ![i] = @ + 1]
  /\ done' = [done EXCEPT ![i] = TRUE]
  /\ UNCHANGED <<st, writes, fresh, up, crashes, holder, lost, answered, blocked, granted>>

Record(i) == done[i] /\ fresh[i] /\ Write(i, "submitting", "submitted") /\ UNCHANGED <<sent, fresh, done, up, crashes, holder, lost, answered, blocked, granted>>
Recover(i) == ~fresh[i] /\ Write(i, "submitting", "needsCheck") /\ UNCHANGED <<sent, fresh, done, up, crashes, holder, lost, answered, blocked, granted>>
Confirm(i) == Write(i, "needsCheck", "submitted") /\ UNCHANGED <<sent, fresh, done, up, crashes, holder, lost, answered, blocked, granted>>
Reconcile(i) == Write(i, "needsCheck", "rejected") /\ UNCHANGED <<sent, fresh, done, up, crashes, holder, lost, answered, blocked, granted>>

LostRace(run, i) ==
  /\ holder[i] \in Runs \ {run}
  /\ ~lost[<<run, i>>]
  /\ lost' = [lost EXCEPT ![<<run, i>>] = TRUE]
  /\ UNCHANGED <<st, writes, sent, fresh, done, up, crashes, holder, answered, blocked, granted>>

Crash ==
  /\ up /\ crashes < MaxCrash
  /\ up' = FALSE
  /\ crashes' = crashes + 1
  /\ fresh' = [i \in Ids |-> FALSE]
  /\ done' = [i \in Ids |-> FALSE]
  /\ UNCHANGED <<st, writes, sent, holder, lost, answered, blocked, granted>>

Resume == ~up /\ up' = TRUE /\ UNCHANGED <<st, writes, sent, fresh, done, crashes, holder, lost, answered, blocked, granted>>

Terminal(i) ==
  IF ~answered[i]
  THEN blocked[i] /\ st[i] = "drafted" /\ sent[i] = 0
  ELSE /\ st[i] \in {"awaiting", "submitted", "rejected"}
       /\ (st[i] = "awaiting" <=> ~granted[i])
       /\ (st[i] \in {"submitted", "rejected"} => writes[<<i, "submitting">>] = 1)

Finished == up /\ \A i \in Ids : Terminal(i)

Next ==
  \/ (\E i \in Ids : Draft(i) \/ Fill(i) \/ Await(i) \/ Record(i) \/ Recover(i) \/ Confirm(i) \/ Reconcile(i))
  \/ (\E run \in Runs, j \in Ids : Intent(run, j) \/ Send(run, j) \/ LostRace(run, j))
  \/ Crash \/ Resume
  \/ (Finished /\ UNCHANGED vars)

Spec == Init /\ [][Next]_vars /\ WF_vars(Resume)
  /\ (\A i \in Ids : WF_vars(Draft(i)) /\ WF_vars(Fill(i)) /\ WF_vars(Await(i)) /\ WF_vars(Record(i)) /\ WF_vars(Recover(i)) /\ WF_vars(Confirm(i)) /\ WF_vars(Reconcile(i)))
  /\ (\A run \in Runs, j \in Ids : WF_vars(Intent(run, j)) /\ WF_vars(Send(run, j)))

AtMostOneSubmit == \A i \in Ids : sent[i] <= 1
SubmitOnlyApproved == \A i \in Ids : sent[i] > 0 => granted[i]
NoDuplicateEntries == \A p \in Ids \X States : writes[p] <= 1
SubmittedImpliesAttempt == \A i \in Ids : st[i] = "submitted" => writes[<<i, "submitting">>] = 1 /\ sent[i] <= 1
UnapprovedStopBeforeSubmit == \A i \in Ids : ~granted[i] => st[i] \notin {"submitting", "needsCheck", "submitted", "rejected"}
UnansweredStops == \A i \in Ids : ~answered[i] => sent[i] = 0 /\ st[i] \in {"none", "drafted"} /\ writes[<<i, "awaiting">>] = 0 /\ writes[<<i, "submitting">>] = 0
NoRetryFromNeedsCheck == \A i \in Ids : writes[<<i, "needsCheck">>] >= 1 => st[i] \in {"needsCheck", "submitted", "rejected"}
OwnSubmit == \A i \in Ids : sent[i] = 1 => holder[i] \in Runs
LoserDoesNotHold == \A run \in Runs, i \in Ids : lost[<<run, i>>] => holder[i] # run

AlwaysFinishes == <>[]Finished
=============================================================================
