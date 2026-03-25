import type { GridSize } from './types'

// Generate unique room ID (6 alphanumeric characters)
export function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Generate unique player ID
export function generatePlayerId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// Random nickname generator (Japanese casual style)
const NICKNAMES = [
  '眠たい人',
  '天才かも',
  '単位やばい',
  'ノート忘れた',
  '前の席',
  '後ろの席',
  'コーヒー派',
  'エナドリ派',
  'レポート地獄',
  '出席足りない',
  '全休マン',
  '朝弱い',
  '徹夜明け',
  '空腹',
  'スマホ充電中',
  'イヤホン片耳',
  'ボーッとしてる',
  '窓際族',
  '真面目に聞いてる',
  'メモ魔',
]

export function generateRandomNickname(): string {
  return NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)]
}

// Sample bingo items for different grid sizes
const SAMPLE_CELLS_3X3 = [
  '先生が「えーと」と言う',
  'スライドが飛ばされる',
  '誰かがくしゃみする',
  '先生がコーヒー飲む',
  '窓の外を見る人がいる',
  '先生が黒板に書く',
  'パソコンがフリーズする',
  '誰かが遅刻してくる',
  '質問タイムが来る',
]

const SAMPLE_CELLS_5X5 = [
  '先生が「えーと」と言う',
  'スライドが飛ばされる',
  '誰かがくしゃみする',
  '先生がコーヒー飲む',
  '窓の外を見る人がいる',
  '先生が黒板に書く',
  'パソコンがフリーズする',
  '誰かが遅刻してくる',
  '質問タイムが来る',
  '先生が時間を確認する',
  '誰かの携帯が鳴る',
  '先生が脱線する',
  '寝てる人がいる',
  '先生がため息をつく',
  '外が騒がしくなる',
  '誰かがあくびする',
  '先生が水を飲む',
  '資料が配られる',
  '先生が声を張る',
  'マイクがハウリングする',
  '先生が前回の復習をする',
  '誰かが教室を出る',
  '先生がジョークを言う',
  '板書が読めない',
  '出席確認がある',
]

export function getSampleCells(gridSize: GridSize): string[] {
  const samples = gridSize === 5 ? SAMPLE_CELLS_5X5 : SAMPLE_CELLS_3X3
  return [...samples].sort(() => Math.random() - 0.5)
}

const SAMPLE_PENALTIES = [
  '次の休み時間にジュース奢り',
  '今日のノート係になる',
  '帰りにコンビニおごり',
  'みんなの前で一発芸',
  '来週の席は一番前',
]

export function getRandomPenalty(): string {
  return SAMPLE_PENALTIES[Math.floor(Math.random() * SAMPLE_PENALTIES.length)]
}

// Check for bingo (supports 3x3 and 5x5 grids)
export function checkBingo(completedCells: number[], gridSize: GridSize = 3): boolean {
  const size = gridSize
  const lines: number[][] = []

  // Rows
  for (let row = 0; row < size; row++) {
    const line: number[] = []
    for (let col = 0; col < size; col++) {
      line.push(row * size + col)
    }
    lines.push(line)
  }

  // Columns
  for (let col = 0; col < size; col++) {
    const line: number[] = []
    for (let row = 0; row < size; row++) {
      line.push(row * size + col)
    }
    lines.push(line)
  }

  // Diagonals
  const diag1: number[] = []
  const diag2: number[] = []
  for (let i = 0; i < size; i++) {
    diag1.push(i * size + i)
    diag2.push(i * size + (size - 1 - i))
  }
  lines.push(diag1, diag2)

  return lines.some(line => 
    line.every(cell => completedCells.includes(cell))
  )
}

export function countBingoLines(completedCells: number[], gridSize: GridSize = 3): number {
  const size = gridSize
  const lines: number[][] = []

  for (let row = 0; row < size; row++) {
    const line: number[] = []
    for (let col = 0; col < size; col++) {
      line.push(row * size + col)
    }
    lines.push(line)
  }

  for (let col = 0; col < size; col++) {
    const line: number[] = []
    for (let row = 0; row < size; row++) {
      line.push(row * size + col)
    }
    lines.push(line)
  }

  const diag1: number[] = []
  const diag2: number[] = []
  for (let i = 0; i < size; i++) {
    diag1.push(i * size + i)
    diag2.push(i * size + (size - 1 - i))
  }
  lines.push(diag1, diag2)

  return lines.filter(line => line.every(cell => completedCells.includes(cell))).length
}

// Store/retrieve player ID from sessionStorage
export function getOrCreatePlayerId(): string {
  if (typeof window === 'undefined') return generatePlayerId()
  
  let playerId = sessionStorage.getItem('playerId')
  if (!playerId) {
    playerId = generatePlayerId()
    sessionStorage.setItem('playerId', playerId)
  }
  return playerId
}

// Store room info in sessionStorage
export function storeRoomInfo(roomId: string, isHost: boolean): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem('currentRoomId', roomId)
  sessionStorage.setItem('isHost', isHost.toString())
}

export function getRoomInfo(): { roomId: string | null; isHost: boolean } {
  if (typeof window === 'undefined') return { roomId: null, isHost: false }
  return {
    roomId: sessionStorage.getItem('currentRoomId'),
    isHost: sessionStorage.getItem('isHost') === 'true',
  }
}

export function clearRoomInfo(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem('currentRoomId')
  sessionStorage.removeItem('isHost')
}

// Timer game utilities
export function calculatePenaltyPoints(predicted: number, actual: number): number {
  return Math.abs(predicted - actual)
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function formatSignedSeconds(diffSeconds: number): string {
  const sign = diffSeconds >= 0 ? '+' : '-'
  const absSeconds = Math.abs(diffSeconds)
  return `${sign}${absSeconds}秒`
}
