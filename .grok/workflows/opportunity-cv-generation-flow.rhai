// Generated draft — Grok Build workflow template.
// Install: copy to .grok/workflows/opportunity-cv-generation-flow.rhai (or ~/.grok/workflows/).
// Requires Grok host APIs: agent(), phase(), log(), complete() — not rhai-host.
// Skill chain: setup-application-pack-symlink → pack-slug-naming → curate-technologies-section → finalize-apply-cv-export

let meta = #{
    name: "opportunity-cv-generation-flow",
    description: "End-to-end pipeline that symlinks packs, applies slug naming, curates content, generates named PDFs and exports to upload-friendly locations",
    phases: [
        #{ title: "Explore", detail: "memory_search + read opportunity packs and prior decisions" },
        #{ title: "Wire Layout", detail: "symlink + slug naming + manifest updates" },
        #{ title: "Curate Content", detail: "slim technologies, archive old data, fix blurbs" },
        #{ title: "Export", detail: "generate PDF, rename, copy to devprofile/out and submit" }
    ],
    when_to_use: "End-to-end pipeline that symlinks packs, applies slug naming, curates content, generates named PDFs and exports to upload-friendly locations",
};

phase("Explore");
let r0 = agent(
    "Follow skill 'setup-application-pack-symlink'. memory_search + read opportunity packs and prior decisions. Use read-only tools first when mapping; "
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


phase("Wire Layout");
let r1 = agent(
    "Follow skill 'pack-slug-naming'. symlink + slug naming + manifest updates. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "pack-slug-naming",
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
    log("phase failed: pack-slug-naming");
}


phase("Curate Content");
let r2 = agent(
    "Follow skill 'curate-technologies-section'. slim technologies, archive old data, fix blurbs. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "curate-technologies-section",
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
    log("phase failed: curate-technologies-section");
}


phase("Export");
let r3 = agent(
    "Follow skill 'finalize-apply-cv-export'. generate PDF, rename, copy to devprofile/out and submit. Use read-only tools first when mapping; "
        + "then apply edits. Report {done: bool, notes: string}.",
    #{
        label: "finalize-apply-cv-export",
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
    log("phase failed: finalize-apply-cv-export");
}

complete(#{
    summary: "Finished workflow opportunity-cv-generation-flow",
    skill_chain: ["setup-application-pack-symlink","pack-slug-naming","curate-technologies-section","finalize-apply-cv-export"],
});
