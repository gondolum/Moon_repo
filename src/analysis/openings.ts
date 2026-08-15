import {
  createPosition,
  fenOf,
  lineLabel,
  openingKey,
  playUci,
  sanOf,
  OPENING_PLY_LIMIT,
} from '../chess/racingKings'
import { getEngine, scoreToWhiteCp, type EngineInfo } from '../engine/fairyStockfish'
import type { AnalyzedGame, MistakeKind, MoveAnalysis } from '../storage/db'
import { updateGame } from '../storage/db'
import type { RacingKings } from 'chessops/variant'

function classifyLoss(lossCp: number): MistakeKind {
  if (lossCp <= 20) return 'best'
  if (lossCp <= 50) return 'good'
  if (lossCp <= 100) return 'inaccuracy'
  if (lossCp <= 200) return 'mistake'
  return 'blunder'
}

async function analyzeAfter(
  fenBefore: string,
  uci: string,
  depth: number,
  reuse?: EngineInfo,
): Promise<EngineInfo> {
  if (reuse && (reuse.bestMove === uci || reuse.pv[0] === uci)) return reuse
  const engine = getEngine()
  const pos = createPosition(fenBefore)
  playUci(pos, uci)
  return engine.analyzePosition(fenOf(pos), { depth, multipv: 1 })
}

function trySan(pos: RacingKings, uci: string): string | undefined {
  const clone = pos.clone()
  const move = playUci(clone, uci)
  return move ? sanOf(pos, move) : undefined
}

export async function analyzeGameOpening(
  game: AnalyzedGame,
  opts: {
    depth?: number
    plyLimit?: number
    onPly?: (done: number, total: number) => void
    signal?: AbortSignal
  } = {},
): Promise<AnalyzedGame> {
  const engine = getEngine()
  await engine.init()

  const depth = opts.depth ?? 12
  const plyLimit = Math.min(opts.plyLimit ?? OPENING_PLY_LIMIT, game.moves.length)
  const analysis: MoveAnalysis[] = []
  const pos = createPosition()

  for (let ply = 0; ply < plyLimit; ply++) {
    if (opts.signal?.aborted) throw new Error('Analysis cancelled')

    const isPlayerMove =
      (game.color === 'white' && ply % 2 === 0) ||
      (game.color === 'black' && ply % 2 === 1)

    const fenBefore = fenOf(pos)
    const before = pos.clone()
    const uci = game.moves[ply]
    const move = playUci(pos, uci)
    if (!move) break
    const san = sanOf(before, move)

    if (!isPlayerMove) {
      opts.onPly?.(ply + 1, plyLimit)
      continue
    }

    const sideToMove = before.turn
    const bestInfo = await engine.analyzePosition(fenBefore, { depth, multipv: 1 })
    const bestUci = bestInfo.bestMove ?? bestInfo.pv[0]
    const bestSan = bestUci ? trySan(before, bestUci) : undefined

    const playerSign = game.color === 'white' ? 1 : -1
    let lossCp = 0

    if (bestUci && bestUci !== uci) {
      const [playedAfter, bestAfter] = await Promise.all([
        analyzeAfter(fenBefore, uci, depth),
        analyzeAfter(fenBefore, bestUci, depth, bestInfo),
      ])
      const playedWhite = scoreToWhiteCp(
        playedAfter,
        sideToMove === 'white' ? 'black' : 'white',
      )
      const bestAfterWhite = scoreToWhiteCp(
        bestAfter,
        sideToMove === 'white' ? 'black' : 'white',
      )
      lossCp = Math.max(0, Math.round((bestAfterWhite - playedWhite) * playerSign))
    }

    const kind = classifyLoss(lossCp)
    analysis.push({
      ply,
      uci,
      san,
      fenBefore,
      bestUci,
      bestSan,
      lossCp,
      kind,
    })

    opts.onPly?.(ply + 1, plyLimit)
  }

  const mistakes = analysis.filter((a) => a.kind === 'mistake' || a.kind === 'blunder')
  const avgLoss =
    analysis.length > 0
      ? Math.round(analysis.reduce((s, a) => s + (a.lossCp ?? 0), 0) / analysis.length)
      : 0

  const updated: AnalyzedGame = {
    ...game,
    analysis,
    analyzedAt: Date.now(),
    openingMistakes: mistakes.length,
    avgLossCp: avgLoss,
    openingKey: openingKey(game.moves, game.color),
    openingLabel: lineLabel(game.moves, 6),
  }
  await updateGame(updated)
  return updated
}

export interface OpeningStats {
  key: string
  label: string
  games: number
  wins: number
  draws: number
  losses: number
  winRate: number
  analyzed: number
  mistakes: number
  blunders: number
  avgLossCp: number
  commonMistakes: {
    san: string
    bestSan?: string
    fenBefore: string
    count: number
    avgLoss: number
  }[]
  colorSplit: { white: number; black: number }
  sampleGameId?: string
}

export function buildOpeningOverview(games: AnalyzedGame[]): OpeningStats[] {
  const map = new Map<string, AnalyzedGame[]>()
  for (const g of games) {
    const key = g.openingKey || openingKey(g.moves, g.color)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(g)
  }

  const stats: OpeningStats[] = []
  for (const [key, group] of map) {
    const wins = group.filter((g) => g.result === 'win').length
    const draws = group.filter((g) => g.result === 'draw').length
    const losses = group.filter((g) => g.result === 'loss').length
    const analyzed = group.filter((g) => g.analysis?.length)
    let mistakes = 0
    let blunders = 0
    let lossSum = 0
    let lossCount = 0
    const mistakeMap = new Map<
      string,
      { san: string; bestSan?: string; fenBefore: string; count: number; lossSum: number }
    >()

    for (const g of analyzed) {
      for (const a of g.analysis!) {
        if (a.kind === 'mistake' || a.kind === 'blunder' || a.kind === 'inaccuracy') {
          if (a.kind === 'mistake') mistakes++
          if (a.kind === 'blunder') blunders++
          const mk = `${a.fenBefore}|${a.san}`
          const prev = mistakeMap.get(mk)
          if (prev) {
            prev.count++
            prev.lossSum += a.lossCp ?? 0
          } else {
            mistakeMap.set(mk, {
              san: a.san,
              bestSan: a.bestSan,
              fenBefore: a.fenBefore,
              count: 1,
              lossSum: a.lossCp ?? 0,
            })
          }
        }
        lossSum += a.lossCp ?? 0
        lossCount++
      }
    }

    const commonMistakes = [...mistakeMap.values()]
      .map((m) => ({
        san: m.san,
        bestSan: m.bestSan,
        fenBefore: m.fenBefore,
        count: m.count,
        avgLoss: Math.round(m.lossSum / m.count),
      }))
      .sort((a, b) => b.count - a.count || b.avgLoss - a.avgLoss)
      .slice(0, 8)

    stats.push({
      key,
      label: group[0].openingLabel || lineLabel(group[0].moves, 6),
      games: group.length,
      wins,
      draws,
      losses,
      winRate: group.length ? Math.round((wins / group.length) * 100) : 0,
      analyzed: analyzed.length,
      mistakes,
      blunders,
      avgLossCp: lossCount ? Math.round(lossSum / lossCount) : 0,
      commonMistakes,
      colorSplit: {
        white: group.filter((g) => g.color === 'white').length,
        black: group.filter((g) => g.color === 'black').length,
      },
      sampleGameId: analyzed[0]?.id ?? group[0]?.id,
    })
  }

  return stats.sort((a, b) => {
    const scoreA = a.winRate - a.blunders * 3 - a.mistakes - (a.games < 3 ? 50 : 0)
    const scoreB = b.winRate - b.blunders * 3 - b.mistakes - (b.games < 3 ? 50 : 0)
    return scoreA - scoreB
  })
}

/** Corrected training line: keep opponent replies; replace player blunders with engine best */
export function buildCorrectedTrainingLine(game: AnalyzedGame): {
  color: 'white' | 'black'
  steps: { fen: string; expectUci: string; expectSan: string; hintSan: string }[]
} {
  const steps: { fen: string; expectUci: string; expectSan: string; hintSan: string }[] = []
  const pos = createPosition()
  const limit = Math.min(OPENING_PLY_LIMIT, game.moves.length)

  for (let ply = 0; ply < limit; ply++) {
    const isPlayer =
      (game.color === 'white' && ply % 2 === 0) ||
      (game.color === 'black' && ply % 2 === 1)
    const fen = fenOf(pos)
    const before = pos.clone()
    const gameUci = game.moves[ply]
    const analyzed = game.analysis?.find((a) => a.ply === ply)

    if (isPlayer) {
      const useBest =
        analyzed?.bestUci &&
        (analyzed.kind === 'mistake' ||
          analyzed.kind === 'blunder' ||
          analyzed.kind === 'inaccuracy')
      const expectUci = useBest ? analyzed!.bestUci! : gameUci
      const expectSan = trySan(before, expectUci) ?? gameUci
      steps.push({ fen, expectUci, expectSan, hintSan: expectSan })
      if (!playUci(pos, expectUci)) break
    } else {
      if (!playUci(pos, gameUci)) break
    }
  }

  return { color: game.color, steps }
}
