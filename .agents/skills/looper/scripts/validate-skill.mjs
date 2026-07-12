#!/usr/bin/env node
/**
 * Structural contract test for looper skill.
 * Drives the real shipped SKILL.md + indexes (not a reimplementation).
 * Exit 0 = pass; non-zero = fail with diagnostics.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillDir = join(__dirname, "..");
const skillMd = join(skillDir, "SKILL.md");
const loopCard = join(skillDir, "references", "loop-card.md");
const ruleMd = join(skillDir, "..", "..", "rules", "looper.mdc");
const agentsMd = join(skillDir, "..", "..", "..", "AGENTS.md");
const agentsReadme = join(skillDir, "..", "..", "README.md");

const failures = [];
const notes = [];

function must(cond, msg) {
  if (!cond) failures.push(msg);
  else notes.push(`ok: ${msg}`);
}

function read(p) {
  must(existsSync(p), `exists ${p}`);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

// --- SKILL.md frontmatter + body contracts ---
const body = read(skillMd);
must(body.length > 0, "SKILL.md non-empty");

const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
must(!!fm, "YAML frontmatter present");
const front = fm ? fm[1] : "";
const name = front.match(/^name:\s*(.+)$/m);
const desc = front.match(/^description:\s*(?:>-?\s*)?([\s\S]*?)(?=^name:|^[a-zA-Z_]+:|\s*$)/m)
  || front.match(/description:\s*>-?\n([\s\S]*)/);
// simpler: require name: and description: keys with non-empty values
const nameVal = (front.match(/^name:\s*[\"']?([^\"'\n]+)/m) || [])[1]?.trim();
const hasDescKey = /^description:\s*/m.test(front);
const descBlock = front.includes("description:");
must(!!nameVal && nameVal.length > 0, `frontmatter name non-empty (got ${JSON.stringify(nameVal)})`);
must(nameVal === "looper", `name is looper (got ${JSON.stringify(nameVal)})`);
must(descBlock, "frontmatter description key present");

// description must mention discovery terms
const descText = front.slice(front.indexOf("description:"));
const descLower = descText.toLowerCase();
for (const term of ["loop", "state", "rout"]) {
  must(descLower.includes(term), `description mentions "${term}*"`);
}

// Body must-have contracts (acceptance criteria)
const bodyLower = body.toLowerCase();
const requiredPhrases = [
  // (a) outer phase / state machine
  { id: "outer-state", any: ["state machine", "phase contract", "transition table"] },
  // (b) bounded step / retry / cancel / max-iter
  { id: "bounded-steps", any: ["max_loop_iters", "max_step_retries", "done_when"] },
  { id: "cancel", any: ["cancel", "cancelled"] },
  // (c) multi-model routing ≥3 roles
  { id: "routing", any: ["model routing", "routing matrix"] },
  { id: "roles", all: ["fast", "coding", "review"] },
  // (d) HITL / pause / review gate
  { id: "hitl", any: ["human-in-the-loop", "hitl", "pause"] },
  { id: "review-gate", any: ["review_gate", "review gate"] },
];

for (const req of requiredPhrases) {
  if (req.all) {
    must(
      req.all.every((t) => bodyLower.includes(t)),
      `body includes roles ${req.all.join(", ")}`,
    );
  }
  if (req.any) {
    must(
      req.any.some((t) => bodyLower.includes(t)),
      `body includes one of [${req.any.join(" | ")}] (${req.id})`,
    );
  }
}

// Count distinct model roles mentioned in routing section
const roleHits = ["fast", "explore", "coding", "deep", "review"].filter((r) =>
  bodyLower.includes(`**${r}**`) || bodyLower.includes(`| **${r}**`) || bodyLower.includes(r),
);
must(roleHits.length >= 3, `≥3 model roles present (found ${roleHits.length}: ${roleHits.join(", ")})`);

// Composition links
must(body.includes("agent-orchestrator"), "composes with agent-orchestrator");
must(body.includes("subagent-delegation"), "composes with subagent-delegation");
must(body.includes("fusion-sage") || body.includes("ai-optimization"), "composes with fusion/fission");

// Loop card reference
must(existsSync(loopCard), "references/loop-card.md exists");
const card = read(loopCard);
must(card.toLowerCase().includes("phase"), "loop-card mentions phase");

// Cursor rule (optional but we ship it)
const rule = read(ruleMd);
must(rule.includes("---"), "looper.mdc has frontmatter");
must(/alwaysApply:\s*false/i.test(rule), "rule alwaysApply false");
must(rule.includes("looper"), "rule points at looper skill");

// Project indexes
const agents = read(agentsMd);
must(
  agents.includes("looper"),
  "AGENTS.md indexes looper",
);
must(
  /loop management|multi-model routing|structured agent|looper/i.test(agents),
  "AGENTS.md routes loop/routing concerns",
);

const readme = read(agentsReadme);
must(readme.includes("looper"), ".agents/README.md indexes looper");

// Report
console.log("=== looper validate-skill ===");
for (const n of notes) console.log(`  ${n}`);
if (failures.length) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
process.exit(0);
