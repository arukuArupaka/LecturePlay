'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { getOrCreatePlayerId, getRoomInfo, countBingoLines } from '@/lib/game-utils'
import type { Player, Room, GameNotification, GridSize } from '@/lib/types'
import { Bell, Trophy, Users } from 'lucide-react'

export default function BingoPlayPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.roomId as string

  const [players, setPlayers] = useState<Player[]>([])
  const [room, setRoom] = useState<Room | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [notifications, setNotifications] = useState<GameNotification[]>([])
  const [gridSize, setGridSize] = useState<GridSize>(3)
  const [isHost, setIsHost] = useState(false)
  
  const playerId = typeof window !== 'undefined' ? getOrCreatePlayerId() : ''

  const fetchData = useCallback(async () => {
    const supabase = createClient()

    // Fetch room
    const { data: roomData } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (roomData) {
      setRoom(roomData)
      setGridSize((roomData.grid_size || 3) as GridSize)
      if (roomData.status === 'finished') {
        router.push(`/room/${roomId}/results`)
        return
      }
    }

    // Fetch players
    const { data: playersData } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('bingo_rank', { ascending: true, nullsFirst: false })

    if (playersData) {
      setPlayers(playersData)
      const me = playersData.find(p => p.id === playerId)
      if (me) {
        setCurrentPlayer(me)
      }
    }

    const { isHost: storedIsHost } = getRoomInfo()
    setIsHost(storedIsHost || roomData?.host_id === playerId)
  }, [roomId, playerId, router])

  useEffect(() => {
    fetchData()

    const supabase = createClient()

    // Listen for player updates (cell completions, bingo)
    const playersChannel = supabase
      .channel(`game:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const updatedPlayer = payload.new as Player

          // Show notification for cell completion
          if (updatedPlayer.id !== playerId) {
            const previousPlayer = payload.old as Player | null
            const oldCells = previousPlayer?.completed_cells || []
            const newCells = updatedPlayer.completed_cells || []
            const newCompletedIndex = newCells.find((c: number) => !oldCells.includes(c))

            if (newCompletedIndex !== undefined && updatedPlayer.bingo_card) {
              const cellText = updatedPlayer.bingo_card[newCompletedIndex]
              if (cellText) {
                addNotification(updatedPlayer.nickname, cellText)
              }
            }
          }

          fetchData()
        }
      )
      .subscribe()

    // Listen for room status changes
    const roomChannel = supabase
      .channel(`room-status:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const newRoom = payload.new as Room
          setRoom(newRoom)
          if (newRoom.status === 'finished') {
            router.push(`/room/${roomId}/results`)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(playersChannel)
      supabase.removeChannel(roomChannel)
    }
  }, [roomId, fetchData, playerId, players, router])

  const addNotification = (nickname: string, cellText: string) => {
    const notification: GameNotification = {
      id: `${Date.now()}-${Math.random()}`,
      nickname,
      cellText,
      timestamp: Date.now(),
    }
    setNotifications(prev => [...prev, notification])

    // Auto-remove after 3 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
    }, 3000)
  }

  const handleCellTap = async (cellIndex: number) => {
    if (!currentPlayer) return

    const completedCells = currentPlayer.completed_cells || []
    const isCompleted = completedCells.includes(cellIndex)
    const newCompletedCells = isCompleted
      ? completedCells.filter(index => index !== cellIndex)
      : [...completedCells, cellIndex]
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('players')
        .update({
          completed_cells: newCompletedCells,
        })
        .eq('id', playerId)
        .eq('room_id', roomId)

      if (error) throw error

      // Update local state immediately
      setCurrentPlayer(prev => prev ? {
        ...prev,
        completed_cells: newCompletedCells,
      } : null)

      // Add self notification only when marking a cell
      if (!isCompleted && currentPlayer.bingo_card) {
        addNotification(currentPlayer.nickname, currentPlayer.bingo_card[cellIndex])
      }
    } catch (err) {
      console.error('Cell tap error:', err)
    }
  }

  const completedCells = currentPlayer?.completed_cells || []
  const lineCount = countBingoLines(completedCells, gridSize)
  const wordCount = completedCells.length

  const handleFinishGame = async () => {
    try {
      const supabase = createClient()
      await supabase
        .from('rooms')
        .update({ status: 'finished', finished_at: new Date().toISOString() })
        .eq('id', roomId)
      router.push(`/room/${roomId}/results`)
    } catch (err) {
      console.error('Finish game error:', err)
    }
  }

  return (
    <main className="min-h-screen flex flex-col p-4">
      <div className="w-full max-w-md mx-auto space-y-4 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {players.length}人参加中
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent" />
            <span className="text-sm text-accent font-medium">
              揃った列 {lineCount} / マス {wordCount}
            </span>
          </div>
        </div>

        {/* Bingo Grid */}
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div 
              className="grid gap-2"
              style={{ 
                gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` 
              }}
            >
              {currentPlayer?.bingo_card?.map((cellText, index) => {
                const isCompleted = completedCells.includes(index)
                return (
                  <button
                    key={index}
                    onClick={() => handleCellTap(index)}
                    className={`
                      ${gridSize === 5 ? 'h-16 text-[10px]' : 'h-24 text-xs'}
                      p-2 rounded-lg font-medium
                      flex items-center justify-center text-center
                      transition-all duration-200
                      ${isCompleted
                        ? 'bg-primary text-primary-foreground scale-95'
                        : 'bg-muted hover:bg-muted/80 text-foreground active:scale-95'
                      }
                    `}
                  >
                    {cellText}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Hint */}
        <p className="text-center text-xs text-muted-foreground">
          起きたことをタップしてね
        </p>

        {/* Notifications */}
        <div className="fixed bottom-4 left-4 right-4 space-y-2 pointer-events-none z-50">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className="bg-card/95 backdrop-blur border border-border rounded-lg p-3 shadow-lg animate-slide-up"
            >
              <div className="flex items-start gap-2">
                <Bell className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm">
                    <span className="text-muted-foreground">報告あり: </span>
                    <span className="font-medium text-foreground">{notification.nickname}</span>
                  </p>
                  <p className="text-sm text-primary mt-0.5">{notification.cellText}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Rankings Preview */}
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-3">揃った列数ランキング</p>
            <div className="space-y-2">
              {players
                .map(player => ({
                  ...player,
                  lineCount: countBingoLines(player.completed_cells || [], gridSize),
                  wordCount: (player.completed_cells || []).length,
                }))
                .sort((a, b) => {
                  if (b.lineCount !== a.lineCount) return b.lineCount - a.lineCount
                  return b.wordCount - a.wordCount
                })
                .map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className={player.id === playerId ? 'text-primary font-medium' : 'text-foreground'}>
                      {player.nickname}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                      {player.lineCount}列 / {player.wordCount}マス
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {isHost && (
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground text-center">
                講義が終わったら結果へ進めるよ
              </p>
              <Button
                onClick={handleFinishGame}
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                結果を表示する
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
