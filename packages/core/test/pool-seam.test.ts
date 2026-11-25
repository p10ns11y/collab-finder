import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GapGuidanceSchema, SourceSubmissionSchema } from '../src/pool-seam.ts';

test('a submission starts unaudited, needs https and rejects extra fields; a gap names what is missing', () => {
  const s = SourceSubmissionSchema.parse({ kind: 'ats_board', url: 'https://jobs.example.com/board', submitted_at: '2026-11-25T13:00:00Z' });
  assert.equal(s.audit_status, 'submitted');
  assert.equal(SourceSubmissionSchema.safeParse({ ...s, url: 'http://jobs.example.com/board' }).success, false);
  assert.equal(SourceSubmissionSchema.safeParse({ ...s, email: 'someone@example.com' }).success, false);
  const gap = GapGuidanceSchema.parse({ topic: 'Rust', region: 'SE', rows_found: 0, message: 'Missing sources for Rust in SE', suggestions: [{ kind: 'careers_page', hint: 'Add a careers page that lists Rust roles in Sweden' }] });
  assert.equal(gap.suggestions.length, 1);
});
