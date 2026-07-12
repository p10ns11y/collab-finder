# Loop Card template

Copy into the agent session (or a scratch note) at loop start. Update on every phase transition.

```markdown
## Loop Card

| Field | Value |
|-------|--------|
| **goal** | (one sentence) |
| **phase** | IDLE \| ORIENT \| PLAN \| HITL_PLAN_GATE \| EXECUTE \| VERIFY \| REPAIR \| REVIEW_GATE \| HITL_REVIEW \| INTEGRATE \| DONE \| CANCELLED \| BLOCKED |
| **success criteria** | (observable) |
| **verify commands** | `…` |
| **non-goals** | … |

### Budgets
| Budget | Max | Remaining |
|--------|-----|-----------|
| max_loop_iters | 8 | |
| max_repair_rounds | 3 | |
| max_step_retries | 2 | |
| max_tool_calls_per_step | 25 | |

### Inner steps (DAG)
| id | name | depends_on | done_when | role | status |
|----|------|------------|-----------|------|--------|
| S1 | | | | fast\|explore\|coding\|deep\|review | pending |

### Now
- **model_role:** …
- **last progress:** (diff / test / decision — not “still reading”)
- **pause reason:** none | …
- **open_risks:** …
- **handoff artifacts:** …
```

## Phase cheat sheet

1. **ORIENT** — goal, constraints, unknowns  
2. **PLAN** — criteria + verify + budgets; HITL if high stakes  
3. **EXECUTE** — only listed steps; structured handoffs  
4. **VERIFY** — run commands yourself  
5. **REPAIR** — gap-only, budgeted  
6. **REVIEW_GATE** — independent review role when stakes warrant  
7. **INTEGRATE** — merge/report; re-PLAN only remaining gap  
8. **DONE** / **CANCELLED** / **BLOCKED** — terminal with reason  

Hard stop: budgets exhausted or `no_progress` × 2 → HITL or re-PLAN, never silent thrash.
