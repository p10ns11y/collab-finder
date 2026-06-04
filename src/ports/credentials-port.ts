import type { BearerStorageStatus } from '../core/domain/credentials'
import type { Result } from '../core/result'
import type { AppError } from '../core/error'

export type CredentialsPort = {
  getStorage(): Promise<Result<BearerStorageStatus, AppError>>
  save(token: string): Promise<Result<void, AppError>>
  clear(): Promise<Result<void, AppError>>
}