const MAX_ATTEMPTS = 3

const retryDelay = (attempt) =>
  new Promise((resolve) => setTimeout(resolve, 250 * attempt))

export async function putScoreWithRetry(
  { entryId, judgeId, score },
  { fetchImpl = fetch, wait = retryDelay } = {},
) {
  let response
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      response = await fetchImpl(`/api/entries/${entryId}/score`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': String(judgeId),
        },
        body: JSON.stringify({ score }),
      })
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw error
      }
      await wait(attempt)
      continue
    }

    if (response.status < 500 || attempt === MAX_ATTEMPTS) {
      return response
    }

    await wait(attempt)
  }
}
