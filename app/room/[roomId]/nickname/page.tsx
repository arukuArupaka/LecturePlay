'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { generateRandomNickname, getOrCreatePlayerId } from '@/lib/game-utils'
import { Shuffle, ArrowRight, User } from 'lucide-react'

export default function NicknamePage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.roomId as string
  
  const [nickname, setNickname] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')

  const handleRandomNickname = () => {
    setNickname(generateRandomNickname())
    setError('')
  }

  const handleJoin = async () => {
    const finalNickname = nickname.trim() || generateRandomNickname()
    
    if (finalNickname.length > 10) {
      setError('ニックネームは10文字以内でお願い')
      return
    }

    setIsJoining(true)
    setError('')

    try {
      const supabase = createClient()
      const playerId = getOrCreatePlayerId()

      // Check if player already exists in this room
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('id')
        .eq('id', playerId)
        .eq('room_id', roomId)
        .single()

      if (existingPlayer) {
        // Update existing player
        const { error: updateError } = await supabase
          .from('players')
          .update({ nickname: finalNickname })
          .eq('id', playerId)

        if (updateError) throw updateError
      } else {
        // Insert new player
        const { error: insertError } = await supabase
          .from('players')
          .insert({
            id: playerId,
            room_id: roomId,
            nickname: finalNickname,
          })

        if (insertError) throw insertError
      }

      router.push(`/room/${roomId}/waiting`)
    } catch (err) {
      console.error('Join error:', err)
      setError('参加に失敗しました。もう一度試してね')
    } finally {
      setIsJoining(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 animate-slide-up">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs">
            <span>ルーム</span>
            <span className="font-mono font-bold text-foreground tracking-wider">{roomId}</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">ニックネームを決めよう</h1>
          <p className="text-sm text-muted-foreground">みんなに表示される名前だよ</p>
        </div>

        {/* Nickname Input */}
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4" />
              <span className="text-sm">ニックネーム</span>
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="空欄ならランダム"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value)
                  setError('')
                }}
                maxLength={10}
                className="flex-1 bg-input border-border h-12 text-base"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={handleRandomNickname}
                className="h-12 w-12 shrink-0"
              >
                <Shuffle className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-right">
              {nickname.length}/10文字
            </p>
          </CardContent>
        </Card>

        {/* Join Button */}
        <Button
          onClick={handleJoin}
          disabled={isJoining}
          className="w-full h-14 text-lg font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isJoining ? (
            <span className="animate-pulse-soft">参加中...</span>
          ) : (
            <>
              ルームに入る
              <ArrowRight className="w-5 h-5 ml-2" />
            </>
          )}
        </Button>

        {/* Error Message */}
        {error && (
          <p className="text-center text-sm text-destructive animate-slide-up">
            {error}
          </p>
        )}

        {/* Hint */}
        <p className="text-center text-xs text-muted-foreground">
          後から変更はできないよ
        </p>
      </div>
    </main>
  )
}
