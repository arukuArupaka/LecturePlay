'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { getOrCreatePlayerId, getRoomInfo, getSampleCells, getRandomPenalty } from '@/lib/game-utils'
import type { Room, GridSize } from '@/lib/types'
import { Grid3X3, Skull, ArrowRight, Sparkles, Grid2X2Plus, Plus, Trash2, Check } from 'lucide-react'

export default function BingoSetupPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.roomId as string

  const [room, setRoom] = useState<Room | null>(null)
  const [gridSize, setGridSize] = useState<GridSize>(3)
  const [cells, setCells] = useState<string[]>([])
  const [penalty, setPenalty] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeCell, setActiveCell] = useState<number | null>(null)
  const [presetCards, setPresetCards] = useState<string[][]>([])
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null)

  const playerId = typeof window !== 'undefined' ? getOrCreatePlayerId() : ''

  const emptyCard = () => Array(9).fill('')
  const normalizeCard = (card: string[]) => {
    const normalized = Array(9).fill('')
    for (let i = 0; i < 9; i++) {
      normalized[i] = (card[i] ?? '').toString()
    }
    return normalized
  }

  const fetchRoom = useCallback(async () => {
    const supabase = createClient()
    const { data: roomData } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (roomData) {
      setRoom(roomData)
      const { isHost: storedIsHost } = getRoomInfo()
      const isHost = storedIsHost || roomData.host_id === playerId

      if (roomData.game_type === 'presentation-bingo') {
        setGridSize(3)
        const existingCards = Array.isArray(roomData.preset_bingo_cards)
          ? roomData.preset_bingo_cards.map(card => normalizeCard(card))
          : []
        if (isHost) {
          const paddedCards = [...existingCards]
          while (paddedCards.length < 5) {
            paddedCards.push(emptyCard())
          }
          setPresetCards(paddedCards)
          setActiveCardIndex(prev => Math.min(prev, paddedCards.length - 1))
          setSelectedCardIndex(prev => (prev === null ? 0 : Math.min(prev, paddedCards.length - 1)))
        } else {
          setPresetCards(existingCards)
        }
        return
      }

      const size = (roomData.grid_size || 3) as GridSize
      setGridSize(size)
      setCells(Array(size * size).fill(''))
    }
  }, [roomId, playerId])

  useEffect(() => {
    fetchRoom()
  }, [fetchRoom])

  const handleCellChange = (index: number, value: string) => {
    if (room?.game_type === 'presentation-bingo') {
      const updatedCards = presetCards.map((card, cardIndex) => {
        if (cardIndex !== activeCardIndex) return card
        const updatedCard = [...card]
        updatedCard[index] = value
        return updatedCard
      })
      setPresetCards(updatedCards)
    } else {
      const newCells = [...cells]
      newCells[index] = value
      setCells(newCells)
    }
    setError('')
  }

  const handleRandomFill = () => {
    if (room?.game_type === 'presentation-bingo') {
      const samples = getSampleCells(3)
      const updatedCards = presetCards.map((card, cardIndex) => {
        if (cardIndex !== activeCardIndex) return card
        return samples.slice(0, 9)
      })
      setPresetCards(updatedCards)
      setError('')
      return
    }

    const samples = getSampleCells(gridSize)
    setCells(samples.slice(0, gridSize * gridSize))
    setPenalty(getRandomPenalty())
    setError('')
  }

  const handleAddCard = () => {
    if (presetCards.length >= 10) return
    setPresetCards(prev => [...prev, emptyCard()])
    setActiveCardIndex(presetCards.length)
  }

  const handleRemoveCard = () => {
    if (presetCards.length <= 5) return
    const updatedCards = presetCards.filter((_, index) => index !== activeCardIndex)
    setPresetCards(updatedCards)
    setActiveCardIndex(prev => Math.max(0, Math.min(prev, updatedCards.length - 1)))
    setSelectedCardIndex(prev => {
      if (prev === null) return prev
      if (prev === activeCardIndex) return 0
      if (prev > activeCardIndex) return prev - 1
      return prev
    })
  }

  const handleSave = async () => {
    if (room?.game_type === 'presentation-bingo') {
      const isHost = room.host_id === playerId
      if (presetCards.length < 5) {
        setError(isHost ? 'ビンゴ用紙を5枚以上作ってね' : 'ホストが用紙を準備中だよ')
        return
      }

      const trimmedCards = presetCards.map(card => card.map(cell => cell.trim()))
      const hasEmpty = trimmedCards.some(card => card.some(cell => !cell))
      if (hasEmpty) {
        setError('全部のカードを埋めてね')
        return
      }

      if (selectedCardIndex === null || !trimmedCards[selectedCardIndex]) {
        setError(isHost ? '自分のカードを選んでね' : '用紙を選んでね')
        return
      }

      setIsSaving(true)
      setError('')

      try {
        const supabase = createClient()
        const selectedCard = trimmedCards[selectedCardIndex]

        if (isHost) {
          const { error: roomError } = await supabase
            .from('rooms')
            .update({ preset_bingo_cards: trimmedCards })
            .eq('id', roomId)

          if (roomError) throw roomError
        }

        const { error: updateError } = await supabase
          .from('players')
          .update({
            bingo_card: selectedCard,
          })
          .eq('id', playerId)
          .eq('room_id', roomId)

        if (updateError) throw updateError

        router.push(`/room/${roomId}/waiting`)
      } catch (err) {
        console.error('Save error:', err)
        setError('保存に失敗しました。もう一度試してね')
      } finally {
        setIsSaving(false)
      }
      return
    }

    const expectedCells = gridSize * gridSize
    const filledCells = cells.filter(c => c.trim())
    if (filledCells.length < expectedCells) {
      setError('全部のマスを埋めてね')
      return
    }

    if (!penalty.trim()) {
      setError('罰ゲームを入力してね')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('players')
        .update({
          bingo_card: cells.map(c => c.trim()),
          penalty: penalty.trim(),
        })
        .eq('id', playerId)
        .eq('room_id', roomId)

      if (updateError) throw updateError

      router.push(`/room/${roomId}/waiting`)
    } catch (err) {
      console.error('Save error:', err)
      setError('保存に失敗しました。もう一度試してね')
    } finally {
      setIsSaving(false)
    }
  }

  const isPresentationBingo = room?.game_type === 'presentation-bingo'
  const expectedCells = gridSize * gridSize
  const activeCard = presetCards[activeCardIndex] || emptyCard()
  const filledCount = isPresentationBingo
    ? activeCard.filter(c => c.trim()).length
    : cells.filter(c => c.trim()).length

  return (
    <main className="min-h-screen flex flex-col p-4 pb-8">
      <div className="w-full max-w-md mx-auto space-y-6 animate-slide-up">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            {gridSize === 5 
              ? <Grid2X2Plus className="w-8 h-8 text-primary" />
              : <Grid3X3 className="w-8 h-8 text-primary" />
            }
          </div>
          <h1 className="text-xl font-bold text-foreground">
            {isPresentationBingo
              ? (room?.host_id === playerId ? 'ビンゴ用紙を作ろう' : 'ビンゴ用紙を選ぼう')
              : 'ビンゴカードを作ろう'
            }
          </h1>
          <p className="text-sm text-muted-foreground">
            {isPresentationBingo
              ? 'ホストが作った用紙から選ぶよ (3x3)'
              : `講義中に起こりそうなことを書いてね (${gridSize}x${gridSize})`
            }
          </p>
        </div>

        {/* Random Fill Button */}
        {(room?.game_type !== 'presentation-bingo' || room?.host_id === playerId) && (
          <Button
            variant="secondary"
            onClick={handleRandomFill}
            className="w-full"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            サンプルで埋める
          </Button>
        )}

        {/* Presentation Bingo Host Controls */}
        {isPresentationBingo && room?.host_id === playerId && (
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">カード管理 (最低5枚)</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddCard}
                    disabled={presetCards.length >= 10}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    追加
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleRemoveCard}
                    disabled={presetCards.length <= 5}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    削除
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {presetCards.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveCardIndex(index)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      index === activeCardIndex
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border'
                    }`}
                  >
                    カード{index + 1}
                    {selectedCardIndex === index && (
                      <Check className="w-3 h-3 inline-block ml-1 text-green-500" />
                    )}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedCardIndex(activeCardIndex)}
                className="w-full"
              >
                このカードを自分用にする
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Bingo Grid */}
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            {isPresentationBingo && room?.host_id !== playerId ? (
              presetCards.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  ホストが用紙を準備中だよ
                </p>
              ) : (
                <div className="space-y-3">
                  {presetCards.map((card, cardIndex) => (
                    <button
                      key={cardIndex}
                      onClick={() => setSelectedCardIndex(cardIndex)}
                      className={`w-full p-3 rounded-lg border transition-colors ${
                        selectedCardIndex === cardIndex
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-muted/50'
                      }`}
                    >
                      <div className="grid grid-cols-3 gap-1">
                        {card.map((cell, index) => (
                          <div
                            key={index}
                            className="text-[10px] text-foreground bg-card border border-border rounded-md p-1 text-center min-h-8 flex items-center justify-center"
                          >
                            {cell}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">カード{cardIndex + 1}</p>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <>
                <div 
                  className="grid gap-2"
                  style={{ 
                    gridTemplateColumns: `repeat(${isPresentationBingo ? 3 : gridSize}, minmax(0, 1fr))` 
                  }}
                >
                  {(isPresentationBingo ? activeCard : cells).map((cell, index) => (
                    <div key={index} className="relative">
                      <Input
                        type="text"
                        placeholder={`${index + 1}`}
                        value={cell}
                        onChange={(e) => handleCellChange(index, e.target.value)}
                        onFocus={() => setActiveCell(index)}
                        onBlur={() => setActiveCell(null)}
                        maxLength={20}
                        className={`
                          ${isPresentationBingo || gridSize === 3 ? 'h-20 text-xs' : 'h-14 text-[10px]'}
                          text-center p-1 bg-input border-border resize-none
                          ${activeCell === index ? 'ring-2 ring-primary' : ''} 
                          ${cell.trim() ? 'border-green-500/50' : ''}
                        `}
                      />
                      {cell.trim() && (
                        <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-green-500" />
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground text-center mt-3">
                  {filledCount}/{isPresentationBingo ? 9 : expectedCells} マス入力済み
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Penalty Input */}
        {!isPresentationBingo && (
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Skull className="w-4 h-4" />
                <span className="text-sm">罰ゲーム</span>
              </div>
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
              <p className="text-xs text-muted-foreground">
                1位になったら最下位に出す罰ゲームだよ
              </p>
            </CardContent>
          </Card>
        )}

        {/* Error Message */}
        {error && (
          <p className="text-center text-sm text-destructive animate-slide-up">
            {error}
          </p>
        )}

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full h-14 text-lg font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isSaving ? (
            <span className="animate-pulse-soft">保存中...</span>
          ) : (
            <>
              準備完了
              <ArrowRight className="w-5 h-5 ml-2" />
            </>
          )}
        </Button>
      </div>
    </main>
  )
}
