// Generated draft — Grok Build workflow template.
// Install: copy to .grok/workflows/cv-apply-pack-workflow.rhai (or ~/.grok/workflows/).
// Requires Grok host APIs: agent(), phase(), log(), complete() — not rhai-host.
// Skill chain: setup-application-pack-symlink → slugify-pack-and-cv-names → select-apply-specific-projects

let meta = #{
    name: "cv-apply-pack-workflow",
    description: "end-to-end flow from opportunity pack export through symlink, meaningful naming, tech cleanup, project selection, and final CV regeneration under out/apply/",
    phases: [
        #{ title: "Explore", detail: "memory_search + read_file to recall prior decisions and inspect repos" },
        #{ title: "Wire", detail: "implement gitignored symlink and slug naming" },
        #{ title: "Refine", detail: "archive old tech, fix taxonomy, choose xAI-relevant projects" },
        #{ title: "Generate", detail: "run generate-apply-cv script and verify output" }
    ],
    when_to_use: "end-to-end flow from opportunity pack export through symlink, meaningful naming, tech cleanup, project selection, and final CV regeneration under out/apply/",
};

phase("Explore");
let r0 = agent(
    "Follow skill 'setup-application-pack-symlink'. memory_search + read_file to recall prior decisions and inspect repos. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "setup-application-pack-symlink",
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
    log("phase failed: setup-application-pack-symlink");
}


phase("Wire");
let r1 = agent(
    "Follow skill 'slugify-pack-and-cv-names'. implement gitignored symlink and slug naming. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "slugify-pack-and-cv-names",
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
    log("phase failed: slugify-pack-and-cv-names");
}


phase("Refine");
let r2 = agent(
    "Follow skill 'select-apply-specific-projects'. archive old tech, fix taxonomy, choose xAI-relevant projects. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "select-apply-specific-projects",
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
    log("phase failed: select-apply-specific-projects");
}


phase("Generate");
let r3 = agent(
    "Follow skill 'Generate'. run generate-apply-cv script and verify output. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "Generate",
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
    log("phase failed: Generate");
}

complete(#{
    summary: "Finished workflow cv-apply-pack-workflow",
    skill_chain: ["setup-application-pack-symlink","slugify-pack-and-cv-names","select-apply-specific-projects"],
});
