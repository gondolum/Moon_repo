export interface LichessPlayer {
  user?: { name: string; id: string }
  rating?: number
  aiLevel?: number
}

export interface LichessGame {
  id: string
  rated: boolean
  variant: string
  speed: string
  perf: string
  createdAt: number
  lastMoveAt?: number
  status: string
  players: {
    white: LichessPlayer
    black: LichessPlayer
  }
  winner?: 'white' | 'black'
  moves?: string
  clock?: { initial: number; increment: number }
  opening?: { eco?: string; name?: string }
}

export interface ImportProgress {
  loaded: number
  done: boolean
  error?: string
}

export async function fetchRacingKingsGames(
  username: string,
  opts: {
    max?: number
    onProgress?: (p: ImportProgress) => void
    signal?: AbortSignal
  } = {},
): Promise<LichessGame[]> {
  const clean = username.trim()
  if (!clean) throw new Error('Enter a Lichess username')

  const max = opts.max ?? 1000
  const params = new URLSearchParams({
    max: String(max),
    perfType: 'racingKings',
    moves: 'true',
    clocks: 'false',
    evals: 'false',
    opening: 'false',
  })

  const url = `https://lichess.org/api/games/user/${encodeURIComponent(clean)}?${params}`
  const res = await fetch(url, {
    headers: { Accept: 'application/x-ndjson' },
    signal: opts.signal,
  })

  if (res.status === 404) throw new Error(`User "${clean}" not found on Lichess`)
  if (!res.ok) throw new Error(`Lichess API error (${res.status})`)

  const games: LichessGame[] = []
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Streaming not supported in this browser')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const game = JSON.parse(trimmed) as LichessGame
        if (game.moves) games.push(game)
        opts.onProgress?.({ loaded: games.length, done: false })
      } catch {
        // skip malformed lines
      }
    }
  }

  if (buffer.trim()) {
    try {
      const game = JSON.parse(buffer.trim()) as LichessGame
      if (game.moves) games.push(game)
    } catch {
      /* ignore */
    }
  }

  opts.onProgress?.({ loaded: games.length, done: true })
  return games
}

export function playerColor(game: LichessGame, username: string): 'white' | 'black' | null {
  const u = username.toLowerCase()
  const w = game.players.white.user?.name?.toLowerCase()
  const b = game.players.black.user?.name?.toLowerCase()
  if (w === u) return 'white'
  if (b === u) return 'black'
  return null
}

export function gameResultFor(
  game: LichessGame,
  color: 'white' | 'black',
): 'win' | 'loss' | 'draw' {
  if (!game.winner) return 'draw'
  return game.winner === color ? 'win' : 'loss'
}
