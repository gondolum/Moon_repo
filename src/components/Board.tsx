import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import {
  createPosition,
  fenOf,
  legalDests,
  piecesMap,
  playUci,
  type BoardPiece,
} from '../chess/racingKings'
import './Board.css'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS_WHITE = [8, 7, 6, 5, 4, 3, 2, 1]
const RANKS_BLACK = [1, 2, 3, 4, 5, 6, 7, 8]

const PIECE_GLYPH: Record<string, string> = {
  'white-king': '♔',
  'white-queen': '♕',
  'white-rook': '♖',
  'white-bishop': '♗',
  'white-knight': '♘',
  'black-king': '♚',
  'black-queen': '♛',
  'black-rook': '♜',
  'black-bishop': '♝',
  'black-knight': '♞',
}

interface BoardProps {
  fen: string
  orientation?: 'white' | 'black'
  interactive?: boolean
  highlightSquares?: string[]
  lastMove?: { from: string; to: string } | null
  hintMove?: { from: string; to: string } | null
  onMove?: (uci: string) => void
  turnColor?: 'white' | 'black'
}

export function Board({
  fen,
  orientation = 'white',
  interactive = false,
  highlightSquares = [],
  lastMove = null,
  hintMove = null,
  onMove,
}: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [dests, setDests] = useState<string[]>([])
  const boardRef = useRef<HTMLDivElement>(null)

  const pieces = useMemo(() => {
    try {
      return piecesMap(createPosition(fen))
    } catch {
      return new Map<string, BoardPiece>()
    }
  }, [fen])

  const legal = useMemo(() => {
    try {
      return legalDests(createPosition(fen))
    } catch {
      return new Map<string, string[]>()
    }
  }, [fen])

  useEffect(() => {
    setSelected(null)
    setDests([])
  }, [fen])

  const ranks = orientation === 'white' ? RANKS_WHITE : RANKS_BLACK
  const files = orientation === 'white' ? FILES : [...FILES].reverse()

  const onSquareClick = useCallback(
    (sq: string) => {
      if (!interactive || !onMove) return
      if (selected && dests.includes(sq)) {
        onMove(`${selected}${sq}`)
        setSelected(null)
        setDests([])
        return
      }
      const piece = pieces.get(sq)
      const moves = legal.get(sq) ?? []
      if (piece && moves.length) {
        setSelected(sq)
        setDests(moves)
      } else {
        setSelected(null)
        setDests([])
      }
    },
    [interactive, onMove, selected, dests, pieces, legal],
  )

  return (
    <div className="rk-board-wrap" ref={boardRef}>
      <div className="rk-board" role="grid" aria-label="Racing Kings board">
        {ranks.map((rank) =>
          files.map((file) => {
            const sq = `${file}${rank}`
            const piece = pieces.get(sq)
            const isLight = (file.charCodeAt(0) - 97 + rank) % 2 === 1
            const isSelected = selected === sq
            const isDest = dests.includes(sq)
            const isLast =
              lastMove && (lastMove.from === sq || lastMove.to === sq)
            const isHint =
              hintMove && (hintMove.from === sq || hintMove.to === sq)
            const isHi = highlightSquares.includes(sq)
            return (
              <button
                key={sq}
                type="button"
                className={[
                  'rk-sq',
                  isLight ? 'light' : 'dark',
                  isSelected ? 'selected' : '',
                  isDest ? 'dest' : '',
                  isLast ? 'last' : '',
                  isHint ? 'hint' : '',
                  isHi ? 'highlight' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSquareClick(sq)}
                aria-label={sq}
              >
                {isDest && !piece && <span className="dest-dot" />}
                {isDest && piece && <span className="dest-capture" />}
                {piece && (
                  <span
                    className={`piece ${piece.color}`}
                    data-role={piece.role}
                  >
                    {PIECE_GLYPH[`${piece.color}-${piece.role}`]}
                  </span>
                )}
                <span className="coord">
                  {file === files[0] ? rank : ''}
                  {rank === ranks[ranks.length - 1] ? file : ''}
                </span>
              </button>
            )
          }),
        )}
      </div>
    </div>
  )
}

export function fenAfterUci(fen: string, uci: string): string | null {
  try {
    const pos = createPosition(fen)
    if (!playUci(pos, uci)) return null
    return fenOf(pos)
  } catch {
    return null
  }
}
