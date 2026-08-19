#!/usr/bin/env node
/**
 * Structural contract test for control-graph skill (skills library layout).
 * Exit 0 = pass; non-zero = fail with diagnostics.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillDir = join(__dirname, "..");
const repoRoot = join(skillDir, "..");
const skillMd = join(skillDir, "SKILL.md");
const skillReadme = join(skillDir, "README.md");
const controlCard = join(skillDir, "references", "control-card.md");
const englishRef = join(skillDir, "references", "english-procedure.md");
const cltRef = join(skillDir, "references", "clt-load-balance.md");
const ruleMd = join(repoRoot, "rules", "control-graph.mdc");
const cltRuleMd = join(repoRoot, "rules", "clt-dual-load.mdc");
const readmeMd = join(repoRoot, "README.md");

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

const body = read(skillMd);
must(body.length > 0, "SKILL.md non-empty");

const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
must(!!fm, "YAML frontmatter present");
const front = fm ? fm[1] : "";
const nameVal = (front.match(/^name:\s*[\"']?([^\"'\n]+)/m) || [])[1]?.trim();
must(!!nameVal && nameVal.length > 0, `frontmatter name non-empty (got ${JSON.stringify(nameVal)})`);
must(nameVal === "control-graph", `name is control-graph (got ${JSON.stringify(nameVal)})`);
must(front.includes("description:"), "frontmatter description key present");

const descLower = front.slice(front.indexOf("description:")).toLowerCase();
for (const term of ["state", "dag", "rout", "loop"]) {
  must(descLower.includes(term), `description mentions "${term}*"`);
}
must(descLower.includes("looper"), "description keeps looper as discovery alias");

const bodyLower = body.toLowerCase();
const requiredPhrases = [
  { id: "outer-state", any: ["state machine", "phase contract", "outer graph"] },
  { id: "inner-dag", any: ["inner graph", "dag", "depends_on"] },
  { id: "bounded-steps", any: ["max_loop_iters", "max_step_retries", "done_when"] },
  { id: "cancel", any: ["cancel", "cancelled"] },
  { id: "routing", any: ["model routing", "role"] },
  { id: "roles", all: ["fast", "coding", "review"] },
  { id: "hitl", any: ["human-in-the-loop", "hitl", "pause"] },
  { id: "review-gate", any: ["review_gate", "review gate"] },
  { id: "progressive", any: ["english-procedure", "only if"] },
  { id: "dual-load", any: ["dualload", "dual-actor", "extraneous", "germane"] },
  { id: "clt-ref", any: ["clt-load-balance"] },
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

const roleHits = ["fast", "explore", "coding", "deep", "review"].filter((r) =>
  bodyLower.includes(r),
);
must(roleHits.length >= 3, `≥3 model roles present (found ${roleHits.length}: ${roleHits.join(", ")})`);

must(body.includes("agent-orchestrator"), "composes with agent-orchestrator");
must(body.includes("subagent-delegation"), "composes with subagent-delegation");
must(body.includes("fusion-sage") || body.includes("ai-optimization"), "composes with fusion/fission");

must(existsSync(controlCard), "references/control-card.md exists");
const card = read(controlCard);
must(card.toLowerCase().includes("phase"), "control-card mentions phase");

must(existsSync(englishRef), "references/english-procedure.md exists");
const eng = read(englishRef);
must(eng.toLowerCase().includes("only if") || eng.toLowerCase().includes("progressive"), "english ref is progressive disclosure");

must(existsSync(cltRef), "references/clt-load-balance.md exists");
const clt = read(cltRef);
must(clt.toLowerCase().includes("extraneous"), "clt ref mentions extraneous");
must(clt.toLowerCase().includes("germane"), "clt ref mentions germane");
must(
  clt.toLowerCase().includes("asymmetric") || clt.toLowerCase().includes("parallel"),
  "clt ref covers asymmetric/parallel agent capacity",
);
must(card.toLowerCase().includes("load_diag") || card.toLowerCase().includes("load"), "control-card mentions load_diag/load");

const skillReadmeBody = read(skillReadme);
must(skillReadmeBody.includes("SKILL.md"), "skill README points at SKILL.md");
must(
  skillReadmeBody.includes("Peramanathan") || skillReadmeBody.includes("2067890630345494578"),
  "skill README cites X thesis post",
);

const rule = read(ruleMd);
must(rule.includes("---"), "control-graph.mdc has frontmatter");
must(/alwaysApply:\s*false/i.test(rule), "rule alwaysApply false");
must(rule.includes("control-graph"), "rule points at control-graph skill");

const cltRule = read(cltRuleMd);
must(cltRule.includes("---"), "clt-dual-load.mdc has frontmatter");
must(/alwaysApply:\s*true/i.test(cltRule), "clt-dual-load alwaysApply true (on-the-fly pre-filter)");
must(cltRule.toLowerCase().includes("dualload") || cltRule.toLowerCase().includes("dual-load") || cltRule.includes("A8"), "clt rule states DualLoad/A8");
must(cltRule.includes("clt-load-balance"), "clt rule points at SoT depth");

const readme = read(readmeMd);
must(readme.includes("control-graph"), "README.md indexes control-graph");
must(
  /loop|multi-model|structured agent|state machine|control-graph/i.test(readme),
  "README routes loop/routing concerns near control-graph",
);

console.log("=== control-graph validate-skill (skills library) ===");
for (const n of notes) console.log(`  ${n}`);
if (failures.length) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
process.exit(0);
