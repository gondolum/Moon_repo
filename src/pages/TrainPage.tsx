import { useEffect, useMemo, useState } from 'react'
import type { AnalyzedGame } from '../storage/db'
import { getTrainingProgress, saveTrainingProgress, getGame } from '../storage/db'
import { buildCorrectedTrainingLine, buildOpeningOverview } from '../analysis/openings'
import { Board, fenAfterUci } from '../components/Board'
import { RACING_KINGS_START_FEN } from '../chess/racingKings'

type Phase = 'pick' | 'learn' | 'practice' | 'done'

interface TrainPageProps {
  games: AnalyzedGame[]
  initialOpeningKey?: string | null
  onClearInitial?: () => void
}

export function TrainPage({ games, initialOpeningKey, onClearInitial }: TrainPageProps) {
  const openings = useMemo(() => buildOpeningOverview(games), [games])
  const [openingKey, setOpeningKey] = useState<string | null>(initialOpeningKey ?? null)
  const [phase, setPhase] = useState<Phase>('pick')
  const [stepIndex, setStepIndex] = useState(0)
  const [fen, setFen] = useState(RACING_KINGS_START_FEN)
  const [feedback, setFeedback] = useState<'idle' | 'correct' | 'wrong'>('idle')
  const [showHint, setShowHint] = useState(false)
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null)
  const [computerThinking, setComputerThinking] = useState(false)
  const [practicePerfect, setPracticePerfect] = useState(true)
  const [lineGame, setLineGame] = useState<AnalyzedGame | null>(null)

  const line = useMemo(() => {
    if (!lineGame) return null
    return buildCorrectedTrainingLine(lineGame)
  }, [lineGame])

  useEffect(() => {
    if (initialOpeningKey) {
      setOpeningKey(initialOpeningKey)
      onClearInitial?.()
    }
  }, [initialOpeningKey, onClearInitial])

  useEffect(() => {
    async function load() {
      if (!openingKey) return
      const group = games.filter((g) => g.openingKey === openingKey)
      const withAnalysis = group.find((g) => g.analysis?.length) ?? group[0]
      if (!withAnalysis) return
      const fresh = (await getGame(withAnalysis.id)) ?? withAnalysis
      setLineGame(fresh)
      setPhase('pick')
    }
    void load()
  }, [openingKey, games])

  function resetBoardToStart() {
    setFen(RACING_KINGS_START_FEN)
    setStepIndex(0)
    setFeedback('idle')
    setShowHint(false)
    setLastMove(null)
    setPracticePerfect(true)
  }

  function startLearn() {
    resetBoardToStart()
    setPhase('learn')
  }

  async function startPractice() {
    resetBoardToStart()
    setPhase('practice')
    if (openingKey) {
      const prev = (await getTrainingProgress(openingKey)) ?? {
        openingKey,
        learned: true,
        practiceStreak: 0,
        mastered: false,
      }
      await saveTrainingProgress({ ...prev, learned: true })
    }
  }

  async function finishLearn() {
    setPhase('pick')
    setFeedback('idle')
    if (openingKey) {
      await saveTrainingProgress({
        openingKey,
        learned: true,
        practiceStreak: 0,
        mastered: false,
        lastPracticed: Date.now(),
      })
    }
  }

  async function finishPractice() {
    setPhase('done')
    if (openingKey) {
      const prev = (await getTrainingProgress(openingKey)) ?? {
        openingKey,
        learned: true,
        practiceStreak: 0,
        mastered: false,
      }
      const streak = practicePerfect ? prev.practiceStreak + 1 : 0
      await saveTrainingProgress({
        ...prev,
        practiceStreak: streak,
        mastered: streak >= 2,
        lastPracticed: Date.now(),
      })
    }
  }

  async function onPlayerMove(uci: string) {
    if (!line || (phase !== 'learn' && phase !== 'practice')) return
    const step = line.steps[stepIndex]
    if (!step) return

    if (uci !== step.expectUci) {
      setFeedback('wrong')
      if (phase === 'practice') setPracticePerfect(false)
      return
    }

    setFeedback('correct')
    const nextFen = fenAfterUci(fen, uci)
    if (!nextFen) return
    setFen(nextFen)
    setLastMove({ from: uci.slice(0, 2), to: uci.slice(2, 4) })
    setShowHint(false)

    const next = stepIndex + 1
    if (next >= line.steps.length) {
      window.setTimeout(() => {
        if (phase === 'learn') void finishLearn()
        else void finishPractice()
      }, 450)
      return
    }

    setComputerThinking(true)
    window.setTimeout(() => {
      // Next step fen already includes the opponent reply from the trained game line
      setFen(line.steps[next].fen)
      setStepIndex(next)
      setFeedback('idle')
      setComputerThinking(false)
      setLastMove(null)
    }, 380)
  }

  const hintMove =
    showHint && line?.steps[stepIndex]
      ? {
          from: line.steps[stepIndex].expectUci.slice(0, 2),
          to: line.steps[stepIndex].expectUci.slice(2, 4),
        }
      : null

  if (games.length === 0) {
    return (
      <section className="page">
        <header className="page-header">
          <p className="eyebrow">Training</p>
          <h2>Import games first</h2>
          <p className="lede">Training lines are built from your own Racing Kings openings.</p>
        </header>
      </section>
    )
  }

  return (
    <section className="page train-page">
      <header className="page-header">
        <p className="eyebrow">Opening trainer</p>
        <h2>Learn, then prove it</h2>
        <p className="lede">
          Study the corrected line with hints, then repeat without suggestions. Perfect practice
          earns a checkmark.
        </p>
      </header>

      {phase === 'pick' && (
        <div className="train-pick">
          <label className="field">
            <span>Opening line</span>
            <select
              value={openingKey ?? ''}
              onChange={(e) => setOpeningKey(e.target.value || null)}
            >
              <option value="">Select an opening…</option>
              {openings.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label} ({o.games} games, {o.winRate}%)
                </option>
              ))}
            </select>
          </label>

          {line && (
            <div className="train-actions">
              <p className="hint-text">
                Playing as <strong>{line.color}</strong> · {line.steps.length} moves to learn
                {lineGame?.analysis?.length
                  ? ' (blunders replaced with engine recommendations)'
                  : ' (analyze first for corrected moves)'}
              </p>
              <button className="btn primary" type="button" onClick={startLearn}>
                1. Learn with suggestions
              </button>
              <button className="btn ghost" type="button" onClick={() => void startPractice()}>
                2. Practice without hints
              </button>
            </div>
          )}
        </div>
      )}

      {(phase === 'learn' || phase === 'practice') && line && (
        <div className="train-session">
          <div className="train-status">
            <span className="phase-pill">{phase === 'learn' ? 'Learn mode' : 'Practice mode'}</span>
            <span>
              Move {stepIndex + 1}/{line.steps.length}
            </span>
            {computerThinking && <span>Opponent…</span>}
            {feedback === 'correct' && <span className="ok">Correct</span>}
            {feedback === 'wrong' && <span className="bad">Try again</span>}
          </div>

          <Board
            fen={fen}
            orientation={line.color}
            interactive={!computerThinking && feedback !== 'correct'}
            lastMove={lastMove}
            hintMove={phase === 'learn' ? hintMove : null}
            onMove={(uci) => void onPlayerMove(uci)}
          />

          <div className="train-controls">
            {phase === 'learn' && (
              <>
                <p className="hint-text">
                  Suggested: <strong>{line.steps[stepIndex]?.hintSan}</strong>
                </p>
                <button className="btn ghost" type="button" onClick={() => setShowHint(true)}>
                  Show square hint
                </button>
              </>
            )}
            {phase === 'practice' && (
              <p className="hint-text">No hints — play the learned moves.</p>
            )}
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setPhase('pick')
                resetBoardToStart()
              }}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="train-done">
          {practicePerfect ? (
            <>
              <div className="checkmark" aria-hidden>
                ✓
              </div>
              <h3>Line mastered this run</h3>
              <p>Perfect practice — every move matched the trained line.</p>
            </>
          ) : (
            <>
              <h3>Completed with corrections</h3>
              <p>You finished the line, but had wrong attempts. Try again for a checkmark.</p>
            </>
          )}
          <div className="train-actions">
            <button className="btn primary" type="button" onClick={() => void startPractice()}>
              Practice again
            </button>
            <button className="btn ghost" type="button" onClick={() => setPhase('pick')}>
              Choose another line
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
