import { useState } from 'react'
import { fetchRacingKingsGames, gameResultFor, playerColor } from '../lichess/api'
import {
  clearGames,
  getGamesForUser,
  lichessToAnalyzed,
  saveGames,
  saveSettings,
  getSettings,
  type AnalyzedGame,
} from '../storage/db'
import { lineLabel, openingKey } from '../chess/racingKings'

interface ImportPageProps {
  onImported: (games: AnalyzedGame[], username: string) => void
  existingCount: number
  username: string
}

export function ImportPage({ onImported, existingCount, username }: ImportPageProps) {
  const [input, setInput] = useState(username)
  const [maxGames, setMaxGames] = useState(1000)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(0)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    setLoaded(0)
    setStatus('Contacting Lichess…')
    try {
      const name = input.trim()
      const games = await fetchRacingKingsGames(name, {
        max: maxGames,
        onProgress: (p) => {
          setLoaded(p.loaded)
          setStatus(`Downloaded ${p.loaded} Racing Kings games…`)
        },
      })

      if (games.length === 0) {
        setError('No Racing Kings games found for this user.')
        setBusy(false)
        return
      }

      setStatus('Indexing openings…')
      const analyzed: AnalyzedGame[] = []
      for (const g of games) {
        const color = playerColor(g, name)
        if (!color) continue
        const result = gameResultFor(g, color)
        const moves = (g.moves ?? '').trim().split(/\s+/).filter(Boolean)
        const key = openingKey(moves, color)
        const label = lineLabel(moves, 6)
        analyzed.push(lichessToAnalyzed(g, name, color, result, key, label))
      }

      await clearGames(name.toLowerCase())
      await saveGames(analyzed)
      const settings = await getSettings()
      await saveSettings({ ...settings, username: name.toLowerCase() })
      const stored = await getGamesForUser(name)
      setStatus(`Imported ${stored.length} games.`)
      onImported(stored, name.toLowerCase())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page import-page">
      <header className="page-header">
        <p className="eyebrow">Lichess import</p>
        <h2>Pull your Racing Kings games</h2>
        <p className="lede">
          Type your Lichess username. RaceLine downloads only Racing Kings games and stores them
          on this device — no account needed.
        </p>
      </header>

      <form className="import-form" onSubmit={handleImport}>
        <label className="field">
          <span>Lichess username</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. drnykterstein"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            required
          />
        </label>

        <label className="field">
          <span>Max games ({maxGames})</span>
          <input
            type="range"
            min={50}
            max={1000}
            step={50}
            value={maxGames}
            onChange={(e) => setMaxGames(Number(e.target.value))}
            disabled={busy}
          />
        </label>

        <button className="btn primary" type="submit" disabled={busy || !input.trim()}>
          {busy ? 'Downloading…' : 'Download Racing Kings games'}
        </button>
      </form>

      {(busy || status) && (
        <div className="progress-block" aria-live="polite">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: busy ? `${Math.min(100, (loaded / maxGames) * 100)}%` : '100%' }}
            />
          </div>
          <p>{status || `Loaded ${loaded}`}</p>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {existingCount > 0 && !busy && (
        <p className="hint-text">
          {existingCount} games already stored for{' '}
          <strong>{username || 'this device'}</strong>. Importing again replaces that user’s local
          library.
        </p>
      )}
    </section>
  )
}
