# X Developer Platform Tools (Agent Resources)

We use the official X API directly in the Rust backend for tight integration and full query control (your requirement: "more flexibility and control to tune query whenever needed easily").

High-leverage official agent resources (https://docs.x.com/tools/ai) are integrated:

- **llms.txt / llms-full.txt**: Ingested into xAI prompts for accurate X docs/context (index + full Markdown following llmstxt.org).
- **skill.md**: The structured capability spec (agentskills.io). Used as prompt ground truth + template for our own SKILL.md so agents can discover/use collab-finder.
- **MCP (XMCP + Docs MCP)**: XMCP turns X endpoints into MCP tools (search, create, users...). Docs MCP for live doc lookup. The app will expose its finder functions via MCP too.
- **xurl**: Official CLI (Go, Bubble Tea TUI elements, built-in OAuth, `xurl search`, `xurl post`). Has its own SKILL.md. Recommended for ad-hoc + as UX model. App can shell to it.

See the main plan for how this changes the X layer (less custom code, more correctness and agent composability).

## Discovery
- https://docs.x.com/llms.txt
- https://docs.x.com/skill.md
- https://github.com/xdevplatform/xmcp
- https://github.com/xdevplatform/xurl

These make "easy to connect X, read and writing smooth" a reality for both the desktop UI and agent-driven use.
