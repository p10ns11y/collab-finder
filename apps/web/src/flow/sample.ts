import type { Role } from './machine.ts';

export const SAMPLE: ReadonlyArray<Role> = [
  { id: 'sample:1', title: 'Senior Platform Engineer', company: 'pixel-labs', url: 'https://jobs.example.com/sample/1', reasons: ['platform', 'Go'] },
  { id: 'sample:2', title: 'Product Engineer', company: 'north-loop', url: 'https://jobs.example.com/sample/2', reasons: ['product', 'TypeScript'] },
];
