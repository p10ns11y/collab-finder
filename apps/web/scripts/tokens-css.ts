import { readFileSync, writeFileSync } from 'node:fs';

type Tokens = {
  color: Record<string, string>;
  role: Record<string, { fill: string; stroke: string; text: string }>;
  space: Record<string, string>;
  radius: Record<string, string>;
  type: { family: string; mono: string; scale: Record<string, string> };
};
const kebab = (s: string) => s.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
const t = JSON.parse(readFileSync(new URL('../src/tokens.json', import.meta.url), 'utf8')) as Tokens;
const lines: string[] = [];
for (const [k, v] of Object.entries(t.color)) lines.push(`  --color-${kebab(k)}: ${v};`);
for (const [r, v] of Object.entries(t.role)) for (const [k, c] of Object.entries(v)) lines.push(`  --color-${r}-${k}: ${c};`);
for (const [k, v] of Object.entries(t.radius)) lines.push(`  --radius-${k}: ${v};`);
for (const [k, v] of Object.entries(t.type.scale)) lines.push(`  --text-${k}: ${v};`);
lines.push(`  --font-sans: ${t.type.family};`, `  --font-mono: ${t.type.mono};`);
writeFileSync(new URL('../src/tokens.css', import.meta.url), `@theme {\n${lines.join('\n')}\n}\n`);
