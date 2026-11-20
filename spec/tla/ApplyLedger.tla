---------------------------- MODULE ApplyLedger ----------------------------
EXTENDS Naturals

Ids == {"p1", "p2", "p3"}
Batch == {"p1", "p2"}
MaxCrash == 2
States == {"none", "drafted", "filled", "awaiting", "submitting", "needsCheck", "submitted"}

VARIABLES st, writes, sent, fresh, done, up, crashes

vars == <<st, writes, sent, fresh, done, up, crashes>>

TypeOK ==
  /\ st \in [Ids -> States]
  /\ writes \in [Ids \X States -> Nat]
  /\ sent \in [Ids -> Nat]
  /\ fresh \in [Ids -> BOOLEAN]
  /\ done \in [Ids -> BOOLEAN]
  /\ up \in BOOLEAN
  /\ crashes \in 0..MaxCrash

Init ==
  /\ st = [i \in Ids |-> "none"]
  /\ writes = [p \in Ids \X States |-> 0]
  /\ sent = [i \in Ids |-> 0]
  /\ fresh = [i \in Ids |-> FALSE]
  /\ done = [i \in Ids |-> FALSE]
  /\ up = TRUE
  /\ crashes = 0

Write(i, from, to) ==
  /\ up
  /\ st[i] = from
  /\ st' = [st EXCEPT ![i] = to]
  /\ writes' = [writes EXCEPT ![<<i, to>>] = @ + 1]

Draft(i) == Write(i, "none", "drafted") /\ UNCHANGED <<sent, fresh, done, up, crashes>>
Fill(i) == Write(i, "drafted", "filled") /\ UNCHANGED <<sent, fresh, done, up, crashes>>
Await(i) == Write(i, "filled", "awaiting") /\ UNCHANGED <<sent, fresh, done, up, crashes>>
Intent(i) == i \in Batch /\ Write(i, "awaiting", "submitting") /\ fresh' = [fresh EXCEPT ![i] = TRUE] /\ UNCHANGED <<sent, done, up, crashes>>

Send(i) ==
  /\ up /\ st[i] = "submitting" /\ fresh[i] /\ ~done[i]
  /\ sent' = [sent EXCEPT ![i] = @ + 1]
  /\ done' = [done EXCEPT ![i] = TRUE]
  /\ UNCHANGED <<st, writes, fresh, up, crashes>>

Record(i) == done[i] /\ fresh[i] /\ Write(i, "submitting", "submitted") /\ UNCHANGED <<sent, fresh, done, up, crashes>>
Recover(i) == ~fresh[i] /\ Write(i, "submitting", "needsCheck") /\ UNCHANGED <<sent, fresh, done, up, crashes>>

Crash ==
  /\ up /\ crashes < MaxCrash
  /\ up' = FALSE
  /\ crashes' = crashes + 1
  /\ fresh' = [i \in Ids |-> FALSE]
  /\ done' = [i \in Ids |-> FALSE]
  /\ UNCHANGED <<st, writes, sent>>

Resume == ~up /\ up' = TRUE /\ UNCHANGED <<st, writes, sent, fresh, done, crashes>>

Finished == up /\ \A i \in Ids : st[i] \in {"awaiting", "submitted", "needsCheck"} /\ (st[i] = "awaiting" => i \notin Batch)

Next ==
  \/ \E i \in Ids : Draft(i) \/ Fill(i) \/ Await(i) \/ Intent(i) \/ Send(i) \/ Record(i) \/ Recover(i)
  \/ Crash \/ Resume
  \/ (Finished /\ UNCHANGED vars)

Spec == Init /\ [][Next]_vars /\ WF_vars(Resume)
  /\ \A i \in Ids : WF_vars(Draft(i)) /\ WF_vars(Fill(i)) /\ WF_vars(Await(i)) /\ WF_vars(Intent(i)) /\ WF_vars(Send(i)) /\ WF_vars(Record(i)) /\ WF_vars(Recover(i))

AtMostOneSubmit == \A i \in Ids : sent[i] <= 1
SubmitOnlyApproved == \A i \in Ids : sent[i] > 0 => i \in Batch
NoDuplicateEntries == \A p \in Ids \X States : writes[p] <= 1
SubmittedWasSent == \A i \in Ids : st[i] = "submitted" => sent[i] = 1
UnapprovedStopBeforeSubmit == \A i \in Ids \ Batch : st[i] \notin {"submitting", "needsCheck", "submitted"}

AlwaysFinishes == <>[]Finished
=============================================================================
