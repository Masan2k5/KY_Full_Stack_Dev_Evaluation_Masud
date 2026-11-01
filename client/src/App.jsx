import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [judgeId] = useState(() => new URLSearchParams(window.location.search).get('as'))
  const [entries, setEntries] = useState([])
  const [selectedEntryId, setSelectedEntryId] = useState(null)
  const [score, setScore] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!judgeId || !/^\d+$/.test(judgeId) || Number(judgeId) <= 0) {
      setError('A valid judge ID is required in the URL, for example ?as=101.')
      setLoading(false)
      return
    }

    const controller = new AbortController()
    async function loadEntries() {
      try {
        const response = await fetch('/api/judge/entries', {
          headers: { 'X-User-Id': judgeId },
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(
            response.status === 403
              ? 'This account does not have judge access.'
              : 'Unable to load assigned entries.',
          )
        }

        const data = await response.json()
        if (!Array.isArray(data)) {
          throw new Error('The server returned an invalid entries response.')
        }

        setEntries(data)
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Unable to load assigned entries.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadEntries()
    return () => controller.abort()
  }, [judgeId])

  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId)

  function selectEntry(entry) {
    setSelectedEntryId(entry.id)
    setScore(entry.myScore === null ? '' : String(entry.myScore))
    setSaved(false)
    setError('')
  }

  async function saveScore(event) {
    event.preventDefault()
    if (!selectedEntry) {
      return
    }

    const parsedScore = Number(score)
    if (!Number.isInteger(parsedScore) || parsedScore < 1 || parsedScore > 10) {
      setError('Enter a whole-number score from 1 to 10.')
      setSaved(false)
      return
    }

    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const response = await fetch(`/api/entries/${selectedEntry.id}/score`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': judgeId,
        },
        body: JSON.stringify({ score: parsedScore }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => null)
        const messages = {
          judging_closed: 'Judging is closed. This score could not be saved.',
          not_found: 'You are not assigned to score this entry.',
          invalid_score: 'Enter a whole-number score from 1 to 10.',
        }
        throw new Error(
          messages[result?.error] || 'Unable to save this score. Please try again.',
        )
      }

      const result = await response.json()
      setEntries((currentEntries) =>
        currentEntries.map((entry) =>
          entry.id === selectedEntry.id ? { ...entry, myScore: result.score } : entry,
        ),
      )
      setScore(String(result.score))
      setSaved(true)
    } catch (requestError) {
      setError(requestError.message || 'Unable to save this score.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="judge-page">
      <header className="page-header">
        <div className="brand-mark" aria-hidden="true">A</div>
        <div>
          <p className="eyebrow">AWARDS PORTAL</p>
          <h1>Judge workspace</h1>
        </div>
        <span className="judge-badge">Judge {judgeId || '—'}</span>
      </header>

      <section className="workspace" aria-label="Assigned entries and scoring">
        <aside className="entry-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">YOUR ASSIGNMENTS</p>
              <h2>Entries to review</h2>
            </div>
            {!loading && <span className="entry-count">{entries.length}</span>}
          </div>

          {loading && <p className="status-message">Loading your entries…</p>}
          {!loading && !error && entries.length === 0 && (
            <p className="status-message">No entries have been assigned to you yet.</p>
          )}
          {error && !selectedEntry && <p className="feedback error" role="alert">{error}</p>}
          {!loading && entries.length > 0 && (
            <ul className="entry-list">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`entry-card${selectedEntryId === entry.id ? ' selected' : ''}`}
                    data-testid={`judge-entry-${entry.id}`}
                    aria-pressed={selectedEntryId === entry.id}
                    onClick={() => selectEntry(entry)}
                  >
                    <span className="entry-card-topline">
                      <span className="entry-id">ENTRY {entry.id}</span>
                      <span className={`score-chip${entry.myScore === null ? ' pending' : ''}`}>
                        {entry.myScore === null ? 'Not scored' : `${entry.myScore} / 10`}
                      </span>
                    </span>
                    <span className="entry-card-title">{entry.title}</span>
                    <span className="entry-card-action">Open entry <span aria-hidden="true">→</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="detail-panel" aria-live="polite">
          {selectedEntry ? (
            <>
              <div className="detail-heading">
                <p className="eyebrow">ENTRY {selectedEntry.id}</p>
                <span className="review-status"><span aria-hidden="true">●</span> Ready for review</span>
              </div>
              <h2 className="entry-title" data-testid="entry-title">{selectedEntry.title}</h2>
              <p className="detail-intro">
                Review this submission and save a score from 1 to 10. You can update your score while judging is open.
              </p>

              <form className="score-form" onSubmit={saveScore}>
                <label htmlFor="score-input">Your score</label>
                <div className="score-input-row">
                  <input
                    id="score-input"
                    data-testid="score-input"
                    type="number"
                    min="1"
                    max="10"
                    step="1"
                    inputMode="numeric"
                    value={score}
                    onChange={(event) => {
                      setScore(event.target.value)
                      setSaved(false)
                    }}
                    required
                    aria-describedby="score-help"
                  />
                  <span className="score-scale">/ 10</span>
                  <button
                    type="submit"
                    className="save-button"
                    data-testid="score-save"
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save score'}
                  </button>
                </div>
                <p id="score-help" className="field-help">Choose a whole number between 1 and 10.</p>
              </form>

              {saved && (
                <p className="feedback success" data-testid="score-saved" role="status">
                  Score saved successfully.
                </p>
              )}
              {error && <p className="feedback error" role="alert">{error}</p>}
            </>
          ) : (
            <div className="empty-detail">
              <div className="empty-icon" aria-hidden="true">↗</div>
              <p className="eyebrow">READY WHEN YOU ARE</p>
              <h2>Select an entry to begin</h2>
              <p>Choose an assigned entry from the list to review it and record your score.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}

export default App
