import { APPLY_SEND_NOTICE } from './page-tools.ts';
import { PLACES } from './regions.ts';

export const FILTERS = {
  regions: { type: 'array', items: { enum: PLACES } },
  remote: { enum: ['any', 'remote', 'hybrid', 'onsite'] },
  productOnly: { type: 'boolean' },
} as const;

export const roleIdSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', description: 'Id of a role already shown on the page' },
  },
} as const;

export const rolePickSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    ...roleIdSchema.properties,
    apply: { type: 'boolean', description: 'If true, a person must confirm in the page. The page still does not apply.' },
    send: { type: 'boolean', description: 'If true, a person must confirm in the page. The page still does not send.' },
  },
} as const;

export const PAGE_TOOLS = [
  {
    name: 'find_roles',
    title: 'Find roles',
    description: 'Fill the page form with a self-description and show matching roles in this browser. If a change matches nothing, the roles already shown stay. Nothing leaves the page. Does not apply or send.',
    inputSchema: {
      type: 'object',
      required: ['stateVersion'],
      properties: { stateVersion: { type: 'integer', description: 'Pass 0 on the first call, then the stateVersion from the last answer.' }, description: { type: 'string' }, goal: { type: 'string' }, ...FILTERS },
    },
  },
  {
    name: 'show_apply_pack',
    title: 'Show apply pack',
    description: `Show a local apply pack for a role already on the page: public facts, the posting link, and a checklist. ${APPLY_SEND_NOTICE}`,
    annotations: { readOnlyHint: true },
    inputSchema: rolePickSchema,
  },
  {
    name: 'tailor_cv',
    title: 'Tailor CV',
    description: 'Show a local outline of what to emphasize for a role already on the page, built from the text in the form and public posting facts. Nothing is sent. This is not a submitted CV.',
    annotations: { readOnlyHint: true },
    inputSchema: roleIdSchema,
  },
] as const;


export type PageTool = (typeof PAGE_TOOLS)[number];

export const pageTool = (name: PageTool['name']): PageTool => {
  const tool = PAGE_TOOLS.find(item => item.name === name);
  if (!tool) throw new Error(`unknown page tool: ${name}`);
  return tool;
};
