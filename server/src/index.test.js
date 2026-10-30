/* Added two tests: one that checks health 
endpoint without a user header and the other checks 
that api/me rejects a request without one. */
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { app } from './index.js'

const server = app.listen(0)
const address = server.address()
const baseUrl = `http://127.0.0.1:${address.port}`

after(() => {
  server.close()
})

test('health endpoint is available without a user header', async () => {
  const response = await fetch(`${baseUrl}/api/health`)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
})

test('me endpoint rejects requests without a user header', async () => {
  const response = await fetch(`${baseUrl}/api/me`)

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'unauthorized' })
})
