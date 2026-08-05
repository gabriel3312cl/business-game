import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded'
import PublishedWithChangesRoundedIcon from '@mui/icons-material/PublishedWithChangesRounded'
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { boardEditorApi } from './api'
import { BoardEditor } from './BoardEditor'
import { createBoardDocument, textForLocale } from './defaults'
import type { BoardDraft } from './types'

export function BoardStudio({
  locale,
  onClose,
  onPublished,
}: {
  locale: string
  onClose: () => void
  onPublished: () => void
}) {
  const [drafts, setDrafts] = useState<BoardDraft[]>([])
  const [selected, setSelected] = useState<BoardDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<BoardDraft | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDrafts(await boardEditorApi.list())
    } catch {
      setError('No fue posible cargar tus tableros.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (selected) {
    return (
      <BoardEditor
        initialDraft={selected}
        locale={locale}
        onClose={() => setSelected(null)}
        onSaved={(saved) => {
          setSelected(saved)
          setDrafts((current) =>
            current.map((draft) => (draft.id === saved.id ? saved : draft)),
          )
        }}
        onPublished={onPublished}
      />
    )
  }

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const draft = await boardEditorApi.create(createBoardDocument(10))
      setDrafts((current) => [draft, ...current])
      setSelected(draft)
    } catch {
      setError('No fue posible crear el borrador.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Stack
      spacing={2}
      sx={{
        flex: { lg: 1 },
        minHeight: 0,
        overflowY: { lg: 'auto' },
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ sm: 'center' }}
      >
        <Button startIcon={<ArrowBackRoundedIcon />} onClick={onClose}>
          Volver al juego
        </Button>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h4" fontWeight={950}>
            Mis tableros
          </Typography>
          <Typography color="text.secondary">
            Diseña el recorrido, la economía y las reglas sin escribir código.
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="secondary"
          startIcon={
            creating ? <CircularProgress size={18} /> : <AddRoundedIcon />
          }
          disabled={creating}
          onClick={() => void create()}
        >
          Crear tablero
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" action={<Button onClick={() => void load()}>Reintentar</Button>}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" py={10} spacing={2}>
          <CircularProgress />
          <Typography color="text.secondary">Cargando borradores…</Typography>
        </Stack>
      ) : drafts.length === 0 ? (
        <Card variant="outlined" sx={{ p: { xs: 2, sm: 4 }, textAlign: 'center' }}>
          <GridViewRoundedIcon
            color="secondary"
            sx={{ fontSize: 58, mb: 1 }}
          />
          <Typography variant="h6" fontWeight={900}>
            Construye tu primer tablero
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Parte con un tablero 10 × 10 y modifica cada casilla, grupo y tarjeta.
          </Typography>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<AddRoundedIcon />}
            onClick={() => void create()}
          >
            Crear tablero
          </Button>
        </Card>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              xl: 'repeat(3, minmax(0, 1fr))',
            },
            gap: 1.5,
          }}
        >
          {drafts.map((draft) => (
            <Card
              key={draft.id}
              variant="outlined"
              sx={{
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                background:
                  'linear-gradient(145deg, rgba(50,44,76,.95), rgba(24,20,37,.98))',
              }}
            >
              <CardContent sx={{ flex: 1 }}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  spacing={1}
                  alignItems="flex-start"
                >
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      bgcolor: 'rgba(184,255,61,.12)',
                      color: 'secondary.main',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <GridViewRoundedIcon />
                  </Box>
                  <Chip
                    size="small"
                    color={draft.published_pack_id ? 'success' : 'default'}
                    icon={
                      draft.published_pack_id ? (
                        <PublishedWithChangesRoundedIcon />
                      ) : undefined
                    }
                    label={draft.published_pack_id ? 'Publicado' : 'Borrador'}
                  />
                </Stack>
                <Typography variant="h6" fontWeight={900} sx={{ mt: 1.5 }}>
                  {textForLocale(
                    draft.document.information.name,
                    locale,
                    draft.document.information.default_locale,
                  )}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {draft.document.side_length} × {draft.document.side_length} ·{' '}
                  {draft.document.tiles.length} casillas
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Revisión {draft.revision} · Actualizado{' '}
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(draft.updated_at))}
                </Typography>
                {draft.published_version && (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Última versión: {draft.published_version}
                  </Typography>
                )}
              </CardContent>
              <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 1.5 }}>
                <Button
                  startIcon={<EditRoundedIcon />}
                  onClick={() => setSelected(draft)}
                >
                  Editar
                </Button>
                {!draft.published_pack_id && (
                  <Button
                    color="error"
                    startIcon={<DeleteOutlineRoundedIcon />}
                    onClick={() => setPendingDelete(draft)}
                  >
                    Eliminar
                  </Button>
                )}
              </CardActions>
            </Card>
          ))}
        </Box>
      )}

      <Dialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
      >
        <DialogTitle>¿Eliminar este borrador?</DialogTitle>
        <DialogContent>
          Se eliminará todo el contenido editable de este tablero. Esta acción no
          se puede deshacer.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>Cancelar</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (!pendingDelete) return
              const projectId = pendingDelete.id
              const revision = pendingDelete.revision
              void boardEditorApi
                .delete(projectId, revision)
                .then(() =>
                  setDrafts((current) =>
                    current.filter((draft) => draft.id !== projectId),
                  ),
                )
                .catch(() => setError('No fue posible eliminar el borrador.'))
                .finally(() => setPendingDelete(null))
            }}
          >
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
