import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, authToken } from './api'

describe('api.createGame', () => {
  afterEach(() => {
    authToken.clear()
    vi.unstubAllGlobals()
  })

  it('sends the advanced economy choice to the server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'game-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    authToken.set('test-token', 'user-1')

    await api.createGame('classic-demo', '1.0.0', {}, 'standard', false)

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(request.body))).toMatchObject({
      pack_id: 'classic-demo',
      economic_difficulty: 'standard',
      advanced_economy_enabled: false,
    })
  })
})
