/* Added initial API server with a health check and a api/me endpoint that
looks up a user from the X-User-Id header */

import express from 'express'
import pg from 'pg'
import { fileURLToPath } from 'node:url'

const { Pool } = pg
export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://awards:awards_dev_only@localhost:5432/awards',
})

export const app = express()
app.use(express.json())

async function requireUser(request, response, next) {
  const userId = Number(request.get('X-User-Id'))
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    response.status(401).json({ error: 'unauthorized' })
    return
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, name, role, organisation_id AS "organisationId"
       FROM users
       WHERE id = $1`,
      [userId],
    )
    if (rows.length === 0) {
      response.status(401).json({ error: 'unauthorized' })
      return
    }

    request.user = rows[0]
    next()
  } catch (error) {
    next(error)
  }
}

function requireOrganiser(request, response) {
  if (request.user.role !== 'organiser') {
    response.status(403).json({ error: 'forbidden' })
    return false
  }
  return true
}

function singaporeDeadlineToUtc(deadlineLocal) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(deadlineLocal)
  if (!match) {
    return null
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1] ||
    hour > 23 ||
    minute > 59
  ) {
    return null
  }

  return new Date(`${deadlineLocal}:00+08:00`).toISOString()
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.get('/api/me', requireUser, (request, response) => {
  response.json(request.user)
})

app.get('/api/entries/:id', requireUser, async (request, response, next) => {
  const entryIdText = request.params.id
  const entryId = Number(entryIdText)
  if (!/^[1-9]\d*$/.test(entryIdText) || !Number.isSafeInteger(entryId)) {
    response.status(404).json({ error: 'not_found' })
    return
  }

  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.category_id AS "categoryId",
              e.applicant_id AS "applicantId", e.title, e.summary,
              e.status, e.submitted_at AS "submittedAt"
       FROM entries AS e
       WHERE e.id = $1
         AND (
           e.applicant_id = $2
           OR (
             $3 = 'organiser'
             AND EXISTS (
               SELECT 1
               FROM categories AS c
               JOIN programmes AS p ON p.id = c.programme_id
               WHERE c.id = e.category_id AND p.organiser_id = $2
             )
           )
           OR (
             $3 = 'judge'
             AND EXISTS (
               SELECT 1
               FROM judge_assignments AS ja
               WHERE ja.entry_id = e.id AND ja.judge_id = $2
             )
           )
         )`,
      [entryId, request.user.id, request.user.role],
    )

    if (rows.length === 0) {
      response.status(404).json({ error: 'not_found' })
      return
    }

    const entry = rows[0]
    response.json({
      ...entry,
      id: Number(entry.id),
      categoryId: Number(entry.categoryId),
      applicantId: Number(entry.applicantId),
      submittedAt: entry.submittedAt
        ? new Date(entry.submittedAt).toISOString()
        : null,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/entries', requireUser, async (request, response, next) => {
  if (request.user.role !== 'applicant') {
    response.status(403).json({ error: 'forbidden' })
    return
  }

  const categoryIdText = request.body?.categoryId
  const categoryId = Number(categoryIdText)
  const { title, summary } = request.body ?? {}
  if (
    (typeof categoryIdText !== 'number' && typeof categoryIdText !== 'string') ||
    !/^[1-9]\d*$/.test(String(categoryIdText)) ||
    !Number.isSafeInteger(categoryId) ||
    typeof title !== 'string' ||
    title.trim().length === 0 ||
    typeof summary !== 'string' ||
    summary.trim().length === 0
  ) {
    response.status(400).json({ error: 'invalid_entry' })
    return
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO entries (category_id, applicant_id, title, summary)
       SELECT id, $2, $3, $4
       FROM categories
       WHERE id = $1
       RETURNING id, category_id AS "categoryId",
                 applicant_id AS "applicantId", title, summary, status,
                 submitted_at AS "submittedAt"`,
      [categoryId, request.user.id, title.trim(), summary.trim()],
    )
    if (rows.length === 0) {
      response.status(400).json({ error: 'invalid_category' })
      return
    }

    const entry = rows[0]
    response.status(201).json({
      ...entry,
      id: Number(entry.id),
      categoryId: Number(entry.categoryId),
      applicantId: Number(entry.applicantId),
      submittedAt: null,
    })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/entries/:id', requireUser, async (request, response, next) => {
  if (request.user.role !== 'applicant') {
    response.status(403).json({ error: 'forbidden' })
    return
  }

  const entryIdText = request.params.id
  const entryId = Number(entryIdText)
  if (!/^[1-9]\d*$/.test(entryIdText) || !Number.isSafeInteger(entryId)) {
    response.status(404).json({ error: 'not_found' })
    return
  }

  const body = request.body
  const fields = ['title', 'summary']
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length === 0 ||
    Object.keys(body).some((key) => !fields.includes(key)) ||
    fields.some(
      (field) =>
        Object.hasOwn(body, field) &&
        (typeof body[field] !== 'string' || body[field].trim().length === 0),
    )
  ) {
    response.status(400).json({ error: 'invalid_entry' })
    return
  }

  const title = Object.hasOwn(body, 'title') ? body.title.trim() : null
  const summary = Object.hasOwn(body, 'summary') ? body.summary.trim() : null

  try {
    const { rows } = await pool.query(
      `UPDATE entries
       SET title = COALESCE($3, title),
           summary = COALESCE($4, summary)
       WHERE id = $1 AND applicant_id = $2 AND status = 'draft'
       RETURNING id, category_id AS "categoryId",
                 applicant_id AS "applicantId", title, summary, status,
                 submitted_at AS "submittedAt"`,
      [entryId, request.user.id, title, summary],
    )

    if (rows.length === 0) {
      const { rows: ownedEntries } = await pool.query(
        `SELECT status
         FROM entries
         WHERE id = $1 AND applicant_id = $2`,
        [entryId, request.user.id],
      )
      if (ownedEntries[0]?.status === 'submitted') {
        response.status(409).json({ error: 'already_submitted' })
        return
      }

      response.status(404).json({ error: 'not_found' })
      return
    }

    const entry = rows[0]
    response.json({
      ...entry,
      id: Number(entry.id),
      categoryId: Number(entry.categoryId),
      applicantId: Number(entry.applicantId),
      submittedAt: entry.submittedAt
        ? new Date(entry.submittedAt).toISOString()
        : null,
    })
  } catch (error) {
    next(error)
  }
})

app.post(
  '/api/entries/:id/submit',
  requireUser,
  async (request, response, next) => {
    if (request.user.role !== 'applicant') {
      response.status(403).json({ error: 'forbidden' })
      return
    }

    const entryIdText = request.params.id
    const entryId = Number(entryIdText)
    if (!/^[1-9]\d*$/.test(entryIdText) || !Number.isSafeInteger(entryId)) {
      response.status(404).json({ error: 'not_found' })
      return
    }

    try {
      const { rows } = await pool.query(
        `UPDATE entries AS e
         SET status = 'submitted', submitted_at = NOW()
         FROM categories AS c
         WHERE e.id = $1
           AND e.applicant_id = $2
           AND e.status = 'draft'
           AND c.id = e.category_id
           AND c.deadline > NOW()
         RETURNING e.id, e.category_id AS "categoryId",
                   e.applicant_id AS "applicantId", e.title, e.summary,
                   e.status, e.submitted_at AS "submittedAt"`,
        [entryId, request.user.id],
      )

      if (rows.length === 0) {
        const { rows: ownedEntries } = await pool.query(
          `SELECT e.status, c.deadline <= NOW() AS "deadlinePassed"
           FROM entries AS e
           JOIN categories AS c ON c.id = e.category_id
           WHERE e.id = $1 AND e.applicant_id = $2`,
          [entryId, request.user.id],
        )
        const ownedEntry = ownedEntries[0]
        if (!ownedEntry) {
          response.status(404).json({ error: 'not_found' })
          return
        }
        if (ownedEntry.status === 'submitted') {
          response.status(409).json({ error: 'already_submitted' })
          return
        }
        if (ownedEntry.deadlinePassed) {
          response.status(409).json({ error: 'deadline_passed' })
          return
        }

        response.status(404).json({ error: 'not_found' })
        return
      }

      const entry = rows[0]
      response.json({
        ...entry,
        id: Number(entry.id),
        categoryId: Number(entry.categoryId),
        applicantId: Number(entry.applicantId),
        submittedAt: new Date(entry.submittedAt).toISOString(),
      })
    } catch (error) {
      next(error)
    }
  },
)

app.post(
  '/api/entries/:id/assignments',
  requireUser,
  async (request, response, next) => {
    if (!requireOrganiser(request, response)) {
      return
    }

    const entryIdText = request.params.id
    const entryId = Number(entryIdText)
    const judgeIdText = request.body?.judgeId
    const judgeId = Number(judgeIdText)
    if (
      !/^[1-9]\d*$/.test(entryIdText) ||
      !Number.isSafeInteger(entryId) ||
      (typeof judgeIdText !== 'number' && typeof judgeIdText !== 'string') ||
      !/^[1-9]\d*$/.test(String(judgeIdText)) ||
      !Number.isSafeInteger(judgeId)
    ) {
      response.status(400).json({ error: 'invalid_assignment' })
      return
    }

    try {
      const { rows: judges } = await pool.query(
        `SELECT id
         FROM users
         WHERE id = $1 AND role = 'judge'`,
        [judgeId],
      )
      if (judges.length === 0) {
        response.status(400).json({ error: 'invalid_judge' })
        return
      }

      const { rows: assignments } = await pool.query(
        `INSERT INTO judge_assignments (entry_id, judge_id)
         SELECT e.id, $3
         FROM entries AS e
         JOIN categories AS c ON c.id = e.category_id
         JOIN programmes AS p ON p.id = c.programme_id
         WHERE e.id = $1
           AND e.status = 'submitted'
           AND p.organiser_id = $2
         ON CONFLICT (entry_id, judge_id) DO NOTHING
         RETURNING entry_id AS "entryId", judge_id AS "judgeId"`,
        [entryId, request.user.id, judgeId],
      )

      if (assignments.length > 0) {
        response.status(201).json({
          entryId: Number(assignments[0].entryId),
          judgeId: Number(assignments[0].judgeId),
        })
        return
      }

      const { rows: existingAssignments } = await pool.query(
        `SELECT ja.entry_id AS "entryId", ja.judge_id AS "judgeId"
         FROM judge_assignments AS ja
         JOIN entries AS e ON e.id = ja.entry_id
         JOIN categories AS c ON c.id = e.category_id
         JOIN programmes AS p ON p.id = c.programme_id
         WHERE ja.entry_id = $1
           AND ja.judge_id = $3
           AND e.status = 'submitted'
           AND p.organiser_id = $2`,
        [entryId, request.user.id, judgeId],
      )
      if (existingAssignments.length > 0) {
        response.status(200).json({
          entryId: Number(existingAssignments[0].entryId),
          judgeId: Number(existingAssignments[0].judgeId),
        })
        return
      }

      const { rows: entries } = await pool.query(
        `SELECT e.status
         FROM entries AS e
         JOIN categories AS c ON c.id = e.category_id
         JOIN programmes AS p ON p.id = c.programme_id
         WHERE e.id = $1 AND p.organiser_id = $2`,
        [entryId, request.user.id],
      )
      if (entries[0]?.status === 'draft') {
        response.status(409).json({ error: 'not_submitted' })
        return
      }

      response.status(404).json({ error: 'not_found' })
    } catch (error) {
      next(error)
    }
  },
)

app.get('/api/judge/entries', requireUser, async (request, response, next) => {
  if (request.user.role !== 'judge') {
    response.status(403).json({ error: 'forbidden' })
    return
  }

  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.category_id AS "categoryId", e.title,
              s.score AS "myScore"
       FROM judge_assignments AS ja
       JOIN entries AS e ON e.id = ja.entry_id
       LEFT JOIN scores AS s
         ON s.entry_id = ja.entry_id AND s.judge_id = ja.judge_id
       WHERE ja.judge_id = $1 AND e.status = 'submitted'
       ORDER BY e.id`,
      [request.user.id],
    )
    response.json(rows.map((entry) => ({
      ...entry,
      id: Number(entry.id),
      categoryId: Number(entry.categoryId),
      myScore: entry.myScore === null ? null : Number(entry.myScore),
    })))
  } catch (error) {
    next(error)
  }
})

app.post('/api/programmes', requireUser, async (request, response, next) => {
  if (!requireOrganiser(request, response)) {
    return
  }

  const name = request.body?.name
  if (typeof name !== 'string' || name.trim().length === 0) {
    response.status(400).json({ error: 'invalid_name' })
    return
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO programmes (name, organiser_id)
       VALUES ($1, $2)
       RETURNING id, name, organiser_id AS "organiserId",
                 judging_closed AS "judgingClosed"`,
      [name.trim(), request.user.id],
    )
    const programme = rows[0]
    response.status(201).json({ ...programme, id: Number(programme.id) })
  } catch (error) {
    next(error)
  }
})

app.get('/api/programmes', requireUser, async (request, response, next) => {
  if (!requireOrganiser(request, response)) {
    return
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, name, organiser_id AS "organiserId",
              judging_closed AS "judgingClosed"
       FROM programmes
       WHERE organiser_id = $1
       ORDER BY id`,
      [request.user.id],
    )
    response.json(rows.map((programme) => ({
      ...programme,
      id: Number(programme.id),
    })))
  } catch (error) {
    next(error)
  }
})

app.get('/api/categories', requireUser, async (_request, response, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, programme_id AS "programmeId", name, deadline
       FROM categories
       ORDER BY id`,
    )
    response.json(rows.map((category) => ({
      ...category,
      id: Number(category.id),
      programmeId: Number(category.programmeId),
      deadline: new Date(category.deadline).toISOString(),
    })))
  } catch (error) {
    next(error)
  }
})

app.post(
  '/api/programmes/:id/categories',
  requireUser,
  async (request, response, next) => {
    if (!requireOrganiser(request, response)) {
      return
    }

    const programmeIdText = request.params.id
    const programmeId = Number(programmeIdText)
    if (!/^[1-9]\d*$/.test(programmeIdText) || !Number.isSafeInteger(programmeId)) {
      response.status(404).json({ error: 'not_found' })
      return
    }

    const name = request.body?.name
    const deadlineLocal = request.body?.deadlineLocal
    if (typeof name !== 'string' || name.trim().length === 0) {
      response.status(400).json({ error: 'invalid_name' })
      return
    }
    if (typeof deadlineLocal !== 'string') {
      response.status(400).json({ error: 'invalid_deadline' })
      return
    }

    const deadline = singaporeDeadlineToUtc(deadlineLocal)
    if (!deadline) {
      response.status(400).json({ error: 'invalid_deadline' })
      return
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO categories (programme_id, name, deadline)
         SELECT id, $3, $4
         FROM programmes
         WHERE id = $1 AND organiser_id = $2
         RETURNING id, programme_id AS "programmeId", name, deadline`,
        [programmeId, request.user.id, name.trim(), deadline],
      )

      if (rows.length === 0) {
        response.status(404).json({ error: 'not_found' })
        return
      }

      const category = rows[0]
      response.status(201).json({
        ...category,
        id: Number(category.id),
        programmeId: Number(category.programmeId),
        deadline: new Date(category.deadline).toISOString(),
      })
    } catch (error) {
      next(error)
    }
  },
)

app.post(
  '/api/programmes/:id/close-judging',
  requireUser,
  async (request, response, next) => {
    if (!requireOrganiser(request, response)) {
      return
    }

    const programmeIdText = request.params.id
    const programmeId = Number(programmeIdText)
    if (!/^[1-9]\d*$/.test(programmeIdText) || !Number.isSafeInteger(programmeId)) {
      response.status(404).json({ error: 'not_found' })
      return
    }

    try {
      const { rows } = await pool.query(
        `UPDATE programmes
         SET judging_closed = TRUE
         WHERE id = $1 AND organiser_id = $2
         RETURNING id, name, organiser_id AS "organiserId",
                   judging_closed AS "judgingClosed"`,
        [programmeId, request.user.id],
      )

      if (rows.length === 0) {
        response.status(404).json({ error: 'not_found' })
        return
      }

      const programme = rows[0]
      response.json({ ...programme, id: Number(programme.id) })
    } catch (error) {
      next(error)
    }
  },
)

app.use((error, _request, response, _next) => {
  console.error('Request failed:', error)
  response.status(500).json({ error: 'internal_error' })
})

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  app.listen(4000, () => {
    console.log('API listening on http://localhost:4000')
  })
}
