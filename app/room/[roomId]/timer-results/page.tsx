'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { getOrCreatePlayerId, clearRoomInfo, formatTime, formatSignedSeconds } from '@/lib/game-utils'
import type { Player, SlideResult } from '@/lib/types'
import { Trophy, Timer, Home, Crown, Sparkles, TrendingDown, Skull } from 'lucide-react'

export default function TimerResultsPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.roomId as string

  const [players, setPlayers] = useState<Player[]>([])
  const [winner, setWinner] = useState<Player | null>(null)
  const [loser, setLoser] = useState<Player | null>(null)
  
  const playerId = typeof window !== 'undefined' ? getOrCreatePlayerId() : ''

  const fetchData = useCallback(async () => {
    const supabase = createClient()

    const { data: playersData } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('total_penalty_points', { ascending: true })

    if (playersData && playersData.length > 0) {
      setPlayers(playersData)
      setWinner(playersData[0])
      if (playersData.length > 1) {
        setLoser(playersData[playersData.length - 1])
      }
    }
  }, [roomId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleBackToHome = async () => {
    try {
      const supabase = createClient()
      await supabase.from('players').delete().eq('id', playerId).eq('room_id', roomId)

      const { data: remaining } = await supabase
        .from('players')
        .select('id')
        .eq('room_id', roomId)

      if (!remaining || remaining.length === 0) {
        await supabase.from('rooms').delete().eq('id', roomId)
      }
    } catch (err) {
      console.error('Leave room error:', err)
    } finally {
      clearRoomInfo()
      router.push('/')
    }
  }

  const isMe = (player: Player) => player.id === playerId
  const currentPlayer = players.find(p => p.id === playerId)

  const getRankStyle = (index: number) => {
    if (index === 0) return 'bg-accent/20 border-accent/30'
    if (index === 1) return 'bg-muted/50 border-muted'
    if (index === 2) return 'bg-amber-900/20 border-amber-600/30'
    return 'bg-muted/30 border-border'
  }

  return (
    <main className="min-h-screen flex flex-col p-4">
      <div className="w-full max-w-sm mx-auto space-y-6 animate-slide-up">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="relative">
              <Trophy className="w-12 h-12 text-accent" />
              <Sparkles className="w-5 h-5 text-primary absolute -top-1 -right-1 animate-pulse-soft" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">ゲーム終了</h1>
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Timer className="w-4 h-4" />
            <span className="text-sm">スライドタイマー</span>
          </div>
        </div>

        {/* Winner Announcement */}
        {winner && (
          <Card className="bg-accent/10 border-accent/30">
            <CardContent className="p-6 text-center">
              <Crown className="w-8 h-8 text-accent mx-auto mb-3" />
              <p className="text-accent font-bold text-xl mb-1">{winner.nickname}</p>
              <p className="text-sm text-muted-foreground">が1位</p>
              <div className="mt-4 flex items-center justify-center gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">ペナルティ</p>
                  <p className="text-lg font-mono font-bold text-accent">
                    {winner.total_penalty_points || 0}pt
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loser Section */}
        {loser && loser.id !== winner?.id && (
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-5 h-5 text-destructive" />
                <span className="text-sm font-medium text-destructive">最下位</span>
              </div>
              <p className="text-foreground mb-2">
                <span className="font-medium">{loser.nickname}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                ペナルティ: {loser.total_penalty_points || 0}pt
              </p>
            </CardContent>
          </Card>
        )}

        {/* Penalty Section */}
        {winner && loser && winner.penalty && winner.id !== loser.id && (
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Skull className="w-5 h-5 text-destructive" />
                <span className="text-sm font-medium text-destructive">罰ゲーム発動</span>
              </div>
              <p className="text-foreground mb-3 text-lg font-medium">
                {winner.penalty}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="text-accent font-medium">{winner.nickname}</span>
                <span> が </span>
                <span className="text-destructive font-medium">{loser.nickname}</span>
                <span> に出す罰ゲーム</span>
              </p>
            </CardContent>
          </Card>
        )}

        {/* Rankings */}
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">ランキング</p>
            <div className="space-y-2">
              {players.map((player, index) => (
                <div
                  key={player.id}
                  className={`
                    flex items-center justify-between p-3 rounded-lg border
                    ${getRankStyle(index)}
                    ${isMe(player) ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      index === 0 ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      {index + 1}
                    </div>
                    <span className={`text-sm ${isMe(player) ? 'font-medium text-primary' : 'text-foreground'}`}>
                      {player.nickname}
                      {isMe(player) && <span className="text-primary ml-1">(自分)</span>}
                    </span>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground">
                    {player.total_penalty_points || 0}pt
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Your Stats */}
        {currentPlayer && (
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground">あなたの結果</p>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <TrendingDown className="w-5 h-5 text-destructive mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">ペナルティ</p>
                <p className="text-lg font-bold text-foreground">
                  {currentPlayer.total_penalty_points || 0}pt
                </p>
              </div>

              {/* Slide by slide results */}
              {currentPlayer.slide_results && currentPlayer.slide_results.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">スライドごとの結果</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {currentPlayer.slide_results.map((result: SlideResult, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs p-2 rounded bg-muted/30"
                      >
                        <span className="text-muted-foreground">#{result.slide_number}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{formatTime(result.predicted_seconds)}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-mono">{formatTime(result.actual_seconds)}</span>
                          <span className="text-muted-foreground">
                            {formatSignedSeconds(result.predicted_seconds - result.actual_seconds)}
                          </span>
                          <span className={`font-medium ${result.penalty_points <= 10 ? 'text-green-500' : 'text-destructive'}`}>
                            +{result.penalty_points}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Back to Home */}
        <Button
          onClick={handleBackToHome}
          className="w-full h-14 text-lg font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Home className="w-5 h-5 mr-2" />
          最初に戻る
        </Button>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          また遊ぼうね
        </p>
      </div>
    </main>
  )
}
