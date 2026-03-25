'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { getOrCreatePlayerId, getRoomInfo } from '@/lib/game-utils'
import type { Player, Room, GridSize, SlidePrediction } from '@/lib/types'
import { Users, Crown, Copy, Check, Play, ArrowRight, Grid3X3, Timer, Grid2X2Plus } from 'lucide-react'

export default function WaitingRoomPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.roomId as string

  const [players, setPlayers] = useState<Player[]>([])
  const [room, setRoom] = useState<Room | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [hasSetup, setHasSetup] = useState(false)
  const [totalSlides, setTotalSlides] = useState('')
  const [slidePrediction, setSlidePrediction] = useState(60)
  const [isSavingPrediction, setIsSavingPrediction] = useState(false)
  const [predictionError, setPredictionError] = useState('')

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
      if (roomData.status === 'playing') {
        if (roomData.game_type === 'timer') {
          router.push(`/room/${roomId}/timer`)
          return
        }
        router.push(`/room/${roomId}/play`)
        return
      }
    }

    // Fetch players
    const { data: playersData } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })

    if (playersData) {
      setPlayers(playersData)
      const me = playersData.find(p => p.id === playerId)
      if (me) {
        setCurrentPlayer(me)
        // Check setup status based on game type
        if (roomData?.game_type === 'timer') {
          const predictions: SlidePrediction[] = me.slide_predictions || []
          const firstPrediction = predictions.find((p: SlidePrediction) => p.slide_number === 1)
          if (firstPrediction) {
            setSlidePrediction(firstPrediction.predicted_seconds)
          }
          setHasSetup(!!firstPrediction)
        } else if (roomData?.game_type === 'presentation-bingo') {
          const expectedCells = 9
          setHasSetup(!!me.bingo_card && me.bingo_card.length === expectedCells)
        } else {
          const gridSize = roomData?.grid_size || 3
          const expectedCells = gridSize * gridSize
          setHasSetup(!!me.bingo_card && me.bingo_card.length === expectedCells && !!me.penalty)
        }
      }
    }

    // Check if host
    const { isHost: storedIsHost } = getRoomInfo()
    setIsHost(storedIsHost || roomData?.host_id === playerId)
  }, [roomId, playerId, router])

  useEffect(() => {
    fetchData()

    // Fallback polling in case realtime is delayed
    const pollId = setInterval(() => {
      fetchData()
    }, 2000)

    // Set up realtime subscription
    const supabase = createClient()
    
    const playersChannel = supabase
      .channel(`players:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchData()
        }
      )
      .subscribe()

    const roomChannel = supabase
      .channel(`room:${roomId}`)
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
          if (newRoom.status === 'playing') {
            if (newRoom.game_type === 'timer') {
              router.push(`/room/${roomId}/timer`)
              return
            }
            router.push(`/room/${roomId}/play`)
          }
        }
      )
      .subscribe()

    return () => {
      clearInterval(pollId)
      supabase.removeChannel(playersChannel)
      supabase.removeChannel(roomChannel)
    }
  }, [roomId, fetchData, router])

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSetupBingo = () => {
    router.push(`/room/${roomId}/setup`)
  }

  const handleSaveFirstPrediction = async () => {
    if (!room || room.game_type !== 'timer' || !currentPlayer) return

    if (slidePrediction < 10 || slidePrediction > 300) {
      setPredictionError('10〜300秒で入力してね')
      return
    }

    setIsSavingPrediction(true)
    setPredictionError('')

    try {
      const supabase = createClient()
      const existing = currentPlayer.slide_predictions || []
      const updatedPredictions: SlidePrediction[] = [
        ...existing.filter(p => p.slide_number !== 1),
        {
          slide_number: 1,
          predicted_seconds: slidePrediction,
          timestamp: new Date().toISOString(),
        },
      ]

      const { error } = await supabase
        .from('players')
        .update({ slide_predictions: updatedPredictions })
        .eq('id', playerId)
        .eq('room_id', roomId)

      if (error) throw error

      setHasSetup(true)
    } catch (err) {
      console.error('Prediction save error:', err)
      setPredictionError('保存に失敗しました。もう一度試してね')
    } finally {
      setIsSavingPrediction(false)
    }
  }

  const normalizePresetCards = (cards: Room['preset_bingo_cards']) =>
    Array.isArray(cards) ? cards : []

  const isValidPresetCards = (cards: string[][]) =>
    cards.length >= 5 && cards.every(card => card.length === 9 && card.every(cell => cell.trim()))

  const handleStartGame = async () => {
    if (!room) return

    if (room.game_type !== 'timer') {
      if (room.game_type === 'presentation-bingo') {
        const presetCards = normalizePresetCards(room.preset_bingo_cards)
        if (!isValidPresetCards(presetCards)) {
          alert('ホストがビンゴ用紙を5枚以上作ってね')
          return
        }
      } else {
        // Check if all players have set up their bingo cards
        const gridSize = room.grid_size || 3
        const expectedCells = gridSize * gridSize
        const allReady = players.every(p => p.bingo_card && p.bingo_card.length === expectedCells && p.penalty)
        
        if (!allReady) {
          alert('まだビンゴカードを作ってない人がいるよ')
          return
        }
      }
    } else {
      const allReady = players.every(p =>
        (p.slide_predictions || []).some(pred => pred.slide_number === 1)
      )
      if (!allReady) {
        alert('まだ予想してない人がいるよ')
        return
      }

      // Timer game: validate total slides
      const slides = parseInt(totalSlides)
      if (!slides || slides < 1 || slides > 100) {
        alert('スライド数を1〜100で入力してね')
        return
      }
    }

    setIsStarting(true)
    try {
      const supabase = createClient()
      
      if (room.game_type === 'timer') {
        const { error } = await supabase
          .from('rooms')
          .update({ 
            status: 'playing',
            total_slides: parseInt(totalSlides),
            current_slide: 1,
            slide_start_time: new Date().toISOString(),
          })
          .eq('id', roomId)

        if (error) throw error
        router.push(`/room/${roomId}/timer`)
      } else {
        const { error } = await supabase
          .from('rooms')
          .update({ status: 'playing' })
          .eq('id', roomId)

        if (error) throw error
        router.push(`/room/${roomId}/play`)
      }
    } catch (err) {
      console.error('Start game error:', err)
      alert('ゲーム開始に失敗しました')
    } finally {
      setIsStarting(false)
    }
  }

  const getReadyCount = () => {
    if (!room) return 0
    if (room.game_type === 'timer') {
      return players.filter(p =>
        (p.slide_predictions || []).some(pred => pred.slide_number === 1)
      ).length
    }
    if (room.game_type === 'presentation-bingo') {
      return players.filter(p => p.bingo_card && p.bingo_card.length === 9).length
    }
    const gridSize = room.grid_size || 3
    const expectedCells = gridSize * gridSize
    return players.filter(p => p.bingo_card && p.bingo_card.length === expectedCells && p.penalty).length
  }

  const readyCount = getReadyCount()

  const getGameIcon = () => {
    if (room?.game_type === 'timer') {
      return <Timer className="w-4 h-4 text-accent" />
    }
    return room?.grid_size === 5 
      ? <Grid2X2Plus className="w-4 h-4 text-primary" />
      : <Grid3X3 className="w-4 h-4 text-primary" />
  }

  const getGameLabel = () => {
    if (room?.game_type === 'timer') {
      return 'スライドタイマー'
    }
    if (room?.game_type === 'presentation-bingo') {
      return 'プレゼン用ビンゴ 3x3'
    }
    return room?.grid_size === 5 ? 'ビンゴ 5x5' : 'ビンゴ 3x3'
  }

  return (
    <main className="min-h-screen flex flex-col p-4">
      <div className="w-full max-w-sm mx-auto space-y-6 animate-slide-up">
        {/* Room Code Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            {getGameIcon()}
            <span className="text-sm text-muted-foreground">{getGameLabel()}</span>
          </div>
          <p className="text-xs text-muted-foreground">ルームコード</p>
          <button
            onClick={handleCopyCode}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
          >
            <span className="font-mono text-2xl font-bold tracking-widest text-foreground">
              {roomId}
            </span>
            {copied ? (
              <Check className="w-5 h-5 text-green-500" />
            ) : (
              <Copy className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
          <p className="text-xs text-muted-foreground">
            {copied ? 'コピーしたよ' : 'タップでコピー'}
          </p>
        </div>

        {/* Players List */}
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="w-4 h-4" />
                <span className="text-sm">参加者</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {readyCount}/{players.length} 準備完了
              </span>
            </div>
            
            <div className="space-y-2">
              {players.map((player) => {
                const gridSize = room?.grid_size || 3
                const expectedCells = gridSize * gridSize
                const isReady = room?.game_type === 'timer'
                  ? (player.slide_predictions || []).some(pred => pred.slide_number === 1)
                  : room?.game_type === 'presentation-bingo'
                    ? (player.bingo_card && player.bingo_card.length === 9)
                    : (player.bingo_card && player.bingo_card.length === expectedCells && player.penalty)
                const isMe = player.id === playerId
                const isPlayerHost = room?.host_id === player.id

                return (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      isMe ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isPlayerHost && (
                        <Crown className="w-4 h-4 text-accent" />
                      )}
                      <span className={`text-sm ${isMe ? 'font-medium text-foreground' : 'text-foreground'}`}>
                        {player.nickname}
                        {isMe && <span className="text-primary ml-1">(自分)</span>}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      isReady 
                        ? 'bg-green-500/20 text-green-500' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {isReady ? '準備OK' : '準備中...'}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3">
          {(room?.game_type === 'bingo' || room?.game_type === 'presentation-bingo') && !hasSetup ? (
            <Button
              onClick={handleSetupBingo}
              className="w-full h-14 text-lg font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {room?.game_type === 'presentation-bingo'
                ? (isHost ? 'ビンゴ用紙を作る' : 'ビンゴ用紙を選ぶ')
                : 'ビンゴカードを作る'
              }
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          ) : (room?.game_type === 'bingo' || room?.game_type === 'presentation-bingo') && hasSetup ? (
            <div className="text-center p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-green-500 font-medium">準備完了</p>
              <p className="text-xs text-muted-foreground mt-1">
                ホストがゲームを開始するのを待ってね
              </p>
            </div>
          ) : room?.game_type === 'timer' && !hasSetup ? (
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <p className="text-sm text-muted-foreground">1枚目の時間を予想</p>
                <div className="text-center">
                  <span className="text-2xl font-mono font-bold text-foreground">
                    {slidePrediction}秒
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={300}
                  step={5}
                  value={slidePrediction}
                  onChange={(e) => setSlidePrediction(parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>10秒</span>
                  <span>5分</span>
                </div>
                {predictionError && (
                  <p className="text-center text-xs text-destructive">
                    {predictionError}
                  </p>
                )}
                <Button
                  onClick={handleSaveFirstPrediction}
                  disabled={isSavingPrediction}
                  className="w-full"
                >
                  {isSavingPrediction ? '保存中...' : 'この予想で決定'}
                </Button>
              </CardContent>
            </Card>
          ) : room?.game_type === 'timer' && hasSetup ? (
            <div className="text-center p-4 rounded-lg bg-accent/10 border border-accent/20">
              <p className="text-accent font-medium">1枚目の予想済み</p>
              <p className="text-xs text-muted-foreground mt-1">
                ホストがスライド数を設定して開始するよ
              </p>
            </div>
          ) : null}

          {/* Host: Total slides input for timer game */}
          {isHost && room?.game_type === 'timer' && (
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <p className="text-sm text-muted-foreground">スライド数を入力</p>
                <Input
                  type="number"
                  placeholder="例: 30"
                  value={totalSlides}
                  onChange={(e) => setTotalSlides(e.target.value)}
                  min={1}
                  max={100}
                  className="text-center text-lg bg-input border-border h-12"
                />
                <p className="text-xs text-muted-foreground">
                  今日の講義は何枚のスライド?
                </p>
              </CardContent>
            </Card>
          )}

          {isHost && (
            <Button
              onClick={handleStartGame}
              disabled={isStarting || ((room?.game_type === 'bingo') && (readyCount < players.length || players.length < 1)) || (room?.game_type === 'timer' && (readyCount < players.length || !totalSlides || parseInt(totalSlides) < 1))}
              className="w-full h-14 text-lg font-medium bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {isStarting ? (
                <span className="animate-pulse-soft">開始中...</span>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  ゲームスタート
                </>
              )}
            </Button>
          )}
        </div>

        {/* Footer hint */}
        <p className="text-center text-xs text-muted-foreground">
          {room?.game_type === 'timer'
            ? '全員が1枚目を予想したら開始できるよ'
            : '全員が準備完了したらゲーム開始できるよ'
          }
        </p>
      </div>
    </main>
  )
}
