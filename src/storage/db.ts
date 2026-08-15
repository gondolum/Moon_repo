import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { LichessGame } from '../lichess/api'

export type MistakeKind = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

export interface MoveAnalysis {
  ply: number
  uci: string
  san: string
  fenBefore: string
  bestUci?: string
  bestSan?: string
  playedScoreCp?: number
  bestScoreCp?: number
  lossCp?: number
  kind: MistakeKind
}

export interface AnalyzedGame {
  id: string
  username: string
  color: 'white' | 'black'
  result: 'win' | 'loss' | 'draw'
  rated: boolean
  speed: string
  createdAt: number
  opponent: string
  moves: string[]
  openingKey: string
  openingLabel: string
  analysis?: MoveAnalysis[]
  analyzedAt?: number
  openingMistakes?: number
  avgLossCp?: number
}

export interface AppSettings {
  username: string
  analysisDepth: number
  openingPlyLimit: number
}

export interface TrainingProgress {
  openingKey: string
  learned: boolean
  practiceStreak: number
  lastPracticed?: number
  mastered: boolean
}

interface RaceLineDB extends DBSchema {
  games: {
    key: string
    value: AnalyzedGame
    indexes: {
      'by-username': string
      'by-opening': string
      'by-date': number
    }
  }
  settings: {
    key: string
    value: AppSettings
  }
  training: {
    key: string
    value: TrainingProgress
  }
}

const DB_NAME = 'raceline-rk'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<RaceLineDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<RaceLineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('games')) {
          const games = db.createObjectStore('games', { keyPath: 'id' })
          games.createIndex('by-username', 'username')
          games.createIndex('by-opening', 'openingKey')
          games.createIndex('by-date', 'createdAt')
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings')
        }
        if (!db.objectStoreNames.contains('training')) {
          db.createObjectStore('training', { keyPath: 'openingKey' })
        }
      },
    })
  }
  return dbPromise
}

export async function saveGames(games: AnalyzedGame[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('games', 'readwrite')
  await Promise.all([...games.map((g) => tx.store.put(g)), tx.done])
}

export async function getGamesForUser(username: string): Promise<AnalyzedGame[]> {
  const db = await getDb()
  return db.getAllFromIndex('games', 'by-username', username.toLowerCase())
}

export async function getAllGames(): Promise<AnalyzedGame[]> {
  const db = await getDb()
  return db.getAll('games')
}

export async function getGame(id: string): Promise<AnalyzedGame | undefined> {
  const db = await getDb()
  return db.get('games', id)
}

export async function updateGame(game: AnalyzedGame): Promise<void> {
  const db = await getDb()
  await db.put('games', game)
}

export async function clearGames(username?: string): Promise<void> {
  const db = await getDb()
  if (!username) {
    await db.clear('games')
    return
  }
  const games = await getGamesForUser(username)
  const tx = db.transaction('games', 'readwrite')
  await Promise.all([...games.map((g) => tx.store.delete(g.id)), tx.done])
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb()
  const s = await db.get('settings', 'main')
  return (
    s ?? {
      username: '',
      analysisDepth: 12,
      openingPlyLimit: 16,
    }
  )
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDb()
  await db.put('settings', settings, 'main')
}

export async function getTrainingProgress(openingKey: string) {
  const db = await getDb()
  return db.get('training', openingKey)
}

export async function saveTrainingProgress(progress: TrainingProgress) {
  const db = await getDb()
  await db.put('training', progress)
}

export async function getAllTraining() {
  const db = await getDb()
  return db.getAll('training')
}

export function lichessToAnalyzed(
  game: LichessGame,
  username: string,
  color: 'white' | 'black',
  result: 'win' | 'loss' | 'draw',
  openingKey: string,
  openingLabel: string,
): AnalyzedGame {
  const moves = (game.moves ?? '').trim().split(/\s+/).filter(Boolean)
  const opponentUser =
    color === 'white' ? game.players.black.user?.name : game.players.white.user?.name
  const opponentAi =
    color === 'white' ? game.players.black.aiLevel : game.players.white.aiLevel
  return {
    id: game.id,
    username: username.toLowerCase(),
    color,
    result,
    rated: game.rated,
    speed: game.speed,
    createdAt: game.createdAt,
    opponent: opponentUser ?? (opponentAi != null ? `AI level ${opponentAi}` : 'Unknown'),
    moves,
    openingKey,
    openingLabel,
  }
}
