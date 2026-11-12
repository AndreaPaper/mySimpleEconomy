import { describe, expect, it } from 'vitest'
import { Router } from './router'

describe('il router del backend locale', () => {
  const router = new Router()
    .get('/categories', () => 'elenco')
    .get('/categories/archived', () => 'archiviate')
    .put('/categories/{id}', () => 'modifica')
    .delete('/recurring-transactions/{id}/overrides/{overrideId}', () => 'eccezione')

  it('distingue metodo e percorso', () => {
    expect(router.match('GET', '/categories')?.params).toEqual({})
    expect(router.match('POST', '/categories')).toBeNull()
    expect(router.match('GET', '/categories/archived')).not.toBeNull()
  })

  it('estrae i parametri del percorso, anche più di uno', () => {
    expect(router.match('PUT', '/categories/abc')?.params).toEqual({ id: 'abc' })
    expect(router.match('DELETE', '/recurring-transactions/r1/overrides/o2')?.params).toEqual({
      id: 'r1',
      overrideId: 'o2',
    })
  })

  // Un parametro non scavalca un segmento: /categories/{id} non risponde a
  // /categories/abc/archive.
  it('un parametro copre un segmento solo', () => {
    expect(router.match('PUT', '/categories/abc/archive')).toBeNull()
  })
})
