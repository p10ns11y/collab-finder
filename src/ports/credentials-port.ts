import type { Result } from '../core/result'
import type { AppError } from '../core/error'

export type CredentialsPort = {
  hasStored(): Promise<Result<boolean, AppError>>
  save(token: string): Promise<Result<void, AppError>>
  clear(): Promise<Result<void, AppError>>
}