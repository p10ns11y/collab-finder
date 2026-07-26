// Generated draft — Grok Build workflow template.
// Install: copy to .grok/workflows/cv-packet-enrichment-and-fit.rhai (or ~/.grok/workflows/).
// Requires Grok host APIs: agent(), phase(), log(), complete() — not rhai-host.
// Skill chain: capture-candidate-preferences → inject-constraints-into-prep → enrich-cover-letter-with-projects

let meta = #{
    name: "cv-packet-enrichment-and-fit",
    description: "End-to-end flow from preference capture through dual-fit schema and data injection to produce accurate opportunity packets and cover letters",
    phases: [
        #{ title: "Explore", detail: "Inventory distillation sources and current analyze/prep paths" },
        #{ title: "Curate", detail: "Capture preferences, salary bands, proof variants" },
        #{ title: "Implement", detail: "Dual-fit schema, constraints injection, project enrichment" },
        #{ title: "Polish", detail: "UI fixes, push, rebase" }
    ],
    when_to_use: "End-to-end flow from preference capture through dual-fit schema and data injection to produce accurate opportunity packets and cover letters",
};

phase("Explore");
let r0 = agent(
    "Follow skill 'capture-candidate-preferences'. Inventory distillation sources and current analyze/prep paths. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "capture-candidate-preferences",
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
    log("phase failed: capture-candidate-preferences");
}


phase("Curate");
let r1 = agent(
    "Follow skill 'inject-constraints-into-prep'. Capture preferences, salary bands, proof variants. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "inject-constraints-into-prep",
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
    log("phase failed: inject-constraints-into-prep");
}


phase("Implement");
let r2 = agent(
    "Follow skill 'enrich-cover-letter-with-projects'. Dual-fit schema, constraints injection, project enrichment. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "enrich-cover-letter-with-projects",
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
    log("phase failed: enrich-cover-letter-with-projects");
}


phase("Polish");
let r3 = agent(
    "Follow skill 'Polish'. UI fixes, push, rebase. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "Polish",
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
    log("phase failed: Polish");
}

complete(#{
    summary: "Finished workflow cv-packet-enrichment-and-fit",
    skill_chain: ["capture-candidate-preferences","inject-constraints-into-prep","enrich-cover-letter-with-projects"],
});
