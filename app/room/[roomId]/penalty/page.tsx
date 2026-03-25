'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { getOrCreatePlayerId } from '@/lib/game-utils'
import { Skull, ArrowRight } from 'lucide-react'

export default function PenaltySetupPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.roomId as string

  const [penalty, setPenalty] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!penalty.trim()) {
      setError('罰ゲームを入力してね')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      const supabase = createClient()
      const playerId = getOrCreatePlayerId()

      const { error: updateError } = await supabase
        .from('players')
        .update({ penalty: penalty.trim() })
        .eq('id', playerId)
        .eq('room_id', roomId)

      if (updateError) throw updateError

      router.push(`/room/${roomId}/waiting`)
    } catch (err) {
      console.error('Penalty save error:', err)
      setError('保存に失敗しました。もう一度試してね')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 animate-slide-up">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <Skull className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground">罰ゲームを決めよう</h1>
          <p className="text-sm text-muted-foreground">1位になったら最下位に出す内容だよ</p>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <Input
              type="text"
              placeholder="例: 次の休み時間にジュース奢り"
              value={penalty}
              onChange={(e) => {
                setPenalty(e.target.value)
                setError('')
              }}
              maxLength={30}
              className="bg-input border-border h-12"
            />
            <p className="text-xs text-muted-foreground">相手が嫌がる内容は避けよう</p>
          </CardContent>
        </Card>

        {error && (
          <p className="text-center text-sm text-destructive animate-slide-up">
            {error}
          </p>
        )}

        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full h-14 text-lg font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isSaving ? (
            <span className="animate-pulse-soft">保存中...</span>
          ) : (
            <>
              保存して待機へ
              <ArrowRight className="w-5 h-5 ml-2" />
            </>
          )}
        </Button>
      </div>
    </main>
  )
}
