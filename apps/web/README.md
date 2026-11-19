# kanithanj.ai web (v0)

```mermaid
flowchart LR
  T[tokens.json] --> C[tokens.css]
  P[POOL_PATH or synthetic fixture] --> S{parsePool + PII scan}
  S -- findings > 0 --> X[abort build]
  S -- clean --> J[public/pool.json + shards]
  J --> B[vite build] --> D[dist + sw.js precache]
  D --> V[Vercel preview, protected]
  subgraph Browser
    D --> M[match in core] --> G[fits now / step toward goal / stretch]
  end
```

| command | does |
|---|---|
| `npm run build` | tokens, pool scan, typecheck, build |
| `POOL_PATH=… npm run build` | same with a local pool, never committed |
| `npx playwright test` | 0 requests carry the description, trap states, offline, 30 abuse inputs, axe |
| `STAGE_DIR=… bash scripts/stage-deploy.sh` | build, rescan the bundled pool, write a deploy manifest |
