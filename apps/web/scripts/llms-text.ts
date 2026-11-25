import { APPLY_SEND_NOTICE, REMOTES, TOOL_NAMES } from '../src/page-tools.ts';
import { PAGE_TOOLS } from '../src/tool-catalog.ts';
import { REGIONS } from '../src/regions.ts';

const names = PAGE_TOOLS.map(tool => tool.name);
if (names.join(',') !== TOOL_NAMES.join(',')) {
  throw new Error(`PAGE_TOOLS names ${names.join(',')} drift from TOOL_NAMES ${TOOL_NAMES.join(',')}`);
}

const regionList = REGIONS.map(([code, label]) => (label.startsWith(`${code} `) || label.startsWith(code) ? label : `${code} ${label}`)).join(', ');
const remoteList = REMOTES.join(', ');

const toolsBrief = PAGE_TOOLS.map(tool => {
  const required = 'required' in tool.inputSchema ? tool.inputSchema.required.join(', ') : 'none';
  const keys = Object.keys(tool.inputSchema.properties).join(', ');
  return `- ${tool.name} (${tool.title}): ${tool.description} Inputs: ${keys}. Required: ${required}.`;
}).join('\n');

const toolsFull = PAGE_TOOLS.map(tool => {
  const schema = JSON.stringify(tool.inputSchema, null, 2);
  return `### ${tool.name} (${tool.title})\n\n${tool.description}\n\nInput schema:\n${schema}`;
}).join('\n\n');

export const llmsTxt = (): string => `# kanithanj.ai

This page matches a short self-description to public software and engineering roles in your browser. Nothing you type leaves the page. ${APPLY_SEND_NOTICE}

## Page tools

Use these tools after the page has loaded. On the first find_roles call, pass stateVersion 0. After that, pass the stateVersion last returned. A stale stateVersion is refused. While a person-confirm step is open, other tools are refused until it is answered.

${toolsBrief}

## Regions and filters

regions is an optional array of: ${regionList}. If no region is picked, every place counts as a fit.

remote is one of: ${remoteList}. productOnly is a boolean that hides roles that look like agency or freelance work.

## How to use them

1. Call find_roles with stateVersion 0 and a description. Skip name, email and phone; they are not needed.
2. Pick an id from the result and call tailor_cv or show_apply_pack.
3. If apply or send is set on show_apply_pack, a person must confirm in the page, then open the posting themselves.

Full schemas: /llms-full.txt
`;

export const llmsFullTxt = (): string => `# kanithanj.ai (full)

This page matches a short self-description to public software and engineering roles in your browser. Nothing you type leaves the page. ${APPLY_SEND_NOTICE}

On the first find_roles call, pass stateVersion 0. After that, pass the stateVersion last returned. A stale stateVersion is refused with StaleWrite and the current version. While a person-confirm step is open, other tools return an error until it is answered. tailor_cv and show_apply_pack only accept an id already shown on the page.

## Regions and filters

regions is an optional array of: ${regionList}. If no region is picked, every place counts as a fit.

remote is one of: ${remoteList}. productOnly is a boolean that hides roles that look like agency or freelance work.

## Page tools

${toolsFull}

## How to use them

1. Call find_roles with stateVersion 0 and a description. Skip name, email and phone; they are not needed.
2. Pick an id from the result and call tailor_cv or show_apply_pack.
3. If apply or send is set on show_apply_pack, a person must confirm in the page, then open the posting themselves.
`;
