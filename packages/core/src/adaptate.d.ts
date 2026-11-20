declare module '@adaptate/core' {
  import type { z } from 'zod';
  export type Config<T> = { [K in keyof T]?: boolean | (T[K] extends object ? Config<T[K]> : never) | { requiredIf: (data: any) => boolean } } & { '*'?: unknown };

  export function transformSchema(schema: z.ZodType, config: Record<string, unknown>): z.ZodObject;
  export function makeConditionalSchemaTransformer(data: unknown): (schema: z.ZodObject, config: Record<string, unknown>) => {
    run: () => unknown; schema: z.ZodType; staticConfig: Record<string, unknown>;
  };
}
