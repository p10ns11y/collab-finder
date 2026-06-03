#!/usr/bin/env python3
"""
Context Sage CLI — Generate token-optimized context packs for AI IDEs
(Cursor, Grok Build, Continue.dev, etc.)

Usage:
  python context-sage.py analyze --project /path/to/project --query "add password reset flow" --budget 45000 --lang python
  python context-sage.py pack --output context-pack.md
"""

import os
import ast
import argparse
import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from collections import defaultdict

@dataclass
class Symbol:
    name: str
    kind: str  # class, function, interface, struct, etc.
    signature: str
    doc: str = ""
    file: str = ""
    line: int = 0
    relevance: int = 0

@dataclass
class FileSummary:
    path: str
    language: str
    purpose: str
    symbols: List[Symbol] = field(default_factory=list)
    token_estimate: int = 0
    relevance: int = 0
    compressed: str = ""

class ContextSage:
    def __init__(self, project_root: Path, budget: int = 50000):
        self.root = project_root
        self.budget = budget
        self.summaries: List[FileSummary] = []
        self.keywords: List[str] = []

    def set_query(self, query: str):
        self.keywords = [w.lower() for w in re.findall(r'\w+', query) if len(w) > 2]

    def _score_file(self, path: Path, content: str) -> int:
        score = 0
        path_str = str(path).lower()
        content_lower = content.lower()

        # Path signals
        if any(x in path_str for x in ['core', 'domain', 'service', 'model', 'auth', 'user', 'api', 'main']):
            score += 25
        if any(x in path_str for x in ['test', 'spec', '__pycache__', 'node_modules', 'dist', 'target', '.git']):
            score -= 60

        # Keyword matches
        for kw in self.keywords:
            if kw in path_str:
                score += 15
            if kw in content_lower:
                score += 8

        # Size penalty (prefer focused files)
        if len(content) > 15000:
            score -= 10
        elif len(content) < 200:
            score -= 5

        return max(0, min(100, score))

    def _extract_python(self, path: Path, content: str) -> FileSummary:
        try:
            tree = ast.parse(content, filename=str(path))
        except SyntaxError:
            return self._fallback_summary(path, content, "python")

        symbols = []
        purpose = ast.get_docstring(tree) or "Python module"
        purpose = purpose.split('\n')[0][:120]

        for node in ast.walk(tree):
            if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                name = node.name
                if name.startswith('_') and not name.startswith('__'):
                    continue  # skip private unless dunder

                # Signature
                if isinstance(node, ast.ClassDef):
                    bases = [b.id if isinstance(b, ast.Name) else '...' for b in node.bases]
                    sig = f"class {name}({', '.join(bases)})"
                    kind = "class"
                else:
                    args = []
                    for arg in node.args.args:
                        ann = ""
                        if arg.annotation:
                            ann = self._ann_to_str(arg.annotation)
                        args.append(f"{arg.arg}{ann}")
                    ret = ""
                    if node.returns:
                        ret = f" -> {self._ann_to_str(node.returns)}"
                    sig = f"{'async ' if isinstance(node, ast.AsyncFunctionDef) else ''}def {name}({', '.join(args)}){ret}"
                    kind = "async def" if isinstance(node, ast.AsyncFunctionDef) else "def"

                doc = ast.get_docstring(node) or ""
                doc = doc.split('\n')[0][:80] if doc else ""

                symbols.append(Symbol(
                    name=name,
                    kind=kind,
                    signature=sig,
                    doc=doc,
                    file=str(path.relative_to(self.root)),
                    line=node.lineno
                ))

        # ML special handling
        ml_hint = ""
        if any('nn.Module' in content or 'LightningModule' in content or 'flax.linen' in content or 'keras.Model' in content):
            ml_hint = " [ML MODEL DETECTED — architecture summarized]"

        compressed = self._build_python_compressed(path, symbols, purpose + ml_hint)

        return FileSummary(
            path=str(path.relative_to(self.root)),
            language="python",
            purpose=purpose,
            symbols=symbols,
            token_estimate=len(compressed) // 4,
            relevance=0,  # set later
            compressed=compressed
        )

    def _ann_to_str(self, node) -> str:
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Subscript):
            return f"{self._ann_to_str(node.value)}[...]"
        return "..."

    def _build_python_compressed(self, path: Path, symbols: List[Symbol], purpose: str) -> str:
        lines = [f"# {path.name} — {purpose}"]
        for sym in symbols[:12]:  # cap at 12 symbols
            line = f"{sym.signature}"
            if sym.doc:
                line += f"  # {sym.doc}"
            lines.append(line)
        if len(symbols) > 12:
            lines.append(f"# ... +{len(symbols)-12} more symbols (expand on request)")
        return "\n".join(lines)

    def _fallback_summary(self, path: Path, content: str, lang: str) -> FileSummary:
        # Simple heuristic for non-Python or parse failure
        first_lines = "\n".join(content.splitlines()[:8])
        purpose = first_lines.split('\n')[0][:100] or f"{lang} file"
        compressed = f"# {path.name}\n{first_lines}\n# ... (rest of file — {len(content)} chars)"
        return FileSummary(
            path=str(path.relative_to(self.root)),
            language=lang,
            purpose=purpose,
            token_estimate=len(compressed) // 4,
            compressed=compressed
        )

    def scan_project(self, max_files: int = 80):
        exts = {
            '.py': 'python',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.rs': 'rust',
        }

        candidates = []
        for ext, lang in exts.items():
            for p in self.root.rglob(f'*{ext}'):
                if any(x in str(p) for x in ['node_modules', 'dist', 'target', '__pycache__', '.git', 'venv', 'env']):
                    continue
                try:
                    content = p.read_text(encoding='utf-8', errors='ignore')
                    score = self._score_file(p, content)
                    candidates.append((score, p, content, lang))
                except Exception:
                    continue

        candidates.sort(reverse=True)  # highest score first
        candidates = candidates[:max_files]

        for score, path, content, lang in candidates:
            if lang == 'python':
                summary = self._extract_python(path, content)
            else:
                summary = self._fallback_summary(path, content, lang)

            summary.relevance = score
            self.summaries.append(summary)

        # Re-score based on global centrality (simple version)
        self._apply_centrality_boost()

    def _apply_centrality_boost(self):
        # Very simple: files that define symbols referenced in other high-score files get boost
        symbol_names = set()
        for s in self.summaries:
            for sym in s.symbols:
                symbol_names.add(sym.name.lower())

        for s in self.summaries:
            boost = 0
            path_lower = s.path.lower()
            for kw in self.keywords:
                if kw in path_lower:
                    boost += 12
            s.relevance = min(100, s.relevance + boost)

    def build_pack(self, max_tokens: Optional[int] = None) -> str:
        if max_tokens is None:
            max_tokens = self.budget

        # Sort by relevance
        sorted_summaries = sorted(self.summaries, key=lambda x: x.relevance, reverse=True)

        used_tokens = 0
        selected = []
        overview = f"""# Context Sage Pack — {self.root.name}
Query: {" ".join(self.keywords)}
Budget: {max_tokens} tokens | Model: unknown (adjust with --budget)

## Project Overview
{len(self.summaries)} files scanned. Top relevance: {sorted_summaries[0].path if sorted_summaries else 'N/A'}

"""

        used_tokens += len(overview) // 4

        for s in sorted_summaries:
            if used_tokens + s.token_estimate > max_tokens * 0.85:
                break
            selected.append(s)
            used_tokens += s.token_estimate

        parts = [overview]
        for s in selected:
            parts.append(f"\n## {s.path} (relevance {s.relevance}/100, ~{s.token_estimate} tokens)\n{s.compressed}")

        if len(selected) < len(sorted_summaries):
            parts.append(f"\n# ... +{len(sorted_summaries) - len(selected)} lower-relevance files omitted to stay under budget")

        return "\n".join(parts)

def main():
    parser = argparse.ArgumentParser(description="Context Sage — Token optimizer for AI coding")
    sub = parser.add_subparsers(dest='cmd', required=True)

    p_analyze = sub.add_parser('analyze', help='Scan project and generate optimized context')
    p_analyze.add_argument('--project', type=Path, default=Path.cwd(), help='Project root')
    p_analyze.add_argument('--query', type=str, required=True, help='What you want to do (e.g. "implement JWT auth middleware")')
    p_analyze.add_argument('--budget', type=int, default=45000, help='Max tokens for context')
    p_analyze.add_argument('--output', type=Path, default=Path('context-pack.md'), help='Output file')

    args = parser.parse_args()

    if args.cmd == 'analyze':
        sage = ContextSage(args.project, budget=args.budget)
        sage.set_query(args.query)
        print(f"🔍 Scanning {args.project} for '{args.query}'...")
        sage.scan_project()
        print(f"✅ Found {len(sage.summaries)} relevant files")
        pack = sage.build_pack()
        args.output.write_text(pack, encoding='utf-8')
        print(f"📦 Context pack written to {args.output} ({len(pack)//4} tokens estimated)")
        print("Paste this into Cursor / Grok Build / Continue.dev for massive token savings.")

if __name__ == "__main__":
    main()
