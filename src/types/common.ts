/** Cross-cutting shapes: auth session, PocketBase list envelope, status tone, plan metadata. */
import type { DispatchExecutionMode } from './dispatch'

export type StatusTone = 'neutral' | 'info' | 'success' | 'danger' | 'warning'

export interface AuthRecord {
  id: string
  email: string
  name?: string
}

export interface AuthSession {
  token: string
  record: AuthRecord
  baseUrl: string
}

export interface PocketBaseListResponse<T> {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
  items: T[]
}

export interface PlanMeta {
  title: string
  mode: DispatchExecutionMode
  maxConcurrency: number
}
