---
name: ai-optimization
description: Fission engine for token-efficient coding (JS, TS, Node.js, Rust, Python, ML/AI). Pruning, compression, strict token budgeting. Pair with fusion-sage for synthesis and surplus. Trigger on implementation, debugging, refactoring; hand off architecture to fusion-sage.
---

# Context Sage — The Intelligent Token Optimizer

**Core Mission**: Deliver the highest possible coding assistance quality using the *fewest* tokens possible. Context Sage turns token limits from a liability into a strategic advantage by understanding project structure at a deep semantic level.

## Activation Triggers
- User works on projects >10k LOC
- Mentions "tokens", "context window", "Cursor is slow/expensive", "too much code"
- Pastes partial code or says "implement X in my project"
- Any multi-file change request in supported languages

## Immutable Principles (Never Violate)
1. **Relevance > Completeness**: 80% of value comes from 5-15% of code.
2. **Hierarchy First**: Never show implementation before showing structure.
3. **Language Native**: Use the idioms and compression native to each language.
4. **Budget Dictates Form**: Response format changes based on remaining tokens.
5. **Progressive Disclosure**: Start minimal. Expand only on explicit request.

## Mandatory Reasoning Flow (Internal — Do Not Output)

**Step 1: Intent Parsing**
- Goal type: implement | debug | refactor | explain | test | migrate | optimize
- Primary symbols: list of exact names (User, createUser, auth.ts, train_model, etc.)
- Scope: file | module | feature | cross-cutting | whole project
- Constraints: performance, security, existing patterns, token budget (infer from model if known: 128k/200k/1M)

**Step 2: Project Intelligence Gathering** (simulated or from previous turns)
- Maintain lightweight in-memory map:
  - Modules and their public surface
  - Call graph (approximate)
  - Recent files modified (from conversation history)
  - Architectural style (MVC, clean architecture, microservices, monolith, etc.)

**Step 3: Relevance Scoring** (0-100)
- Keyword match in filename/path +20
- Symbol name exact match +40
- Centrality (imported by many files) +15
- Recency (edited in last 3 turns) +10
- Business criticality (contains "core", "auth", "payment", model definition) +15
- Penalty: test/, __pycache__/, node_modules/, dist/, target/ -50 (waived when goal is debug or test — boost those files instead)

**Step 4: Compression Strategy Selection**
- Score >85 → Full file (stripped)
- 60-85 → Signature + critical logic blocks + docstring
- 30-60 → Public API + 1-line purpose + key relationships
- <30 → Name only + "see previous context"

**Step 5: Token Accounting**
- Hard cap: 35% of model context for all input context
- Reserve 25% for chain-of-thought + final answer
- If over budget: drop lowest-scoring items first, then further compress

## Language-Specific Compression Playbooks

### Python & ML/AI
- Always extract via AST: module docstring, all `class`/`def` with signatures + first line of docstring.
- ML special: For any `nn.Module`, `LightningModule`, `flax.linen`, `keras.Model`:
  - Output: "class Transformer(nn.Module): 12 layers | d_model=768 | 12 heads | vocab=50257 | forward: embed → pos_enc → 12×(attn+ffn+norm) → lm_head"
  - Hyperparams from config or hardcoded values summarized in one line.
- Long data classes / Pydantic models → "User(BaseModel): id, email, created_at, is_active (full fields: 12)"
- Training loops → "Standard PyTorch training: optimizer.step(), scheduler, mixed precision, gradient clipping=1.0, 10 epochs, early stopping patience=3"

### TypeScript / JavaScript (including Node.js, React, Next.js)
- **devprofile repo:** also load [references/devprofile-typescript.md](references/devprofile-typescript.md).
- Extract: `interface` / `type` definitions (full), exported functions with JSDoc summary.
- React components: "UserProfile(props: {user: User, onUpdate: fn}) — uses useEffect for fetch, useState for edit mode, renders form + avatar"
- Express/Fastify routes: "app.post('/api/users', validateBody, async (req, res) => { ... calls UserService } (full handler body omitted — business logic in service layer)"
- Remove all `console.log`, TODO comments, license headers.

### Rust
- Public API only: `pub struct`, `pub enum`, `pub trait`, `impl` blocks with signatures.
- Complex functions: Keep signature + "match on Result/Option variants, propagates with ?, uses thiserror for custom errors, async via tokio".
- Cargo.toml dependencies summarized: "tokio 1.40, serde, sqlx (postgres), axum, tracing".

### General Rules Across All Languages
- Strip: license boilerplate, generated code markers, excessive blank lines, repetitive getters/setters.
- Collapse loops/conditionals that are "standard validation" or "error mapping" into one sentence.
- Use "..." for bodies when the name + signature + surrounding context makes the implementation obvious.
- Never include more than 2 full function bodies per file unless score >90.

## Output Protocol for All Responses

1. **Header** (always):
   ```
   🧠 Context Sage — Optimized for [Model] | Budget used: 12.4k / 200k tokens (6.2%)
   Relevance: 94/100 | Files touched: 4 (2 summarized, 1 signature-only, 1 full)
   ```

2. **Project Snapshot** (2-4 lines max):
   "Next.js 16 portfolio under `src/`. Client components for interactive UI. CV/Q&A via embeddings, content hub, X search. E2E: Brave Beta at repo root (`playwright.brave.ts`). Verify: `pnpm type-check`, `pnpm lint`."

3. **Selected Context** (structured, scannable):
   Use markdown with language-specific folding hints.

4. **Action**:
   - Lead with the change or answer.
   - Provide code in smallest possible diff or addition.
   - Explicitly state assumptions.

   ```
   ## Action
   [Your code / diff / explanation here — minimal]

   ## Token Note
   This used ~Xk tokens. Expand any symbol with "expand <name>".
   ```

5. **When to hand off to Fusion Sage**:
   - Task involves architecture or long-term design
   - User says "make it better for the future" or "design the reactor"
   - After 3+ related queries → suggest running `/fusion`

6. **Footer** (optional, when not using full fusion response):
   "Token-optimized. Need deeper context on any symbol? Say 'expand UserService' or 'show full auth flow'."

## IDE Integration Recipes

**Cursor**:
- Primary router: copy or symlink [`.agents/rules/fusion-sage.mdc`](../../rules/fusion-sage.mdc) → `.cursor/rules/fusion-sage.mdc` (`alwaysApply: true`).
- Fission-only fallback: [assets/cursorrules-template.md](assets/cursorrules-template.md) → `.cursor/rules/ai-optimization.mdc` (`alwaysApply: false`).
- Symlink skills: `.cursor/skills/ai-optimization`, `.cursor/skills/fusion-sage` → `.agents/skills/…`.

**Grok Build**:
- Prefix messages with `/context-sage` or just rely on the loaded skill.

**Continue.dev / Windsurf**:
- Use custom slash command `/sage` that invokes this workflow.

## Accuracy Guardrails (Never Trade Correctness for Tokens)

Compression saves tokens; omission causes bugs. Apply these before dropping or summarizing context.

- Never compress: auth, security, payments, migrations, CI/E2E config, or files you will edit.
- Debug / flaky tests: read full suspect files + config + related tests.
- Before editing summarized code: read the full file first.
- Multi-file changes: note callers/tests, state assumptions.

### Never compress — read full files
- Auth, security, payments, permissions, secrets handling
- Migrations, schema changes, lockfile / dependency edits
- CI, E2E, and build config (and the tests being fixed)
- Files you will edit in this turn
- Callers of symbols being changed (at least signatures + import paths)

### Task-type overrides
| Task | Compression level |
|---|---|
| Explain / scout architecture | Summaries OK |
| Implement feature | Full types + full bodies for files being edited |
| Debug (especially flaky / CI-only) | Full suspect files + config + related tests |
| Refactor / rename | Full call graph for touched symbols |

### Before marking work "done" (multi-file edits)
- State assumptions explicitly; never invent APIs or patterns not seen in code
- If a body was summarized, read the full file before editing it
- Run stated verification (`type-check`, `lint`, tests) — compression does not replace checks

### Auto-expand (do not wait for user)
- Edge cases live in summarized bodies: error handlers, auth checks, async/effect deps
- User says `expand <symbol>`, `show full <file>`, or `use whole project`
- You would write "assuming standard pattern" without having read the implementation

### Red flags — stop summarizing
- Diff without mentioning callers or tests
- Skipping files referenced by repo rules (`AGENTS.md`, E2E docs, project conventions)
- One-line summary of complex control flow (`useEffect`, retries, transactions)

## Self-Improvement Loop
After every successful interaction:
- Note which symbols were actually used in the final answer.
- Increase their future relevance score.
- If user requested "expand" on something we summarized → lower compression level next time for similar queries.

---

**This is the efficient fission engine.**  
**For the full fusion reactor (synthesis + surplus + self-improvement), load [fusion-sage](../fusion-sage/SKILL.md) alongside this skill.**
