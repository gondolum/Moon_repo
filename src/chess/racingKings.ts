import { RacingKings } from 'chessops/variant'
import { parseFen, makeFen } from 'chessops/fen'
import { parseSan, makeSan } from 'chessops/san'
import { makeSquare, parseSquare, opposite } from 'chessops/util'
import type { Color, Move, Role, Square } from 'chessops/types'
import type { Position } from 'chessops/chess'
import { chessgroundDests } from 'chessops/compat'

export const RACING_KINGS_START_FEN =
  '8/8/8/8/8/8/krbnNBRK/qrbnNBRQ w - - 0 1'

export const OPENING_PLY_LIMIT = 16 // first 8 full moves

export type PieceRole = Role

export interface BoardPiece {
  role: PieceRole
  color: Color
}

export function createPosition(fen = RACING_KINGS_START_FEN): RacingKings {
  if (fen === RACING_KINGS_START_FEN || fen === 'startpos') {
    return RacingKings.default()
  }
  const setup = parseFen(fen)
  if (setup.isErr) {
    throw new Error(`Invalid FEN: ${fen}`)
  }
  const pos = RacingKings.fromSetup(setup.value)
  if (pos.isErr) {
    throw new Error(`Illegal Racing Kings setup: ${fen}`)
  }
  return pos.value
}

export function fenOf(pos: Position): string {
  return makeFen(pos.toSetup())
}

export function parseUciMove(uci: string): Move | undefined {
  if (uci.length < 4) return undefined
  const from = parseSquare(uci.slice(0, 2))
  const to = parseSquare(uci.slice(2, 4))
  if (from === undefined || to === undefined) return undefined
  const promotion =
    uci.length > 4
      ? ({ q: 'queen', r: 'rook', b: 'bishop', n: 'knight' } as const)[
          uci[4] as 'q' | 'r' | 'b' | 'n'
        ]
      : undefined
  return { from, to, promotion }
}

export function moveToUci(move: Move): string {
  if ('from' in move) {
    const promo = move.promotion
      ? { queen: 'q', rook: 'r', bishop: 'b', knight: 'n', king: '', pawn: '' }[
          move.promotion
        ]
      : ''
    return `${makeSquare(move.from)}${makeSquare(move.to)}${promo}`
  }
  return ''
}

export function playSan(pos: RacingKings, san: string): Move | undefined {
  const move = parseSan(pos, san)
  if (!move) return undefined
  pos.play(move)
  return move
}

export function playUci(pos: RacingKings, uci: string): Move | undefined {
  const move = parseUciMove(uci)
  if (!move) return undefined
  if (!pos.isLegal(move)) return undefined
  pos.play(move)
  return move
}

export function sanOf(pos: Position, move: Move): string {
  return makeSan(pos, move)
}

export function legalDests(pos: Position): Map<string, string[]> {
  const dests = chessgroundDests(pos)
  const out = new Map<string, string[]>()
  for (const [from, tos] of dests) {
    out.set(from, [...tos])
  }
  return out
}

export function piecesMap(pos: Position): Map<string, BoardPiece> {
  const map = new Map<string, BoardPiece>()
  for (const [sq, piece] of pos.board) {
    map.set(makeSquare(sq), { role: piece.role, color: piece.color })
  }
  return map
}

export function parseMoveList(moves: string): string[] {
  // Lichess ndjson "moves" is space-separated UCI
  return moves.trim().split(/\s+/).filter(Boolean)
}

export function replayToPly(
  uciMoves: string[],
  ply: number,
): { fen: string; sans: string[]; pos: RacingKings } {
  const pos = createPosition()
  const sans: string[] = []
  const limit = Math.min(ply, uciMoves.length)
  for (let i = 0; i < limit; i++) {
    const before = pos.clone()
    const move = playUci(pos, uciMoves[i])
    if (!move) break
    sans.push(sanOf(before, move))
  }
  return { fen: fenOf(pos), sans, pos }
}

export function openingKey(uciMoves: string[], color: Color, maxPly = OPENING_PLY_LIMIT): string {
  const relevant: string[] = []
  for (let i = 0; i < Math.min(uciMoves.length, maxPly); i++) {
    const isPlayerMove =
      (color === 'white' && i % 2 === 0) || (color === 'black' && i % 2 === 1)
    if (isPlayerMove || relevant.length > 0) {
      relevant.push(uciMoves[i])
    }
  }
  // Key by first few plies of the game for grouping
  return uciMoves.slice(0, Math.min(6, uciMoves.length)).join(' ')
}

export function lineLabel(uciMoves: string[], maxPly = 6): string {
  const { sans } = replayToPly(uciMoves, maxPly)
  if (sans.length === 0) return 'Starting position'
  const parts: string[] = []
  for (let i = 0; i < sans.length; i++) {
    if (i % 2 === 0) parts.push(`${Math.floor(i / 2) + 1}.`)
    parts.push(sans[i])
  }
  return parts.join(' ')
}

export function squareColor(square: string): 'light' | 'dark' {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  return (file + rank) % 2 === 0 ? 'dark' : 'light'
}

export function kingSquare(pos: Position, color: Color): string | undefined {
  for (const [sq, piece] of pos.board) {
    if (piece.role === 'king' && piece.color === color) {
      return makeSquare(sq)
    }
  }
  return undefined
}

export function oppositeColor(color: Color): Color {
  return opposite(color)
}

export type { Color, Move, Square, Position }
