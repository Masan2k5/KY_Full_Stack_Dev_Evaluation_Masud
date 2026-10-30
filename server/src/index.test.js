import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { app, pool } from './index.js'

const server = app.listen(0)
const address = server.address()
const baseUrl = `http://127.0.0.1:${address.port}`
const createdProgrammeIds = new Set()

async function createProgramme(organiserId, name = `Test ${randomUUID()}`) {
  const response = await fetch(`${baseUrl}/api/programmes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': String(organiserId),
    },
    body: JSON.stringify({ name }),
  })

  assert.equal(response.status, 201)
  const programme = await response.json()
  createdProgrammeIds.add(programme.id)
  return programme
}

async function postCategory(organiserId, programmeId, body) {
  return fetch(`${baseUrl}/api/programmes/${programmeId}/categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': String(organiserId),
    },
    body: JSON.stringify(body),
  })
}

async function closeJudging(organiserId, programmeId) {
  return fetch(`${baseUrl}/api/programmes/${programmeId}/close-judging`, {
    method: 'POST',
    headers: { 'X-User-Id': String(organiserId) },
  })
}

async function getCategories(userId) {
  return fetch(`${baseUrl}/api/categories`, {
    headers: userId === undefined ? {} : { 'X-User-Id': String(userId) },
  })
}

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })

  if (createdProgrammeIds.size > 0) {
    await pool.query(
      'DELETE FROM programmes WHERE id = ANY($1::bigint[])',
      [[...createdProgrammeIds]],
    )
  }
  await pool.end()
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

test('organiser can create a programme with the required response', async () => {
  const name = `Test ${randomUUID()}`
  const programme = await createProgramme(1, name)

  assert.deepEqual(programme, {
    id: programme.id,
    name,
    organiserId: 1,
    judgingClosed: false,
  })
})

test('organiser sees their own programme', async () => {
  const programme = await createProgramme(1)
  const response = await fetch(`${baseUrl}/api/programmes`, {
    headers: { 'X-User-Id': '1' },
  })

  assert.equal(response.status, 200)
  const programmes = await response.json()
  assert.ok(programmes.some(({ id }) => id === programme.id))
})

test('organiser does not see another organiser’s programme', async () => {
  const programme = await createProgramme(1)
  const response = await fetch(`${baseUrl}/api/programmes`, {
    headers: { 'X-User-Id': '2' },
  })

  assert.equal(response.status, 200)
  const programmes = await response.json()
  assert.ok(programmes.every(({ id }) => id !== programme.id))
})

test('non-organiser cannot create or list programmes', async () => {
  const createResponse = await fetch(`${baseUrl}/api/programmes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': '201',
    },
    body: JSON.stringify({ name: `Test ${randomUUID()}` }),
  })
  assert.equal(createResponse.status, 403)

  const listResponse = await fetch(`${baseUrl}/api/programmes`, {
    headers: { 'X-User-Id': '201' },
  })
  assert.equal(listResponse.status, 403)
})

test('owning organiser creates a category with Singapore deadline returned in UTC', async () => {
  const programme = await createProgramme(1)
  const response = await postCategory(1, programme.id, {
    name: 'Design',
    deadlineLocal: '2026-10-31T23:59',
  })

  assert.equal(response.status, 201)
  const category = await response.json()
  assert.deepEqual(category, {
    id: category.id,
    programmeId: programme.id,
    name: 'Design',
    deadline: '2026-10-31T15:59:00.000Z',
  })
})

test('category creation rejects malformed or impossible deadlines', async () => {
  const programme = await createProgramme(1)
  for (const deadlineLocal of [
    '2026-10-31 23:59',
    '2026-02-29T12:00',
    '2026-10-31T24:00',
  ]) {
    const response = await postCategory(1, programme.id, {
      name: 'Design',
      deadlineLocal,
    })
    assert.equal(response.status, 400, deadlineLocal)
  }
})

test('category creation rejects an empty name', async () => {
  const programme = await createProgramme(1)
  const response = await postCategory(1, programme.id, {
    name: '   ',
    deadlineLocal: '2026-10-31T23:59',
  })

  assert.equal(response.status, 400)
})

test('category creation returns 404 for a missing programme', async () => {
  const response = await postCategory(1, 999999999, {
    name: 'Design',
    deadlineLocal: '2026-10-31T23:59',
  })

  assert.equal(response.status, 404)
})

test('organiser cannot create a category under another organiser’s programme', async () => {
  const programme = await createProgramme(1)
  const response = await postCategory(2, programme.id, {
    name: 'Design',
    deadlineLocal: '2026-10-31T23:59',
  })

  assert.equal(response.status, 404)
})

test('owning organiser can close judging for their programme', async () => {
  const programme = await createProgramme(1)
  const response = await closeJudging(1, programme.id)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    ...programme,
    judgingClosed: true,
  })
})

test('organiser cannot close judging for another organiser’s programme', async () => {
  const programme = await createProgramme(1)
  const response = await closeJudging(2, programme.id)

  assert.equal(response.status, 404)

  const ownerListResponse = await fetch(`${baseUrl}/api/programmes`, {
    headers: { 'X-User-Id': '1' },
  })
  const ownerProgrammes = await ownerListResponse.json()
  assert.equal(
    ownerProgrammes.find(({ id }) => id === programme.id)?.judgingClosed,
    false,
  )
})

test('authenticated users can list categories created through the API', async () => {
  const programme = await createProgramme(1)
  const categoryResponse = await postCategory(1, programme.id, {
    name: `Category ${randomUUID()}`,
    deadlineLocal: '2026-10-31T23:59',
  })
  assert.equal(categoryResponse.status, 201)
  const category = await categoryResponse.json()

  for (const userId of [1, 101, 201]) {
    const response = await getCategories(userId)
    assert.equal(response.status, 200)
    const categories = await response.json()
    assert.ok(categories.some(({ id }) => id === category.id))
  }
})

test('categories endpoint rejects missing or unknown user IDs', async () => {
  const missingUserResponse = await getCategories()
  assert.equal(missingUserResponse.status, 401)

  const unknownUserResponse = await getCategories(999)
  assert.equal(unknownUserResponse.status, 401)
})
