'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { getOrCreatePlayerId, clearRoomInfo, countBingoLines } from '@/lib/game-utils'
import type { Player, Room, GridSize } from '@/lib/types'
import { Trophy, Skull, Medal, Home, Crown, Sparkles, Grid3X3 } from 'lucide-react'

export default function ResultsPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.roomId as string

  const [players, setPlayers] = useState<Player[]>([])
  const [room, setRoom] = useState<Room | null>(null)
  const [winner, setWinner] = useState<Player | null>(null)
  const [loser, setLoser] = useState<Player | null>(null)
  
  const playerId = typeof window !== 'undefined' ? getOrCreatePlayerId() : ''

  type PlayerWithStats = Player & { lineCount: number; filledCount: number }

  const computeRankings = (list: Player[], size: GridSize): { ranked: PlayerWithStats[]; last: PlayerWithStats | null } => {
    const withStats: PlayerWithStats[] = list.map(player => ({
      ...player,
      lineCount: countBingoLines(player.completed_cells || [], size),
      filledCount: (player.completed_cells || []).length,
    }))

    const ranked = [...withStats].sort((a, b) => {
      if (b.lineCount !== a.lineCount) return b.lineCount - a.lineCount
      if (b.filledCount !== a.filledCount) return b.filledCount - a.filledCount
      return a.created_at.localeCompare(b.created_at)
    })

    const last = [...withStats].sort((a, b) => {
      if (a.filledCount !== b.filledCount) return a.filledCount - b.filledCount
      if (a.lineCount !== b.lineCount) return a.lineCount - b.lineCount
      return a.created_at.localeCompare(b.created_at)
    })[0] || null

    return { ranked, last }
  }

  const fetchData = useCallback(async () => {
    const supabase = createClient()

    const { data: roomData } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (roomData) {
      setRoom(roomData)
    }

    const { data: playersData } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('bingo_rank', { ascending: true, nullsFirst: false })

    if (playersData) {
      setPlayers(playersData)

      const size = (roomData?.grid_size || 3) as GridSize
      const { ranked, last } = computeRankings(playersData, size)
      setWinner(ranked[0] || null)
      setLoser(last)
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

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-accent" />
    if (rank === 2) return <Medal className="w-5 h-5 text-muted-foreground" />
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />
    return null
  }

  const getRankStyle = (rank: number) => {
    if (rank === 1) return 'bg-accent/20 border-accent/30'
    if (rank === 2) return 'bg-muted/50 border-muted'
    if (rank === 3) return 'bg-amber-900/20 border-amber-600/30'
    return 'bg-muted/30 border-border'
  }

  const gridSize = (room?.grid_size || 3) as GridSize
  const rankedPlayers = computeRankings(players, gridSize).ranked

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
            <Grid3X3 className="w-4 h-4" />
            <span className="text-sm">
              ビンゴ {room?.grid_size || 3}x{room?.grid_size || 3}
            </span>
          </div>
        </div>

        {/* Winner Announcement */}
        {winner && (
          <Card className="bg-accent/10 border-accent/30">
            <CardContent className="p-6 text-center">
              <Crown className="w-8 h-8 text-accent mx-auto mb-3" />
              <p className="text-accent font-bold text-xl mb-1">{winner.nickname}</p>
              <p className="text-sm text-muted-foreground">が1位でゴール</p>
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
            <p className="text-sm text-muted-foreground">ランキング (揃った列数順)</p>
            <div className="space-y-2">
              {rankedPlayers.map((player, index) => (
                  <div
                    key={player.id}
                    className={`
                      flex items-center justify-between p-3 rounded-lg border
                      ${getRankStyle(index + 1)}
                      ${isMe(player) ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 flex justify-center">
                        {getRankIcon(index + 1) || (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                      <span className={`text-sm ${isMe(player) ? 'font-medium text-primary' : 'text-foreground'}`}>
                        {player.nickname}
                        {isMe(player) && <span className="text-primary ml-1">(自分)</span>}
                      </span>
                    </div>
                    <span className={`
                      text-xs px-2 py-1 rounded-full
                      ${player.lineCount > 0 ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'}
                    `}>
                      揃った列 ${player.lineCount}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Your Result Summary */}
        {currentPlayer && (
          <div className="text-center p-4 rounded-lg bg-muted/30 border border-border">
            <p className="text-sm text-muted-foreground">あなたの結果</p>
            <p className="text-lg font-bold text-foreground mt-1">
              揃った列 {countBingoLines(currentPlayer.completed_cells || [], gridSize)}
            </p>
          </div>
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
