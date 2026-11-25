import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GapGuidanceSchema, SourceAuditSchema, SourceSubmissionSchema } from '../src/pool-seam.ts';

const sub = { kind: 'ats_board', url: 'https://jobs.example.com/board', submitted_at: '2026-11-25T13:00:00Z' } as const;
const audit = { url: sub.url, status: 'accepted', reviewer: { role: 'reviewer', id: 'reviewer-1' }, reviewed_at: '2026-11-25T14:00:00Z' } as const;
const gap = { topic: 'Rust', region: 'SE', rows_found: 0, message: 'Missing sources for Rust in SE', suggestions: [{ kind: 'careers_page', hint: 'Add a careers page that lists Rust roles in Sweden' }] } as const;
const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;

test('a submission is strict: https only, no extra fields and no audit fields', () => {
  assert.equal(ok(SourceSubmissionSchema, sub), true);
  assert.equal(ok(SourceSubmissionSchema, { ...sub, url: 'http://jobs.example.com/board' }), false);
  assert.equal(ok(SourceSubmissionSchema, { ...sub, email: 'someone@example.com' }), false);
  for (const extra of [{ audit_status: 'accepted' }, { audit_status: 'submitted' }, { audit_note: 'fine' }, { status: 'accepted' }, { reviewer: audit.reviewer }])
    assert.equal(ok(SourceSubmissionSchema, { ...sub, ...extra }), false, JSON.stringify(extra));
});

test('an audit record is written by a reviewer only and is separate from the submission', () => {
  assert.equal(SourceAuditSchema.parse(audit).note, null);
  assert.equal(ok(SourceAuditSchema, { ...audit, reviewer: { role: 'submitter', id: 'someone' } }), false);
  assert.equal(ok(SourceAuditSchema, { ...audit, reviewer: { role: 'reviewer', id: ' ' } }), false);
  assert.equal(ok(SourceAuditSchema, { url: audit.url, status: 'accepted', reviewed_at: audit.reviewed_at }), false);
  assert.equal(ok(SourceAuditSchema, { ...audit, status: 'submitted' }), false);
  assert.equal(ok(SourceAuditSchema, { ...audit, ...sub }), false);
});

test('a gap names what is missing and rejects an empty message', () => {
  assert.equal(GapGuidanceSchema.parse(gap).suggestions.length, 1);
  assert.equal(ok(GapGuidanceSchema, { ...gap, message: '' }), false);
  assert.equal(ok(GapGuidanceSchema, { ...gap, message: '   ' }), false);
});
