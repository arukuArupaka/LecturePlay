export type GameType = 'bingo' | 'timer' | 'presentation-bingo'
export type GridSize = 3 | 5
export type RoomStatus = 'waiting' | 'playing' | 'finished'

export interface Room {
  id: string
  host_id: string
  status: RoomStatus
  game_type: GameType
  grid_size: GridSize
  preset_bingo_cards?: string[][] | null
  total_slides: number | null
  current_slide: number
  slide_start_time: string | null
  finished_at: string | null
  created_at: string
}

export interface SlidePrediction {
  slide_number: number
  predicted_seconds: number
  timestamp: string
}

export interface SlideResult {
  slide_number: number
  predicted_seconds: number
  actual_seconds: number
  penalty_points: number
}

export interface Player {
  id: string
  room_id: string
  nickname: string
  bingo_card: string[] | null
  penalty: string | null
  completed_cells: number[]
  has_bingo: boolean
  bingo_rank: number | null
  slide_predictions: SlidePrediction[]
  slide_results: SlideResult[]
  total_penalty_points: number
  created_at: string
}

export interface BingoCell {
  index: number
  text: string
  completed: boolean
}

export interface GameNotification {
  id: string
  nickname: string
  cellText: string
  timestamp: number
}
