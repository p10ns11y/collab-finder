# CV packet (pruned for xAI — do not send full cvdata.json)

Canonical body: [`cv-packet-distilled.txt`](../cv-packet-distilled.txt) (also `defaultCvSummary` in `x-search/queries.json`).

Sources: PDF CV (`peramanathan-sathyamoorthy-cv.pdf`) + featured projects (`public-projects-focused-flatten.json`).

Use as `CV_PACKET` / Discover textarea default until devprofile guard loads live CV.

```
(See cv-packet-distilled.txt — ~5.4k chars / ~1.3k tokens; under 8k IPC preview cap.)
```

Budget: ~1.3k tokens CV + ~2k JD for Quick Target analyze. Full packet sent verbatim to xAI; `packet_preview` shows first 8000 chars. Re-sync after CV PDF or projects JSON changes:

```bash
# edit cv-packet-distilled.txt, then:
node -e "const fs=require('fs');const t=fs.readFileSync('data/distillation/cv-packet-distilled.txt','utf8').trimEnd();const q=JSON.parse(fs.readFileSync('data/distillation/x-search/queries.json','utf8'));q.defaultCvSummary=t;fs.writeFileSync('data/distillation/x-search/queries.json',JSON.stringify(q,null,2)+'\n');"
```

Rust fallback: `include_str!(cv-packet-distilled.txt)` in `opportunity_target.rs`.
