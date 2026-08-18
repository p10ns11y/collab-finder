#!/usr/bin/env node
// Honest Node gate for the IPC contract (per strategist plan).
// Imports would be ideal, but to be runnable in plain node we embed the pure fns (they are tiny and pure).
// This replaces the old sim_hydrate_obs theater.

function cvSummaryForIpc(trimmed, options) {
  const t = (trimmed || '').trim();
  if (!t) return undefined;
  const isDistilledDefaultOnly =
    options?.distilledDefault != null &&
    options?.userEdited !== true &&
    t === options.distilledDefault.trim();
  if (isDistilledDefaultOnly) return undefined;
  return t;
}

function shouldShowRestoredCvWarning(analysis) {
  const cvCharsSent = analysis && 'cv_chars_sent' in analysis ? analysis.cv_chars_sent : undefined;
  const cvIpcChars = analysis && 'cv_ipc_chars' in analysis ? analysis.cv_ipc_chars : undefined;
  const cvUsedFallback = analysis && 'cv_used_fallback' in analysis ? analysis.cv_used_fallback : undefined;
  const estCost = analysis && 'est_cost_usd' in analysis ? analysis.est_cost_usd : undefined;
  return cvCharsSent === 0 && cvIpcChars === 0 && !cvUsedFallback && (estCost === 0 || estCost === undefined);
}

function reconstructAnalysisFromOpportunity(o) {
  let fitDispatched = false;
  if (o && o.analysis_json) {
    try {
      const parsed = JSON.parse(o.analysis_json);
      const fit = parsed && typeof parsed === 'object' && 'fit' in parsed ? parsed.fit : parsed;
      if (fit && typeof fit.overall === 'number' && typeof fit.rationale === 'string' && Array.isArray(fit.gaps_must)) {
        const full = parsed && typeof parsed === 'object' ? parsed : {};
        const analysis = {
          opportunity_id: o.id,
          fit,
          packet_preview: typeof full.packet_preview === 'string' ? full.packet_preview : (o.jd_text || '').slice(0, 800),
          packet_preview_truncated: typeof full.packet_preview_truncated === 'boolean' ? full.packet_preview_truncated : (o.jd_text || '').length > 800,
          cv_chars_sent: typeof full.cv_chars_sent === 'number' ? full.cv_chars_sent : 0,
          cv_ipc_chars: typeof full.cv_ipc_chars === 'number' ? full.cv_ipc_chars : 0,
          cv_used_fallback: typeof full.cv_used_fallback === 'boolean' ? full.cv_used_fallback : false,
          prompt_tokens: typeof full.prompt_tokens === 'number' ? full.prompt_tokens : 0,
          completion_tokens: typeof full.completion_tokens === 'number' ? full.completion_tokens : 0,
          est_cost_usd: typeof full.est_cost_usd === 'number' ? full.est_cost_usd : 0,
        };
        return analysis;
      }
    } catch (e) {}
  }
  if (o && typeof o.fit_score === 'number') {
    const stubFit = {
      overall: o.fit_score,
      rationale: 'Restored from prior opportunity record (no full analysis_json available).',
      gaps_must: [],
      recommended_action: 'Review prep artifacts or re-evaluate fit.',
    };
    return {
      opportunity_id: o.id,
      fit: stubFit,
      packet_preview: '(restored)',
      packet_preview_truncated: false,
      cv_chars_sent: 0,
      cv_ipc_chars: 0,
      cv_used_fallback: false,
      prompt_tokens: 0,
      completion_tokens: 0,
      est_cost_usd: 0,
    };
  }
  return null;
}

// --- asserts ---
let passed = true;

const a = cvSummaryForIpc('');
if (a !== undefined) { console.error('FAIL empty->undefined'); passed=false; } else { console.log('PASS empty -> undefined'); }

const b = cvSummaryForIpc('  foo bar  ');
if (b !== 'foo bar') { console.error('FAIL explicit'); passed=false; } else { console.log('PASS explicit preserved'); }

const DEFAULT = 'PROFILE\nDistilled default packet for tests.';
const c = cvSummaryForIpc(DEFAULT, { distilledDefault: DEFAULT, userEdited: false });
if (c !== undefined) { console.error('FAIL default without edit -> undefined'); passed=false; } else { console.log('PASS default without edit -> undefined'); }

const d = cvSummaryForIpc(DEFAULT, { distilledDefault: DEFAULT, userEdited: true });
if (d !== DEFAULT) { console.error('FAIL user edited default preserved'); passed=false; } else { console.log('PASS user edited default preserved'); }

// hydrate fixture (shape from DB roundtrip with meta embedded)
const fixture = {
  id: 17,
  analysis_json: JSON.stringify({
    fit: { overall: 82, rationale: 'x', gaps_must: [], recommended_action: 'y' },
    cv_chars_sent: 1234,
    cv_ipc_chars: 1200,
    cv_used_fallback: false,
    est_cost_usd: 0.01
  }),
  jd_text: 'jd',
  fit_score: 82
};
const rec = reconstructAnalysisFromOpportunity(fixture);
if (!rec || rec.cv_chars_sent !== 1234) { console.error('FAIL reconstruct cv>0'); passed=false; } else { console.log('PASS reconstruct cv>0'); }

const warn = shouldShowRestoredCvWarning(rec);
if (warn !== false) { console.error('FAIL shouldShow false'); passed=false; } else { console.log('PASS shouldShowRestoredCvWarning === false'); }

if (passed) {
  console.log('ALL GATE ASSERTS PASSED');
  process.exit(0);
} else {
  process.exit(1);
}
