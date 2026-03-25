'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { getOrCreatePlayerId, getRoomInfo, formatTime, calculatePenaltyPoints, formatSignedSeconds } from '@/lib/game-utils'
import type { Player, Room, SlidePrediction, SlideResult } from '@/lib/types'
import { Timer, Users, ChevronRight, Clock, Target, AlertTriangle, Trophy } from 'lucide-react'

export default function TimerGamePage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.roomId as string

  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [prediction, setPrediction] = useState<number | null>(null)
  const [hasPredicted, setHasPredicted] = useState(false)
  const [showSlider, setShowSlider] = useState(false)
  const [sliderValue, setSliderValue] = useState(60)
  const [lastResult, setLastResult] = useState<SlideResult | null>(null)

  const playerId = typeof window !== 'undefined' ? getOrCreatePlayerId() : ''
  const timerRef = useRef<NodeJS.Timeout | null>(null)

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
      if (roomData.status === 'finished') {
        router.push(`/room/${roomId}/timer-results`)
        return
      }

      // Calculate elapsed time
      if (roomData.slide_start_time) {
        const startTime = new Date(roomData.slide_start_time).getTime()
        const now = Date.now()
        setElapsedTime(Math.floor((now - startTime) / 1000))
      }
    }

    // Fetch players
    const { data: playersData } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('total_penalty_points', { ascending: true })

    if (playersData) {
      setPlayers(playersData)
      const me = playersData.find(p => p.id === playerId)
      if (me) {
        setCurrentPlayer(me)
        // Check if already predicted for current slide
        const currentSlide = roomData?.current_slide || 1
        const predictions = me.slide_predictions || []
        const currentPrediction = predictions.find((p: SlidePrediction) => p.slide_number === currentSlide)
        if (currentPrediction) {
          setPrediction(currentPrediction.predicted_seconds)
          setHasPredicted(true)
          setShowSlider(false)
        } else {
          setPrediction(null)
          setHasPredicted(false)
          // Keep slider open while the user is choosing a value
          setShowSlider(prev => prev)
        }
      }
    }

    // Check if host
    const { isHost: storedIsHost } = getRoomInfo()
    setIsHost(storedIsHost || roomData?.host_id === playerId)
  }, [roomId, playerId, router])

  // Timer effect
  useEffect(() => {
    if (room?.slide_start_time && room.status === 'playing') {
      timerRef.current = setInterval(() => {
        const startTime = new Date(room.slide_start_time!).getTime()
        const now = Date.now()
        setElapsedTime(Math.floor((now - startTime) / 1000))
      }, 1000)

      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }
  }, [room?.slide_start_time, room?.status])

  useEffect(() => {
    fetchData()

    // Fallback polling in case realtime is delayed
    const pollId = setInterval(() => {
      fetchData()
    }, 2000)

    const supabase = createClient()

    // Listen for room updates
    const roomChannel = supabase
      .channel(`timer-room:${roomId}`)
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
            router.push(`/room/${roomId}/timer-results`)
          } else {
            // New slide started, reset prediction state
            setHasPredicted(false)
            setPrediction(null)
            setShowSlider(false)
            setLastResult(null)
            fetchData()
          }
        }
      )
      .subscribe()

    // Listen for player updates
    const playersChannel = supabase
      .channel(`timer-players:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchData()
        }
      )
      .subscribe()

    return () => {
      clearInterval(pollId)
      supabase.removeChannel(roomChannel)
      supabase.removeChannel(playersChannel)
    }
  }, [roomId, fetchData, router])

  const handlePredict = async () => {
    if (!room || hasPredicted) return

    setShowSlider(true)
  }

  const handleConfirmPrediction = async () => {
    if (!room || !currentPlayer) return

    const currentSlide = room.current_slide || 1
    const newPrediction: SlidePrediction = {
      slide_number: currentSlide,
      predicted_seconds: sliderValue,
      timestamp: new Date().toISOString(),
    }

    const updatedPredictions = [...(currentPlayer.slide_predictions || []), newPrediction]

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('players')
        .update({ slide_predictions: updatedPredictions })
        .eq('id', playerId)
        .eq('room_id', roomId)

      if (error) throw error

      setPrediction(sliderValue)
      setHasPredicted(true)
      setShowSlider(false)
    } catch (err) {
      console.error('Prediction error:', err)
    }
  }

  const handleNextSlide = async () => {
    if (!room || !isHost) return

    const currentSlide = room.current_slide || 1
    const actualTime = elapsedTime

    // Calculate penalty points for all players
    const supabase = createClient()

    for (const player of players) {
      const predictions = player.slide_predictions || []
      const currentPrediction = predictions.find((p: SlidePrediction) => p.slide_number === currentSlide)
      
      if (currentPrediction) {
        const penaltyPoints = calculatePenaltyPoints(currentPrediction.predicted_seconds, actualTime)
        const newResult: SlideResult = {
          slide_number: currentSlide,
          predicted_seconds: currentPrediction.predicted_seconds,
          actual_seconds: actualTime,
          penalty_points: penaltyPoints,
        }

        const updatedResults = [...(player.slide_results || []), newResult]
        const newTotalPenalty = (player.total_penalty_points || 0) + penaltyPoints

        await supabase
          .from('players')
          .update({
            slide_results: updatedResults,
            total_penalty_points: newTotalPenalty,
          })
          .eq('id', player.id)
          .eq('room_id', roomId)

        // Store last result for current player
        if (player.id === playerId) {
          setLastResult(newResult)
        }
      }
    }

    // Check if game is finished
    if (currentSlide >= (room.total_slides || 1)) {
      await supabase
        .from('rooms')
        .update({ status: 'finished', finished_at: new Date().toISOString() })
        .eq('id', roomId)
      router.push(`/room/${roomId}/timer-results`)
    } else {
      // Move to next slide
      await supabase
        .from('rooms')
        .update({
          current_slide: currentSlide + 1,
          slide_start_time: new Date().toISOString(),
        })
        .eq('id', roomId)
    }
  }

  const predictedCount = players.filter(p => {
    const currentSlide = room?.current_slide || 1
    const predictions = p.slide_predictions || []
    return predictions.some((pred: SlidePrediction) => pred.slide_number === currentSlide)
  }).length

  return (
    <main className="min-h-screen flex flex-col p-4">
      <div className="w-full max-w-sm mx-auto space-y-4 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-accent" />
            <span className="text-sm text-muted-foreground">スライドタイマー</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {players.length}人
            </span>
          </div>
        </div>

        {/* Current Slide */}
        <Card className="bg-card border-border">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">現在のスライド</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-4xl font-bold text-foreground">
                {room?.current_slide || 1}
              </span>
              <span className="text-lg text-muted-foreground">
                / {room?.total_slides || '?'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Timer Display */}
        <Card className="bg-accent/10 border-accent/30">
          <CardContent className="p-6 text-center">
            <Clock className="w-8 h-8 text-accent mx-auto mb-2" />
            <p className="text-xs text-muted-foreground mb-2">経過時間</p>
            <p className="text-4xl font-mono font-bold text-accent">
              {formatTime(elapsedTime)}
            </p>
          </CardContent>
        </Card>

        {/* Prediction Section */}
        {!hasPredicted && !showSlider && (
          <Button
            onClick={handlePredict}
            className="w-full h-14 text-lg font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Target className="w-5 h-5 mr-2" />
            このスライドの時間を予想する
          </Button>
        )}

        {showSlider && (
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                このスライドは何秒かかると思う?
              </p>
              <div className="text-center">
                <span className="text-3xl font-mono font-bold text-foreground">
                  {formatTime(sliderValue)}
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={300}
                step={5}
                value={sliderValue}
                onChange={(e) => setSliderValue(parseInt(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>10秒</span>
                <span>5分</span>
              </div>
              <Button
                onClick={handleConfirmPrediction}
                className="w-full"
              >
                この予想で決定
              </Button>
            </CardContent>
          </Card>
        )}

        {hasPredicted && prediction !== null && (
          <Card className="bg-green-500/10 border-green-500/30">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-green-500 font-medium">予想済み</p>
              <p className="text-2xl font-mono font-bold text-foreground mt-2">
                {formatTime(prediction)}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {predictedCount}/{players.length} 人が予想済み
              </p>
            </CardContent>
          </Card>
        )}

        {/* Last Result */}
        {lastResult && (
          <Card className={`border ${lastResult.penalty_points <= 10 ? 'bg-green-500/10 border-green-500/30' : 'bg-destructive/10 border-destructive/30'}`}>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">前のスライドの結果</p>
              <div className="flex items-center justify-center gap-4 mt-2">
                <div>
                  <p className="text-xs text-muted-foreground">予想</p>
                  <p className="text-lg font-mono">{formatTime(lastResult.predicted_seconds)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">実際</p>
                  <p className="text-lg font-mono">{formatTime(lastResult.actual_seconds)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                差分 {formatSignedSeconds(lastResult.predicted_seconds - lastResult.actual_seconds)}
              </p>
              <p className={`text-sm font-medium mt-2 ${lastResult.penalty_points <= 10 ? 'text-green-500' : 'text-destructive'}`}>
                +{lastResult.penalty_points} ペナルティ
              </p>
            </CardContent>
          </Card>
        )}

        {/* Host Controls */}
        {isHost && (
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">ホスト用</span>
              </div>
              <Button
                onClick={handleNextSlide}
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                {(room?.current_slide || 1) >= (room?.total_slides || 1) ? (
                  <>
                    <Trophy className="w-5 h-5 mr-2" />
                    ゲーム終了
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-5 h-5 mr-2" />
                    次のスライドへ
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                スライドが変わったらタップしてね
              </p>
            </CardContent>
          </Card>
        )}

        {/* Leaderboard Preview */}
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-3">ランキング (ペナルティ少ない順)</p>
            <div className="space-y-2">
              {players
                .sort((a, b) => (a.total_penalty_points || 0) - (b.total_penalty_points || 0))
                .slice(0, 5)
                .map((player, index) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                        index === 0 ? 'bg-accent/20 text-accent' : 'bg-muted text-muted-foreground'
                      }`}>
                        {index + 1}
                      </span>
                      <span className={player.id === playerId ? 'text-primary font-medium' : 'text-foreground'}>
                        {player.nickname}
                      </span>
                    </div>
                    <span className="text-muted-foreground font-mono">
                      {player.total_penalty_points || 0}pt
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
