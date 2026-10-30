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
