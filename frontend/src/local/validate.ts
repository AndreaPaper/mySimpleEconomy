import { isValidIsoDate, type IsoDate } from './dates'
import { badRequest } from './router'

// Le annotazioni di validazione dei DTO Java (@NotNull, @NotBlank, @DecimalMin, …),
// fatte a mano: il corpo delle richieste arriva come JSON non tipato.

export type Body = Record<string, unknown>

export function bodyOf(body: unknown): Body {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Richiesta non valida')
  }
  return body as Body
}

export function optionalString(body: Body, field: string, maxLength?: number): string | null {
  const value = body[field]
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw badRequest(`Il campo ${field} non è valido`)
  if (maxLength !== undefined && value.length > maxLength) {
    throw badRequest(`Il campo ${field} può avere al massimo ${maxLength} caratteri`)
  }
  return value
}

/** @NotBlank */
export function requiredString(body: Body, field: string, maxLength?: number): string {
  const value = optionalString(body, field, maxLength)
  if (value === null || value.trim() === '') throw badRequest(`Il campo ${field} è obbligatorio`)
  return value
}

export function optionalNumber(body: Body, field: string): number | null {
  const value = body[field]
  if (value === undefined || value === null) return null
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) throw badRequest(`Il campo ${field} non è valido`)
  return n
}

export function requiredNumber(body: Body, field: string): number {
  const value = optionalNumber(body, field)
  if (value === null) throw badRequest(`Il campo ${field} è obbligatorio`)
  return value
}

export function optionalDate(body: Body, field: string): IsoDate | null {
  const value = body[field]
  if (value === undefined || value === null || value === '') return null
  if (!isValidIsoDate(value)) throw badRequest(`La data ${field} non è valida`)
  return value
}

export function requiredDate(body: Body, field: string): IsoDate {
  const value = optionalDate(body, field)
  if (value === null) throw badRequest(`Il campo ${field} è obbligatorio`)
  return value
}

export function requiredEnum<T extends string>(body: Body, field: string, allowed: readonly T[]): T {
  const value = body[field]
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw badRequest(`Il campo ${field} non è valido`)
  }
  return value as T
}

export function optionalBoolean(body: Body, field: string): boolean | null {
  const value = body[field]
  if (value === undefined || value === null) return null
  if (typeof value !== 'boolean') throw badRequest(`Il campo ${field} non è valido`)
  return value
}
