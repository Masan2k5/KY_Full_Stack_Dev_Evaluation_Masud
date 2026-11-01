import assert from 'node:assert/strict'
import test from 'node:test'
import { putScoreWithRetry } from './score-request.js'

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function assertRequest(request, score = 8) {
  assert.equal(request.url, '/api/entries/42/score')
  assert.equal(request.options.method, 'PUT')
  assert.equal(request.options.headers['Content-Type'], 'application/json')
  assert.equal(request.options.headers['X-User-Id'], '101')
  assert.equal(request.options.body, JSON.stringify({ score }))
}

test('score save succeeds immediately without retrying', async () => {
  const requests = []
  const waits = []
  const response = await putScoreWithRetry(
    { entryId: 42, judgeId: 101, score: 8 },
    {
      fetchImpl: async (url, options) => {
        requests.push({ url, options })
        return jsonResponse(200, { entryId: 42, judgeId: 101, score: 8 })
      },
      wait: async (attempt) => waits.push(attempt),
    },
  )

  assert.equal(response.status, 200)
  assert.equal(requests.length, 1)
  assertRequest(requests[0])
  assert.deepEqual(waits, [])
})

test('score save retries a network failure with the same request before succeeding', async () => {
  const requests = []
  const waits = []
  const response = await putScoreWithRetry(
    { entryId: 42, judgeId: 101, score: 8 },
    {
      fetchImpl: async (url, options) => {
        requests.push({ url, options })
        if (requests.length === 1) {
          throw new TypeError('Network unavailable')
        }
        return jsonResponse(200, { entryId: 42, judgeId: 101, score: 8 })
      },
      wait: async (attempt) => waits.push(attempt),
    },
  )

  assert.equal(response.status, 200)
  assert.equal(requests.length, 2)
  requests.forEach((request) => assertRequest(request))
  assert.deepEqual(waits, [1])
})

test('score save retries a 5xx response before succeeding', async () => {
  const requests = []
  const waits = []
  const response = await putScoreWithRetry(
    { entryId: 42, judgeId: 101, score: 8 },
    {
      fetchImpl: async (url, options) => {
        requests.push({ url, options })
        return requests.length === 1
          ? jsonResponse(503, { error: 'internal_error' })
          : jsonResponse(200, { entryId: 42, judgeId: 101, score: 8 })
      },
      wait: async (attempt) => waits.push(attempt),
    },
  )

  assert.equal(response.status, 200)
  assert.equal(requests.length, 2)
  requests.forEach((request) => assertRequest(request))
  assert.deepEqual(waits, [1])
})

test('score save stops after three transient failures', async () => {
  const requests = []
  const waits = []
  const response = await putScoreWithRetry(
    { entryId: 42, judgeId: 101, score: 8 },
    {
      fetchImpl: async (url, options) => {
        requests.push({ url, options })
        return jsonResponse(503, { error: 'internal_error' })
      },
      wait: async (attempt) => waits.push(attempt),
    },
  )

  assert.equal(response.status, 503)
  assert.equal(requests.length, 3)
  requests.forEach((request) => assertRequest(request))
  assert.deepEqual(waits, [1, 2])
})

test('score save does not retry client errors, including closed judging', async () => {
  for (const [status, error] of [
    [400, 'invalid_score'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [409, 'judging_closed'],
  ]) {
    const requests = []
    const waits = []
    const response = await putScoreWithRetry(
      { entryId: 42, judgeId: 101, score: 8 },
      {
        fetchImpl: async (url, options) => {
          requests.push({ url, options })
          return jsonResponse(status, { error })
        },
        wait: async (attempt) => waits.push(attempt),
      },
    )

    assert.equal(response.status, status)
    assert.deepEqual(await response.json(), { error })
    assert.equal(requests.length, 1, `${status} ${error} must not retry`)
    assertRequest(requests[0])
    assert.deepEqual(waits, [])
  }
})
