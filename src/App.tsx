import { useCallback, useEffect, useState } from 'react'
import { ImportPage } from './pages/ImportPage'
import { OverviewPage } from './pages/OverviewPage'
import { TrainPage } from './pages/TrainPage'
import { getAllGames, getSettings, type AnalyzedGame } from './storage/db'
import './styles/app.css'

type Tab = 'import' | 'openings' | 'train'

export default function App() {
  const [tab, setTab] = useState<Tab>('import')
  const [games, setGames] = useState<AnalyzedGame[]>([])
  const [username, setUsername] = useState('')
  const [depth, setDepth] = useState(12)
  const [trainKey, setTrainKey] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void (async () => {
      const settings = await getSettings()
      setUsername(settings.username)
      setDepth(settings.analysisDepth)
      if (settings.username) {
        const all = await getAllGames()
        const mine = all.filter((g) => g.username === settings.username)
        setGames(mine)
        if (mine.length) setTab('openings')
      }
      setReady(true)
    })()
  }, [])

  const onImported = useCallback((imported: AnalyzedGame[], name: string) => {
    setGames(imported)
    setUsername(name)
    setTab('openings')
  }, [])

  const onTrain = useCallback((key: string) => {
    setTrainKey(key)
    setTab('train')
  }, [])

  if (!ready) {
    return (
      <div className="app-shell loading-shell">
        <p>Loading RaceLine…</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-top">
        <div className="brand-block">
          <p className="brand">RaceLine</p>
          <p className="brand-sub">Racing Kings openings</p>
        </div>
        {username && (
          <p className="user-chip" title="Active Lichess user">
            @{username}
          </p>
        )}
      </header>

      <nav className="tab-bar" aria-label="Main">
        <button
          type="button"
          className={tab === 'import' ? 'active' : ''}
          onClick={() => setTab('import')}
        >
          Import
        </button>
        <button
          type="button"
          className={tab === 'openings' ? 'active' : ''}
          onClick={() => setTab('openings')}
        >
          Openings
        </button>
        <button
          type="button"
          className={tab === 'train' ? 'active' : ''}
          onClick={() => setTab('train')}
        >
          Train
        </button>
      </nav>

      <main className="app-main">
        {tab === 'import' && (
          <ImportPage
            onImported={onImported}
            existingCount={games.length}
            username={username}
          />
        )}
        {tab === 'openings' && (
          <OverviewPage
            games={games}
            onGamesUpdated={setGames}
            onTrain={onTrain}
            analysisDepth={depth}
          />
        )}
        {tab === 'train' && (
          <TrainPage
            games={games}
            initialOpeningKey={trainKey}
            onClearInitial={() => setTrainKey(null)}
          />
        )}
      </main>

      <footer className="app-foot">
        <span>Fairy Stockfish runs locally in your browser</span>
        <span>Variant: Racing Kings</span>
      </footer>
    </div>
  )
}
