// Generated draft — Grok Build workflow template.
// Install: copy to .grok/workflows/distill-candidate-profile-for-opportunity-matching.rhai (or ~/.grok/workflows/).
// Requires Grok host APIs: agent(), phase(), log(), complete() — not rhai-host.
// Skill chain: capture-preferences-to-artifact → ground-salary-benchmarks → draft-proof-variants-from-cv → prefer-constraints-in-analyze-prep

let meta = #{
    name: "distill-candidate-profile-for-opportunity-matching",
    description: "End-to-end flow that inventories sources, captures and grounds preferences/salary, produces proof variants, and injects constraints into CV analysis/prep for accurate opportunity packets",
    phases: [
        #{ title: "Inventory", detail: "Read plan, distillation sources, cvdata and fit schemas" },
        #{ title: "Capture", detail: "Write user answers on work mode, geo, cash floor into candidate-preferences.md" },
        #{ title: "Ground", detail: "Fetch salary benchmarks and update FT/contract ranges" },
        #{ title: "Generate", detail: "Draft proof variants and monthly savings from CV" },
        #{ title: "Integrate", detail: "Explain and plan wiring of constraints into analyze/prep" }
    ],
    when_to_use: "End-to-end flow that inventories sources, captures and grounds preferences/salary, produces proof variants, and injects constraints into CV analysis/prep for accurate opportunity packets",
};

phase("Inventory");
let r0 = agent(
    "Follow skill 'capture-preferences-to-artifact'. Read plan, distillation sources, cvdata and fit schemas. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "capture-preferences-to-artifact",
        capability_mode: "read-only",
        output_schema: #{
            "type": "object",
            "required": ["done", "notes"],
            "properties": #{
                "done": #{ "type": "boolean" },
                "notes": #{ "type": "string" },
            },
        },
    },
);
if r0 == () || !r0.success {
    log("phase failed: capture-preferences-to-artifact");
}


phase("Capture");
let r1 = agent(
    "Follow skill 'ground-salary-benchmarks'. Write user answers on work mode, geo, cash floor into candidate-preferences.md. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "ground-salary-benchmarks",
        capability_mode: "read-write",
        output_schema: #{
            "type": "object",
            "required": ["done", "notes"],
            "properties": #{
                "done": #{ "type": "boolean" },
                "notes": #{ "type": "string" },
            },
        },
    },
);
if r1 == () || !r1.success {
    log("phase failed: ground-salary-benchmarks");
}


phase("Ground");
let r2 = agent(
    "Follow skill 'draft-proof-variants-from-cv'. Fetch salary benchmarks and update FT/contract ranges. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "draft-proof-variants-from-cv",
        capability_mode: "read-write",
        output_schema: #{
            "type": "object",
            "required": ["done", "notes"],
            "properties": #{
                "done": #{ "type": "boolean" },
                "notes": #{ "type": "string" },
            },
        },
    },
);
if r2 == () || !r2.success {
    log("phase failed: draft-proof-variants-from-cv");
}


phase("Generate");
let r3 = agent(
    "Follow skill 'prefer-constraints-in-analyze-prep'. Draft proof variants and monthly savings from CV. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "prefer-constraints-in-analyze-prep",
        capability_mode: "read-write",
        output_schema: #{
            "type": "object",
            "required": ["done", "notes"],
            "properties": #{
                "done": #{ "type": "boolean" },
                "notes": #{ "type": "string" },
            },
        },
    },
);
if r3 == () || !r3.success {
    log("phase failed: prefer-constraints-in-analyze-prep");
}


phase("Integrate");
let r4 = agent(
    "Follow skill 'Integrate'. Explain and plan wiring of constraints into analyze/prep. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "Integrate",
        capability_mode: "read-write",
        output_schema: #{
            "type": "object",
            "required": ["done", "notes"],
            "properties": #{
                "done": #{ "type": "boolean" },
                "notes": #{ "type": "string" },
            },
        },
    },
);
if r4 == () || !r4.success {
    log("phase failed: Integrate");
}

complete(#{
    summary: "Finished workflow distill-candidate-profile-for-opportunity-matching",
    skill_chain: ["capture-preferences-to-artifact","ground-salary-benchmarks","draft-proof-variants-from-cv","prefer-constraints-in-analyze-prep"],
});
