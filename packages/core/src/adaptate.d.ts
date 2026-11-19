// @adaptate/core@2.2.2 declares "types": "./build/index.d.ts" but the published tarball ships no .d.ts.
// Minimal declaration written from the README and build/index.es.js (exports: transformSchema, makeConditionalSchemaTransformer).
declare module '@adaptate/core' {
  import type { z } from 'zod';
  export type Config<T> = { [K in keyof T]?: boolean | (T[K] extends object ? Config<T[K]> : never) | { requiredIf: (data: any) => boolean } } & { '*'?: unknown };
  /** Returns a new Zod object with the configured fields required. Throws if `schema` is not a Zod object (or array with '*'). */
  export function transformSchema(schema: z.ZodType, config: Record<string, unknown>): z.ZodObject;
  export function makeConditionalSchemaTransformer(data: unknown): (schema: z.ZodObject, config: Record<string, unknown>) => {
    run: () => unknown; schema: z.ZodType; staticConfig: Record<string, unknown>;
  };
}
