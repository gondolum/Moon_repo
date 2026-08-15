import { useMemo, useState } from 'react'
import type { AnalyzedGame } from '../storage/db'
import { buildOpeningOverview, type OpeningStats } from '../analysis/openings'
import { analyzeGameOpening } from '../analysis/openings'
import { getEngine } from '../engine/fairyStockfish'

interface OverviewPageProps {
  games: AnalyzedGame[]
  onGamesUpdated: (games: AnalyzedGame[]) => void
  onTrain: (openingKey: string) => void
  analysisDepth: number
}

export function OverviewPage({
  games,
  onGamesUpdated,
  onTrain,
  analysisDepth,
}: OverviewPageProps) {
  const openings = useMemo(() => buildOpeningOverview(games), [games])
  const [selected, setSelected] = useState<OpeningStats | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState('')
  const [engineNote, setEngineNote] = useState('')
  const [error, setError] = useState('')

  const totals = useMemo(() => {
    const wins = games.filter((g) => g.result === 'win').length
    const analyzed = games.filter((g) => g.analysis?.length).length
    return { wins, analyzed, total: games.length }
  }, [games])

  async function runBatchAnalysis(limit = 40) {
    setError('')
    setAnalyzing(true)
    setEngineNote('Loading Fairy Stockfish (offline)…')
    try {
      await getEngine().init()
      setEngineNote('Engine ready — classical eval, Racing Kings variant')
      const pending = games.filter((g) => !g.analysis?.length).slice(0, limit)
      if (pending.length === 0) {
        setProgress('All loaded games already have opening analysis.')
        setAnalyzing(false)
        return
      }
      const updated = [...games]
      for (let i = 0; i < pending.length; i++) {
        setProgress(`Analyzing game ${i + 1}/${pending.length}…`)
        const result = await analyzeGameOpening(pending[i], {
          depth: analysisDepth,
          onPly: (done, total) =>
            setProgress(`Game ${i + 1}/${pending.length} — ply ${done}/${total}`),
        })
        const idx = updated.findIndex((g) => g.id === result.id)
        if (idx >= 0) updated[idx] = result
        onGamesUpdated([...updated])
      }
      setProgress(`Finished analyzing ${pending.length} games.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAnalyzing(false)
    }
  }

  if (games.length === 0) {
    return (
      <section className="page">
        <header className="page-header">
          <p className="eyebrow">Openings</p>
          <h2>No games yet</h2>
          <p className="lede">Import your Lichess Racing Kings games to see opening stats.</p>
        </header>
      </section>
    )
  }

  return (
    <section className="page overview-page">
      <header className="page-header">
        <p className="eyebrow">Performance map</p>
        <h2>Where your openings leak</h2>
        <p className="lede">
          Lines sorted by weakest results. Run local Fairy Stockfish analysis to surface repeated
          mistakes in the first moves.
        </p>
      </header>

      <div className="stat-strip">
        <div>
          <span>Games</span>
          <strong>{totals.total}</strong>
        </div>
        <div>
          <span>Wins</span>
          <strong>{totals.wins}</strong>
        </div>
        <div>
          <span>Analyzed</span>
          <strong>{totals.analyzed}</strong>
        </div>
        <div>
          <span>Lines</span>
          <strong>{openings.length}</strong>
        </div>
      </div>

      <div className="toolbar">
        <button
          className="btn primary"
          type="button"
          disabled={analyzing}
          onClick={() => runBatchAnalysis(30)}
        >
          {analyzing ? 'Analyzing…' : 'Analyze openings (offline)'}
        </button>
        <button
          className="btn ghost"
          type="button"
          disabled={analyzing}
          onClick={() => runBatchAnalysis(100)}
        >
          Analyze up to 100
        </button>
      </div>

      {(progress || engineNote) && (
        <p className="hint-text" aria-live="polite">
          {engineNote && <span>{engineNote}. </span>}
          {progress}
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <ul className="opening-list">
        {openings.map((o) => (
          <li key={o.key}>
            <button
              type="button"
              className={`opening-row ${selected?.key === o.key ? 'active' : ''}`}
              onClick={() => setSelected(selected?.key === o.key ? null : o)}
            >
              <div className="opening-main">
                <strong className="opening-label">{o.label}</strong>
                <span className="opening-meta">
                  {o.games} games · {o.winRate}% win · W{o.colorSplit.white}/B{o.colorSplit.black}
                </span>
              </div>
              <div className="opening-badges">
                {o.blunders > 0 && <span className="badge bad">{o.blunders} blunders</span>}
                {o.mistakes > 0 && <span className="badge warn">{o.mistakes} mistakes</span>}
                {o.analyzed === 0 && <span className="badge muted">not analyzed</span>}
                <span className={`badge rate ${o.winRate < 45 ? 'bad' : o.winRate > 55 ? 'good' : ''}`}>
                  {o.winRate}%
                </span>
              </div>
            </button>

            {selected?.key === o.key && (
              <div className="opening-detail">
                <p>
                  Avg loss in opening: <strong>{o.avgLossCp} cp</strong> · Analyzed {o.analyzed}/
                  {o.games}
                </p>
                {o.commonMistakes.length > 0 ? (
                  <ul className="mistake-list">
                    {o.commonMistakes.map((m, i) => (
                      <li key={`${m.fenBefore}-${i}`}>
                        <span className="played">{m.san}</span>
                        {m.bestSan && (
                          <>
                            {' '}
                            → prefer <span className="best">{m.bestSan}</span>
                          </>
                        )}
                        <span className="count">
                          ×{m.count} · ~{m.avgLoss}cp
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint-text">
                    {o.analyzed
                      ? 'No repeated inaccuracies found in analyzed games.'
                      : 'Run analysis to find recurring mistakes.'}
                  </p>
                )}
                <button className="btn primary" type="button" onClick={() => onTrain(o.key)}>
                  Train this line
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
