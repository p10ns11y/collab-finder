declare module '@adaptate/core' {
  import type { ZodType } from 'zod'

  export function transformSchema<T extends ZodType>(schema: T, config: object): T

  export function makeConditionalSchemaTransformer(
    data: unknown,
  ): (schema: ZodType, config: object) => { run: () => unknown }
}
