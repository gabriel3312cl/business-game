import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContentPack } from '../types'

interface GameCreationDialogProps {
  open: boolean
  pack: ContentPack
  onClose: () => void
  onConfirm: (deckCollectionIds: Record<string, string[]>) => void
}

export function GameCreationDialog({
  open,
  pack,
  onClose,
  onConfirm,
}: GameCreationDialogProps) {
  const { t } = useTranslation()
  const defaults = useMemo(
    () =>
      Object.fromEntries(
        pack.board.decks
          .filter((deck) => deck.collections.length > 0)
          .map((deck) => [deck.id, [...deck.default_collection_ids]]),
      ),
    [pack],
  )
  const [selection, setSelection] = useState<Record<string, string[]>>(defaults)

  useEffect(() => {
    if (open) setSelection(defaults)
  }, [defaults, open])

  const selectableDecks = pack.board.decks.filter((deck) => deck.collections.length > 0)

  const toggle = (deckId: string, collectionId: string) => {
    setSelection((current) => {
      const selected = current[deckId] ?? []
      const next = selected.includes(collectionId)
        ? selected.filter((item) => item !== collectionId)
        : [...selected, collectionId]
      if (next.length < 1) return current
      return { ...current, [deckId]: next }
    })
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('deckSelection.title')}</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {t('deckSelection.help')}
        </Typography>
        <Stack spacing={2}>
          {selectableDecks.map((deck) => {
            const selected = selection[deck.id] ?? []
            const selectedCards = new Set(
              deck.collections
                .filter((collection) => selected.includes(collection.id))
                .flatMap((collection) => collection.card_ids),
            )
            return (
              <Stack key={deck.id} spacing={0.5}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {deck.name_key ? pack.messages[deck.name_key] : deck.id}
                </Typography>
                {deck.collections.map((collection) => (
                  <FormControlLabel
                    key={collection.id}
                    control={
                      <Checkbox
                        checked={selected.includes(collection.id)}
                        disabled={
                          selected.includes(collection.id) && selected.length === 1
                        }
                        onChange={() => toggle(deck.id, collection.id)}
                      />
                    }
                    label={`${pack.messages[collection.name_key] ?? collection.id} · ${t(
                      'deckSelection.cards',
                      { count: collection.card_ids.length },
                    )}`}
                  />
                ))}
                <Typography variant="caption" color="text.secondary">
                  {t('deckSelection.total', { count: selectedCards.size })}
                </Typography>
              </Stack>
            )
          })}
          {selectableDecks.length === 0 && (
            <Typography>{t('deckSelection.fixed')}</Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant="contained" onClick={() => onConfirm(selection)}>
          {t('createGame')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
