import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { app, pool } from './index.js'

const server = app.listen(0)
const address = server.address()
const baseUrl = `http://127.0.0.1:${address.port}`
const createdProgrammeIds = new Set()
const createdEntryIds = new Set()

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

async function createCategory(
  organiserId,
  programmeId,
  deadlineLocal = '2099-12-31T23:59',
) {
  const response = await postCategory(organiserId, programmeId, {
    name: `Category ${randomUUID()}`,
    deadlineLocal,
  })

  assert.equal(response.status, 201)
  return response.json()
}

async function postEntry(applicantId, body) {
  return fetch(`${baseUrl}/api/entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': String(applicantId),
    },
    body: JSON.stringify(body),
  })
}

async function createEntry(applicantId, categoryId, body = {}) {
  const response = await postEntry(applicantId, {
    categoryId,
    title: `Entry ${randomUUID()}`,
    summary: 'A short description',
    ...body,
  })

  assert.equal(response.status, 201)
  const entry = await response.json()
  createdEntryIds.add(entry.id)
  return entry
}

async function patchEntry(applicantId, entryId, body) {
  return fetch(`${baseUrl}/api/entries/${entryId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': String(applicantId),
    },
    body: JSON.stringify(body),
  })
}

async function submitEntry(applicantId, entryId) {
  return fetch(`${baseUrl}/api/entries/${entryId}/submit`, {
    method: 'POST',
    headers: { 'X-User-Id': String(applicantId) },
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

  if (createdEntryIds.size > 0) {
    await pool.query(
      'DELETE FROM entries WHERE id = ANY($1::bigint[])',
      [[...createdEntryIds]],
    )
  }
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

test('applicant can create a draft entry with the required response', async () => {
  const programme = await createProgramme(1)
  const category = await createCategory(1, programme.id)
  const title = `Entry ${randomUUID()}`
  const summary = 'A short description'
  const response = await postEntry(201, {
    categoryId: category.id,
    title,
    summary,
  })

  assert.equal(response.status, 201)
  const entry = await response.json()
  createdEntryIds.add(entry.id)
  assert.deepEqual(entry, {
    id: entry.id,
    categoryId: category.id,
    applicantId: 201,
    title,
    summary,
    status: 'draft',
    submittedAt: null,
  })
})

test('entry creation rejects missing or invalid fields', async () => {
  const programme = await createProgramme(1)
  const category = await createCategory(1, programme.id)
  const invalidEntries = [
    { title: 'Entry', summary: 'Summary' },
    { categoryId: category.id, summary: 'Summary' },
    { categoryId: category.id, title: 'Entry' },
    { categoryId: 'not-an-id', title: 'Entry', summary: 'Summary' },
    { categoryId: category.id, title: '   ', summary: 'Summary' },
    { categoryId: category.id, title: 'Entry', summary: '   ' },
  ]

  for (const body of invalidEntries) {
    const response = await postEntry(201, body)
    assert.equal(response.status, 400, JSON.stringify(body))
  }
})

test('entry creation rejects a category that does not exist', async () => {
  const response = await postEntry(201, {
    categoryId: 999999999,
    title: 'Entry',
    summary: 'A short description',
  })

  assert.equal(response.status, 400)
})

test('entry creation rejects users who are not applicants', async () => {
  const programme = await createProgramme(1)
  const category = await createCategory(1, programme.id)
  const response = await postEntry(1, {
    categoryId: category.id,
    title: 'Entry',
    summary: 'A short description',
  })

  assert.equal(response.status, 403)
})

test('applicant can update their own draft title, summary, or both', async () => {
  const programme = await createProgramme(1)
  const category = await createCategory(1, programme.id)

  const titleEntry = await createEntry(201, category.id)
  const titleResponse = await patchEntry(201, titleEntry.id, {
    title: 'Updated title',
  })
  assert.equal(titleResponse.status, 200)
  assert.deepEqual(await titleResponse.json(), {
    ...titleEntry,
    title: 'Updated title',
  })

  const summaryEntry = await createEntry(201, category.id)
  const summaryResponse = await patchEntry(201, summaryEntry.id, {
    summary: 'Updated summary',
  })
  assert.equal(summaryResponse.status, 200)
  assert.deepEqual(await summaryResponse.json(), {
    ...summaryEntry,
    summary: 'Updated summary',
  })

  const bothEntry = await createEntry(201, category.id)
  const bothResponse = await patchEntry(201, bothEntry.id, {
    title: 'Updated title and summary',
    summary: 'Updated together',
  })
  assert.equal(bothResponse.status, 200)
  assert.deepEqual(await bothResponse.json(), {
    ...bothEntry,
    title: 'Updated title and summary',
    summary: 'Updated together',
  })
})

test('applicant cannot update another applicant’s draft entry', async () => {
  const programme = await createProgramme(1)
  const category = await createCategory(1, programme.id)
  const entry = await createEntry(201, category.id)
  const response = await patchEntry(202, entry.id, { title: 'Not yours' })

  assert.equal(response.status, 404)
})

test('draft entry update rejects empty, invalid, or missing fields', async () => {
  const programme = await createProgramme(1)
  const category = await createCategory(1, programme.id)
  const entry = await createEntry(201, category.id)

  for (const body of [
    {},
    { title: '' },
    { title: '   ' },
    { title: 42 },
    { summary: null },
    { summary: '   ' },
    { summary: false },
  ]) {
    const response = await patchEntry(201, entry.id, body)
    assert.equal(response.status, 400, JSON.stringify(body))
  }
})

test('submitted entry cannot be edited', async () => {
  const programme = await createProgramme(1)
  const category = await createCategory(1, programme.id)
  const entry = await createEntry(201, category.id)
  await pool.query(
    `UPDATE entries
     SET status = 'submitted', submitted_at = NOW()
     WHERE id = $1 AND applicant_id = $2`,
    [entry.id, 201],
  )

  const response = await patchEntry(201, entry.id, { title: 'Too late' })
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { error: 'already_submitted' })
})

test('applicant can submit their draft before the category deadline', async () => {
  const programme = await createProgramme(1)
  const category = await createCategory(1, programme.id)
  const entry = await createEntry(201, category.id)
  const response = await submitEntry(201, entry.id)

  assert.equal(response.status, 200)
  const submittedEntry = await response.json()
  assert.deepEqual(submittedEntry, {
    ...entry,
    status: 'submitted',
    submittedAt: submittedEntry.submittedAt,
  })
  assert.match(submittedEntry.submittedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  assert.ok(Number.isFinite(Date.parse(submittedEntry.submittedAt)))
})

test('submission after the category deadline returns deadline_passed', async () => {
  const programme = await createProgramme(1)
  const category = await createCategory(1, programme.id, '2000-01-01T00:00')
  const entry = await createEntry(201, category.id)
  const response = await submitEntry(201, entry.id)

  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { error: 'deadline_passed' })
})

test('submitting an entry a second time returns already_submitted', async () => {
  const programme = await createProgramme(1)
  const category = await createCategory(1, programme.id)
  const entry = await createEntry(201, category.id)

  const firstResponse = await submitEntry(201, entry.id)
  assert.equal(firstResponse.status, 200)

  const secondResponse = await submitEntry(201, entry.id)
  assert.equal(secondResponse.status, 409)
  assert.deepEqual(await secondResponse.json(), { error: 'already_submitted' })
})

test('another applicant cannot submit an entry they do not own', async () => {
  const programme = await createProgramme(1)
  const category = await createCategory(1, programme.id)
  const entry = await createEntry(201, category.id)
  const response = await submitEntry(202, entry.id)

  assert.equal(response.status, 404)
})
