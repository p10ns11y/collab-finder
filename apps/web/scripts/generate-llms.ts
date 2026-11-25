import { writeFileSync } from 'node:fs';
import { llmsFullTxt, llmsTxt } from './llms-text.ts';

const dir = new URL('../public/', import.meta.url);
writeFileSync(new URL('llms.txt', dir), llmsTxt());
writeFileSync(new URL('llms-full.txt', dir), llmsFullTxt());
