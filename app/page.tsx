'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { generateRoomId, generatePlayerId, storeRoomInfo } from '@/lib/game-utils'
import type { GameType, GridSize } from '@/lib/types'
import { Gamepad2, Users, Sparkles, Grid3X3, Timer, ChevronRight, Grid2X2Plus } from 'lucide-react'

export default function HomePage() {
  const router = useRouter()
  const [roomCode, setRoomCode] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')
  const [showGameOptions, setShowGameOptions] = useState(false)
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null)
  const [selectedGridSize, setSelectedGridSize] = useState<GridSize>(3)

  useEffect(() => {
    const cleanupFinishedRooms = async () => {
      try {
        const supabase = createClient()
        const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()

        const { data: rooms, error } = await supabase
          .from('rooms')
          .select('id')
          .eq('status', 'finished')
          .lt('finished_at', cutoff)

        if (error || !rooms || rooms.length === 0) return

        const roomIds = rooms.map(room => room.id)
        await supabase.from('players').delete().in('room_id', roomIds)
        await supabase.from('rooms').delete().in('id', roomIds)
      } catch (err) {
        console.error('Cleanup error:', err)
      }
    }

    cleanupFinishedRooms()
  }, [])

  const handleCreateRoom = async (gameType: GameType, gridSize: GridSize = 3) => {
    setIsCreating(true)
    setError('')
    
    try {
      const supabase = createClient()
      const playerId = generatePlayerId()
      
      // Generate unique room ID
      let roomId = generateRoomId()
      let attempts = 0
      
      while (attempts < 5) {
        const { data: existing } = await supabase
          .from('rooms')
          .select('id,status')
          .eq('id', roomId)
          .single()

        if (!existing) break

        if (existing.status === 'finished') {
          await supabase.from('players').delete().eq('room_id', roomId)
          await supabase.from('rooms').delete().eq('id', roomId)
          break
        }

        roomId = generateRoomId()
        attempts++
      }

      // Create room with game type and grid size
      const { error: roomError } = await supabase
        .from('rooms')
        .insert({ 
          id: roomId, 
          host_id: playerId, 
          status: 'waiting',
          game_type: gameType,
          grid_size: gridSize,
        })

      if (roomError) throw roomError

      // Store player ID and room info
      sessionStorage.setItem('playerId', playerId)
      storeRoomInfo(roomId, true)
      
      router.push(`/room/${roomId}/nickname`)
    } catch (err) {
      console.error('Room creation error:', err)
      setError('ルーム作成に失敗しました。もう一度試してね')
    } finally {
      setIsCreating(false)
    }
  }

  const handleJoinRoom = async () => {
    if (!roomCode.trim()) {
      setError('ルームコードを入力してね')
      return
    }

    setIsJoining(true)
    setError('')

    try {
      const supabase = createClient()
      const normalizedCode = roomCode.toUpperCase().trim()

      // Check if room exists
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', normalizedCode)
        .single()

      if (roomError || !room) {
        setError('そのルームは見つからないよ')
        return
      }

      if (room.status !== 'waiting') {
        setError(room.status === 'finished' ? 'このルームは終了したよ' : 'このルームはもうゲーム中だよ')
        return
      }

      // Generate player ID
      const playerId = generatePlayerId()
      sessionStorage.setItem('playerId', playerId)
      storeRoomInfo(normalizedCode, false)

      router.push(`/room/${normalizedCode}/nickname`)
    } catch (err) {
      console.error('Join room error:', err)
      setError('参加に失敗しました。もう一度試してね')
    } finally {
      setIsJoining(false)
    }
  }

  const handleSelectGame = (gameType: GameType) => {
    setSelectedGame(gameType)
    if (gameType === 'timer') {
      // Timer game doesn't need grid size selection
      handleCreateRoom('timer')
    }
    if (gameType === 'presentation-bingo') {
      // Presentation bingo uses fixed 3x3 cards
      handleCreateRoom('presentation-bingo', 3)
    }
    // For bingo, show grid size selection
  }

  const handleSelectGridSize = (gridSize: GridSize) => {
    setSelectedGridSize(gridSize)
    handleCreateRoom('bingo', gridSize)
  }

  const handleBack = () => {
    if (selectedGame === 'bingo') {
      setSelectedGame(null)
    } else {
      setShowGameOptions(false)
      setSelectedGame(null)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8 animate-slide-up">
        {/* Logo/Title */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="relative">
              <Gamepad2 className="w-12 h-12 text-primary" />
              <Sparkles className="w-5 h-5 text-accent absolute -top-1 -right-1 animate-pulse-soft" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">LecturePlay</h1>
          <p className="text-sm text-muted-foreground">匿名IDで10秒スタート</p>
        </div>

        {!showGameOptions && selectedGame === null ? (
          <>
            {/* Create Room Button */}
            <Button
              onClick={() => setShowGameOptions(true)}
              className="w-full h-14 text-lg font-medium bg-primary hover:bg-primary/90 text-primary-foreground animate-pop"
            >
              <Sparkles className="w-5 h-5 mr-2" />
              ルームを作る
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">または</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Join Room */}
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span className="text-sm">友達のルームに参加</span>
                </div>
                <Input
                  type="text"
                  placeholder="ルームコード (例: ABC123)"
                  value={roomCode}
                  onChange={(e) => {
                    setRoomCode(e.target.value.toUpperCase())
                    setError('')
                  }}
                  maxLength={6}
                  className="text-center text-lg tracking-widest uppercase bg-input border-border h-12"
                />
                <Button
                  onClick={handleJoinRoom}
                  disabled={isJoining || !roomCode.trim()}
                  variant="secondary"
                  className="w-full h-12"
                >
                  {isJoining ? (
                    <span className="animate-pulse-soft">参加中...</span>
                  ) : (
                    '参加する'
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Footer hint */}
            <p className="text-center text-xs text-muted-foreground">
              ログイン不要・匿名IDで参加
            </p>
          </>
        ) : showGameOptions && selectedGame === null ? (
          <>
            {/* Game Type Selection */}
            <div className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">遊ぶゲームを選んでね</p>
              
              <button
                onClick={() => handleSelectGame('bingo')}
                disabled={isCreating}
                className="w-full p-5 rounded-xl bg-card border border-border hover:border-primary/50 hover:bg-card/80 transition-all text-left group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Grid3X3 className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">講義ビンゴ</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        講義中の出来事をビンゴにしよう
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </button>

              <button
                onClick={() => handleSelectGame('timer')}
                disabled={isCreating}
                className="w-full p-5 rounded-xl bg-card border border-border hover:border-accent/50 hover:bg-card/80 transition-all text-left group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center">
                      <Timer className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">スライドタイマー</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        スライドの時間を予想しよう
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
                </div>
              </button>

              <button
                onClick={() => handleSelectGame('presentation-bingo')}
                disabled={isCreating}
                className="w-full p-5 rounded-xl bg-card border border-border hover:border-primary/50 hover:bg-card/80 transition-all text-left group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Grid3X3 className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">プレゼン用ビンゴ</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        ホストの用紙から選んで遊ぶ
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </button>

              <Button
                variant="ghost"
                onClick={() => setShowGameOptions(false)}
                className="w-full"
              >
                戻る
              </Button>
            </div>
          </>
        ) : selectedGame === 'bingo' ? (
          <>
            {/* Grid Size Selection for Bingo */}
            <div className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">ビンゴのサイズを選んでね</p>
              
              <button
                onClick={() => handleSelectGridSize(3)}
                disabled={isCreating}
                className="w-full p-5 rounded-xl bg-card border border-border hover:border-primary/50 hover:bg-card/80 transition-all text-left group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Grid3X3 className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">3x3 (9マス)</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        サクッと遊べる
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </button>

              <button
                onClick={() => handleSelectGridSize(5)}
                disabled={isCreating}
                className="w-full p-5 rounded-xl bg-card border border-border hover:border-primary/50 hover:bg-card/80 transition-all text-left group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center">
                      <Grid2X2Plus className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">5x5 (25マス)</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        じっくり遊べる
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
                </div>
              </button>

              <Button
                variant="ghost"
                onClick={handleBack}
                className="w-full"
              >
                戻る
              </Button>
            </div>
          </>
        ) : null}

        {/* Error Message */}
        {error && (
          <p className="text-center text-sm text-destructive animate-slide-up">
            {error}
          </p>
        )}

        {/* Loading state */}
        {isCreating && (
          <p className="text-center text-sm text-muted-foreground animate-pulse-soft">
            ルーム作成中...
          </p>
        )}
      </div>
    </main>
  )
}
