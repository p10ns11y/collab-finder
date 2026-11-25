/**
 * Settings xAI key/model form seam.
 * Base schema keeps key and model optional. The settings consumer config
 * makes both required at runtime via `@adaptate/core`.
 */
import { transformSchema } from '@adaptate/core'
import { z } from 'zod'

const nonempty = z.string().trim().min(1)

/** Single optional model. Consumers declare which fields they require. */
export const xaiKeyFormBase = z.object({
  key: nonempty.optional(),
  model: nonempty.optional(),
})

/** Settings panel consumer: both drafts are required before a paired save. */
export const xaiSettingsConsumer = {
  key: true,
  model: true,
} as const

export const xaiSettingsFormSchema = transformSchema(xaiKeyFormBase, xaiSettingsConsumer)

/** Model-only save (key draft is empty once the key is stored in Rust). */
export const xaiModelConsumer = {
  model: true,
} as const

export const xaiModelFormSchema = transformSchema(xaiKeyFormBase, xaiModelConsumer)

export function parseXaiSettingsForm(input: unknown) {
  return xaiSettingsFormSchema.safeParse(input)
}

export function parseXaiModelField(model: string) {
  return xaiModelFormSchema.safeParse({ model })
}
