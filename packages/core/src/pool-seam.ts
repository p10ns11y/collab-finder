import { z } from 'zod';

export const AUDIT_STATUS = ['submitted', 'in_review', 'accepted', 'rejected', 'retired'] as const;

export const SourceSubmissionSchema = z.strictObject({
  kind: z.enum(['careers_page', 'ats_board', 'community_list', 'open_dataset']),
  url: z.url({ protocol: /^https$/ }),
  company: z.string().trim().min(1).max(200).optional(),
  regions: z.array(z.enum(['SE', 'EU', 'UK', 'US'])).max(4).default([]),
  role_tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  submitted_at: z.iso.datetime(),
  audit_status: z.enum(AUDIT_STATUS).default('submitted'),
  audit_note: z.string().max(300).nullable().default(null),
});
export type SourceSubmission = z.infer<typeof SourceSubmissionSchema>;

export const GapGuidanceSchema = z.strictObject({
  topic: z.string().trim().min(1).max(80),
  region: z.enum(['SE', 'EU', 'UK', 'US', 'any']),
  rows_found: z.number().int().min(0),
  message: z.string().max(200),
  suggestions: z.array(z.strictObject({
    kind: SourceSubmissionSchema.shape.kind,
    hint: z.string().max(200),
  })).max(5),
});
export type GapGuidance = z.infer<typeof GapGuidanceSchema>;
