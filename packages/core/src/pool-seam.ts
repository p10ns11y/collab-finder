import { z } from 'zod';
import { WORLD_REGIONS } from './vocab.ts';

const httpsUrl = z.url({ protocol: /^https$/ });

export const SourceSubmissionSchema = z.strictObject({
  kind: z.enum(['careers_page', 'ats_board', 'community_list', 'open_dataset']),
  url: httpsUrl,
  company: z.string().trim().min(1).max(200).optional(),
  regions: z.array(z.enum(WORLD_REGIONS)).max(WORLD_REGIONS.length).default([]),
  role_tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  submitted_at: z.iso.datetime(),
});
export type SourceSubmission = z.infer<typeof SourceSubmissionSchema>;

export const AUDIT_STATUS = ['in_review', 'accepted', 'rejected', 'retired'] as const;

export const SourceAuditSchema = z.strictObject({
  url: httpsUrl,
  status: z.enum(AUDIT_STATUS),
  reviewer: z.strictObject({ role: z.literal('reviewer'), id: z.string().trim().min(1).max(80) }),
  reviewed_at: z.iso.datetime(),
  note: z.string().max(300).nullable().default(null),
});
export type SourceAudit = z.infer<typeof SourceAuditSchema>;

export const GapGuidanceSchema = z.strictObject({
  topic: z.string().trim().min(1).max(80),
  region: z.enum([...WORLD_REGIONS, 'any']),
  rows_found: z.number().int().min(0),
  message: z.string().trim().min(1).max(200),
  suggestions: z.array(z.strictObject({
    kind: SourceSubmissionSchema.shape.kind,
    hint: z.string().max(200),
  })).max(5),
});
export type GapGuidance = z.infer<typeof GapGuidanceSchema>;
