import type { CycleResult, ReactorState, Tweet } from '../core/domain/finder'
import type { Result } from '../core/result'
import type { AppError } from '../core/error'

export type FinderPort = {
  search(query: string, maxResults?: number): Promise<Result<Tweet[], AppError>>
  runCycle(query: string, cvSummary: string): Promise<Result<CycleResult, AppError>>
  reactorState(): Promise<Result<ReactorState, AppError>>
  promote(leadId?: string): Promise<Result<string, AppError>>
}