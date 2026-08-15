export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported'

export interface EngineInfo {
  depth: number
  multipv: number
  scoreCp?: number
  scoreMate?: number
  pv: string[]
  bestMove?: string
  nodes?: number
}

type Listener = (line: string) => void

function browserSupportsEngine(): boolean {
  if (typeof WebAssembly !== 'object') return false
  if (typeof Atomics !== 'object') return false
  if (typeof SharedArrayBuffer !== 'function') return false
  return true
}

interface StockfishModule {
  postMessage: (cmd: string) => void
  addMessageListener: (cb: Listener) => void
  removeMessageListener: (cb: Listener) => void
  FS?: {
    writeFile: (path: string, data: Uint8Array) => void
  }
}

declare global {
  interface Window {
    Stockfish?: (opts?: { wasmBinary?: ArrayBuffer; locateFile?: (f: string) => string }) => Promise<StockfishModule>
  }
}

export class FairyStockfishEngine {
  private sf: StockfishModule | null = null
  private listeners = new Set<Listener>()
  private ready = false
  status: EngineStatus = 'idle'
  errorMessage = ''

  async init(): Promise<void> {
    if (this.ready) return
    if (!browserSupportsEngine()) {
      this.status = 'unsupported'
      this.errorMessage =
        'This browser cannot run Fairy Stockfish (needs SharedArrayBuffer / cross-origin isolation). Try Chrome or Firefox over HTTPS.'
      throw new Error(this.errorMessage)
    }

    this.status = 'loading'
    try {
      await this.loadScript('/engine/stockfish.js')
      if (!window.Stockfish) throw new Error('Stockfish factory missing')

      const wasmBinary = await fetch('/engine/stockfish.wasm').then((r) => {
        if (!r.ok) throw new Error('Failed to download stockfish.wasm')
        return r.arrayBuffer()
      })

      this.sf = await window.Stockfish({
        wasmBinary,
        locateFile: (file) => `/engine/${file}`,
      })

      this.sf.addMessageListener((line) => {
        for (const l of this.listeners) l(line)
      })

      await this.uciBoot()
      this.ready = true
      this.status = 'ready'
    } catch (e) {
      this.status = 'error'
      this.errorMessage = e instanceof Error ? e.message : String(e)
      throw e
    }
  }

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve()
        return
      }
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error(`Failed to load ${src}`))
      document.head.appendChild(s)
    })
  }

  private post(cmd: string) {
    if (!this.sf) throw new Error('Engine not loaded')
    this.sf.postMessage(cmd)
  }

  private waitFor(predicate: (line: string) => boolean, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(onLine)
        reject(new Error('Engine timeout'))
      }, timeoutMs)
      const onLine = (line: string) => {
        if (predicate(line)) {
          clearTimeout(timer)
          this.off(onLine)
          resolve(line)
        }
      }
      this.on(onLine)
    })
  }

  on(cb: Listener) {
    this.listeners.add(cb)
  }

  off(cb: Listener) {
    this.listeners.delete(cb)
  }

  private async uciBoot() {
    this.post('uci')
    await this.waitFor((l) => l === 'uciok')
    this.post('setoption name UCI_Variant value racingkings')
    this.post('setoption name Threads value 1')
    this.post('setoption name Hash value 64')
    this.post('setoption name Use NNUE value false')
    this.post('isready')
    await this.waitFor((l) => l === 'readyok')
  }

  async stop(): Promise<void> {
    if (!this.sf) return
    this.post('stop')
    await new Promise((r) => setTimeout(r, 50))
  }

  async analyzePosition(
    fen: string,
    opts: { depth?: number; movetime?: number; multipv?: number } = {},
  ): Promise<EngineInfo> {
    if (!this.ready) await this.init()
    await this.stop()

    const depth = opts.depth ?? 14
    const multipv = opts.multipv ?? 1
    this.post(`setoption name MultiPV value ${multipv}`)
    this.post(`position fen ${fen}`)

    const infos = new Map<number, EngineInfo>()
    let bestMove = ''

    const done = new Promise<EngineInfo>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(onLine)
        reject(new Error('Analysis timeout'))
      }, (opts.movetime ?? 8000) + 10000)

      const onLine = (line: string) => {
        if (line.startsWith('info ') && line.includes(' score ') && line.includes(' pv ')) {
          const parsed = parseInfoLine(line)
          if (parsed) infos.set(parsed.multipv, parsed)
        }
        if (line.startsWith('bestmove ')) {
          clearTimeout(timer)
          this.off(onLine)
          bestMove = line.split(/\s+/)[1] ?? ''
          const primary = infos.get(1) ?? {
            depth: 0,
            multipv: 1,
            pv: bestMove && bestMove !== '(none)' ? [bestMove] : [],
          }
          resolve({ ...primary, bestMove: bestMove === '(none)' ? undefined : bestMove })
        }
      }
      this.on(onLine)
    })

    if (opts.movetime) {
      this.post(`go movetime ${opts.movetime}`)
    } else {
      this.post(`go depth ${depth}`)
    }

    return done
  }

  async bestMove(
    fen: string,
    opts: { depth?: number; movetime?: number } = {},
  ): Promise<string | undefined> {
    const info = await this.analyzePosition(fen, { ...opts, multipv: 1 })
    return info.bestMove
  }
}

function parseInfoLine(line: string): EngineInfo | null {
  const parts = line.split(/\s+/)
  const get = (key: string) => {
    const i = parts.indexOf(key)
    return i >= 0 ? parts[i + 1] : undefined
  }

  const depth = Number(get('depth') ?? 0)
  const multipv = Number(get('multipv') ?? 1)
  const nodes = get('nodes') ? Number(get('nodes')) : undefined

  let scoreCp: number | undefined
  let scoreMate: number | undefined
  const scoreIdx = parts.indexOf('score')
  if (scoreIdx >= 0) {
    if (parts[scoreIdx + 1] === 'cp') scoreCp = Number(parts[scoreIdx + 2])
    if (parts[scoreIdx + 1] === 'mate') scoreMate = Number(parts[scoreIdx + 2])
  }

  const pvIdx = parts.indexOf('pv')
  if (pvIdx < 0) return null
  const pv = parts.slice(pvIdx + 1).filter((t) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t))

  return { depth, multipv, scoreCp, scoreMate, pv, nodes }
}

let singleton: FairyStockfishEngine | null = null

export function getEngine(): FairyStockfishEngine {
  if (!singleton) singleton = new FairyStockfishEngine()
  return singleton
}

/** Convert score to white-perspective centipawns-ish for comparisons */
export function scoreToWhiteCp(info: EngineInfo, sideToMove: 'white' | 'black'): number {
  let raw: number
  if (info.scoreMate !== undefined) {
    raw = info.scoreMate > 0 ? 100000 - info.scoreMate : -100000 - info.scoreMate
  } else {
    raw = info.scoreCp ?? 0
  }
  return sideToMove === 'white' ? raw : -raw
}
