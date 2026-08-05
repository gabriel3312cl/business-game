import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import CloudDoneRoundedIcon from '@mui/icons-material/CloudDoneRounded'
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded'
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded'
import PublishRoundedIcon from '@mui/icons-material/PublishRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Step,
  StepButton,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { ApiError } from '../api'
import { boardEditorApi } from './api'
import { BoardPreview } from './BoardPreview'
import { EditorPanel } from './EditorPanels'
import { textForLocale } from './defaults'
import type {
  BoardDraft,
  BoardAsset,
  BoardDraftDocument,
  BoardEditorStep,
  BoardValidationIssue,
  BoardVersionSummary,
} from './types'
import { validateBoardLocally } from './validation'

const steps: Array<{ id: BoardEditorStep; label: string }> = [
  { id: 'information', label: 'Información' },
  { id: 'economy', label: 'Economía' },
  { id: 'groups', label: 'Grupos' },
  { id: 'tiles', label: 'Casillas' },
  { id: 'decks', label: 'Mazos' },
  { id: 'publish', label: 'Publicar' },
]

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'

export function BoardEditor({
  initialDraft,
  locale,
  onClose,
  onSaved,
  onPublished,
}: {
  initialDraft: BoardDraft
  locale: string
  onClose: () => void
  onSaved: (draft: BoardDraft) => void
  onPublished: () => void
}) {
  const [draft, setDraft] = useState(initialDraft)
  const [document, setDocument] = useState(initialDraft.document)
  const [step, setStep] = useState<BoardEditorStep>('information')
  const [selectedTileId, setSelectedTileId] = useState(
    initialDraft.document.tiles[0]?.id,
  )
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [serverIssues, setServerIssues] = useState<BoardValidationIssue[] | null>(
    null,
  )
  const [serverWarnings, setServerWarnings] = useState<BoardValidationIssue[]>([])
  const [validating, setValidating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [version, setVersion] = useState('')
  const [versions, setVersions] = useState<BoardVersionSummary[]>([])
  const [assets, setAssets] = useState<BoardAsset[]>([])
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [uploadingAsset, setUploadingAsset] = useState(false)
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)
  const [assetError, setAssetError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const revisionRef = useRef(initialDraft.revision)
  const changeVersionRef = useRef(0)
  const saveQueueRef = useRef<Promise<BoardDraft>>(Promise.resolve(initialDraft))
  const mountedRef = useRef(true)
  const localIssues = useMemo(() => validateBoardLocally(document), [document])

  useEffect(() => {
    mountedRef.current = true
    void boardEditorApi
      .versions(initialDraft.id)
      .then((items) => {
        if (mountedRef.current) setVersions(items)
      })
      .catch(() => undefined)
    void boardEditorApi
      .assets(initialDraft.id)
      .then((items) => {
        if (mountedRef.current) setAssets(items)
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setAssetError(
            error instanceof ApiError
              ? `No fue posible cargar los assets: ${error.message}`
              : 'No fue posible cargar los assets del tablero.',
          )
        }
      })
      .finally(() => {
        if (mountedRef.current) setAssetsLoading(false)
      })
    return () => {
      mountedRef.current = false
    }
  }, [initialDraft.id])

  const queueSave = useCallback(
    (snapshot: BoardDraftDocument, snapshotVersion = changeVersionRef.current) => {
      setSaveStatus('saving')
      setSaveError(null)
      const operation = saveQueueRef.current
        .catch(() => draft)
        .then(async () => {
          const saved = await boardEditorApi.save(draft.id, {
            revision: revisionRef.current,
            document: snapshot,
          })
          revisionRef.current = saved.revision
          if (mountedRef.current) {
            setDraft(saved)
            setSaveStatus(
              changeVersionRef.current === snapshotVersion ? 'saved' : 'dirty',
            )
            onSaved(saved)
          }
          return saved
        })
        .catch((error: unknown) => {
          if (mountedRef.current) {
            if (error instanceof ApiError && error.status === 409) {
              setSaveStatus('conflict')
              setSaveError(
                'Este tablero cambió en otra ventana. Recárgalo antes de seguir editando.',
              )
            } else {
              setSaveStatus('error')
              setSaveError('No fue posible guardar el borrador.')
            }
          }
          throw error
        })
      saveQueueRef.current = operation
      return operation
    },
    [draft, onSaved],
  )

  useEffect(() => {
    if (saveStatus !== 'dirty') return
    const timeout = window.setTimeout(() => {
      void queueSave(document).catch(() => undefined)
    }, 900)
    return () => window.clearTimeout(timeout)
  }, [document, queueSave, saveStatus])

  const changeDocument = (next: BoardDraftDocument) => {
    changeVersionRef.current += 1
    setDocument(next)
    setServerIssues(null)
    setSaveStatus('dirty')
  }

  const validateServer = async () => {
    setValidating(true)
    setSaveError(null)
    try {
      const saved =
        saveStatus === 'saved' ? draft : await queueSave(document)
      const validation = await boardEditorApi.validate(saved.id, saved.revision)
      setServerIssues(validation.errors)
      setServerWarnings(validation.warnings)
      return validation.valid
    } catch (error: unknown) {
      const conflict = error instanceof ApiError && error.status === 409
      const message = conflict
        ? 'El borrador cambió antes de validarse. Recárgalo y vuelve a intentar.'
        : error instanceof ApiError
          ? `No fue posible validar el tablero: ${error.message}`
          : 'No fue posible validar el tablero. Revisa tu conexión e inténtalo nuevamente.'
      if (conflict) setSaveStatus('conflict')
      setSaveError(message)
      setServerWarnings([])
      setServerIssues([{ path: 'validate', message }])
      return false
    } finally {
      setValidating(false)
    }
  }

  const publish = async () => {
    setPublishing(true)
    setSaveError(null)
    try {
      const valid = await validateServer()
      if (!valid) return
      const result = await boardEditorApi.publish(
        draft.id,
        revisionRef.current,
        version.trim() || undefined,
      )
      setVersion('')
      onPublished()
      setServerWarnings([
        {
          path: 'publish',
          message: `Versión ${result.version} publicada como ${result.pack_id}.`,
        },
      ])
      try {
        const refreshed = await boardEditorApi.get(draft.id)
        revisionRef.current = refreshed.revision
        setDraft(refreshed)
        setDocument(refreshed.document)
        setSaveStatus('saved')
        onSaved(refreshed)
        setVersions(await boardEditorApi.versions(draft.id))
      } catch {
        setServerWarnings((current) => [
          ...current,
          {
            path: 'refresh',
            message:
              'La versión se publicó, pero no fue posible actualizar el editor. ' +
              'Vuelve a Mis tableros y ábrelo nuevamente.',
          },
        ])
      }
    } catch (error: unknown) {
      setSaveError(
        error instanceof ApiError ? error.message : 'No fue posible publicar.',
      )
    } finally {
      setPublishing(false)
    }
  }

  const closeEditor = async () => {
    if (saveStatus === 'error' || saveStatus === 'conflict') {
      setConfirmDiscard(true)
      return
    }
    setClosing(true)
    try {
      if (saveStatus === 'dirty') {
        await queueSave(document)
      } else if (saveStatus === 'saving') {
        await saveQueueRef.current
      }
      onClose()
    } catch {
      // queueSave already exposes the actionable error and keeps the editor open.
    } finally {
      if (mountedRef.current) setClosing(false)
    }
  }

  const reorderTile = (sourceTileId: string, targetTileId: string) => {
    const sourceIndex = document.tiles.findIndex((tile) => tile.id === sourceTileId)
    const targetIndex = document.tiles.findIndex((tile) => tile.id === targetTileId)
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return
    const tiles = [...document.tiles]
    const [movedTile] = tiles.splice(sourceIndex, 1)
    tiles.splice(targetIndex, 0, movedTile)
    changeDocument({ ...document, tiles })
    setSelectedTileId(sourceTileId)
  }

  const uploadAsset = async (file: File): Promise<BoardAsset> => {
    setUploadingAsset(true)
    setAssetError(null)
    try {
      const asset = await boardEditorApi.uploadAsset(draft.id, file)
      if (mountedRef.current) setAssets((current) => [...current, asset])
      return asset
    } catch (error: unknown) {
      const message =
        error instanceof ApiError
          ? `No fue posible cargar el SVG: ${error.message}`
          : 'No fue posible cargar el SVG.'
      if (mountedRef.current) setAssetError(message)
      throw error
    } finally {
      if (mountedRef.current) setUploadingAsset(false)
    }
  }

  const deleteAsset = async (assetId: string) => {
    setDeletingAssetId(assetId)
    setAssetError(null)
    try {
      await boardEditorApi.deleteAsset(draft.id, assetId)
      if (mountedRef.current) {
        setAssets((current) => current.filter((asset) => asset.id !== assetId))
      }
    } catch (error: unknown) {
      if (mountedRef.current) {
        setAssetError(
          error instanceof ApiError
            ? `No fue posible eliminar el asset: ${error.message}`
            : 'No fue posible eliminar el asset.',
        )
      }
    } finally {
      if (mountedRef.current) setDeletingAssetId(null)
    }
  }

  return (
    <Stack
      spacing={1.5}
      sx={{
        height: { lg: '100%' },
        flex: { lg: 1 },
        minHeight: 0,
        overflow: { lg: 'hidden' },
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ sm: 'center' }}
      >
        <Button
          startIcon={<ArrowBackRoundedIcon />}
          disabled={closing}
          onClick={() => void closeEditor()}
        >
          {closing ? 'Guardando…' : 'Mis tableros'}
        </Button>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h5" fontWeight={950} noWrap>
            {textForLocale(
              document.information.name,
              locale,
              document.information.default_locale,
            )}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Borrador r{revisionRef.current}
          </Typography>
        </Box>
        <SaveIndicator status={saveStatus} />
        <Button
          variant="outlined"
          startIcon={<SaveRoundedIcon />}
          disabled={saveStatus === 'saved' || saveStatus === 'saving'}
          onClick={() => void queueSave(document).catch(() => undefined)}
        >
          Guardar
        </Button>
      </Stack>

      {saveError && (
        <Alert
          severity={saveStatus === 'conflict' ? 'warning' : 'error'}
          action={
            saveStatus === 'conflict' ? (
              <Button
                color="inherit"
                onClick={() => {
                  void boardEditorApi.get(draft.id).then((fresh) => {
                    revisionRef.current = fresh.revision
                    setDraft(fresh)
                    setDocument(fresh.document)
                    setSaveStatus('saved')
                    setSaveError(null)
                    onSaved(fresh)
                  })
                }}
              >
                Recargar
              </Button>
            ) : undefined
          }
        >
          {saveError}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ px: 1, minWidth: 0, overflow: 'hidden' }}>
        <Stepper
          nonLinear
          activeStep={steps.findIndex((item) => item.id === step)}
          sx={{
            py: 1,
            '& .MuiStep-root': { minWidth: 0, px: { xs: 0.25, sm: 1 } },
            '& .MuiStepButton-root': { minWidth: 0 },
            '& .MuiStepLabel-label': {
              display: { xs: 'none', sm: 'block' },
              whiteSpace: 'nowrap',
            },
          }}
        >
          {steps.map((item) => (
            <Step key={item.id}>
              <StepButton onClick={() => setStep(item.id)}>{item.label}</StepButton>
            </Step>
          ))}
        </Stepper>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 430px' },
          gap: 1.5,
          alignItems: { xs: 'start', lg: 'stretch' },
          flex: { lg: 1 },
          minHeight: 0,
          overflow: { lg: 'hidden' },
          gridTemplateRows: { lg: 'minmax(0, 1fr)' },
        }}
      >
        <BoardPreview
          document={document}
          locale={locale}
          selectedTileId={selectedTileId}
          onSelectTile={(tileId) => {
            setSelectedTileId(tileId)
            setStep('tiles')
          }}
          onReorderTile={reorderTile}
        />
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 1.5, sm: 2 },
            height: { lg: '100%' },
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          {step === 'publish' ? (
            <PublishPanel
              localIssues={localIssues}
              serverIssues={serverIssues}
              serverWarnings={serverWarnings}
              validating={validating}
              publishing={publishing}
              version={version}
              versions={versions}
              onVersionChange={setVersion}
              onValidate={() => void validateServer()}
              onPublish={() => void publish()}
            />
          ) : (
            <EditorPanel
              step={step}
              document={document}
              locale={locale}
              selectedTileId={selectedTileId}
              onSelectTile={setSelectedTileId}
              onChange={changeDocument}
              assets={assets}
              assetsLoading={assetsLoading}
              uploadingAsset={uploadingAsset}
              deletingAssetId={deletingAssetId}
              assetError={assetError}
              onUploadAsset={uploadAsset}
              onDeleteAsset={(assetId) => void deleteAsset(assetId)}
            />
          )}
        </Paper>
      </Box>
      <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)}>
        <DialogTitle>Hay cambios que no se pudieron guardar</DialogTitle>
        <DialogContent>
          Si sales ahora, perderás los cambios locales desde la última revisión
          guardada.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDiscard(false)}>Seguir editando</Button>
          <Button color="error" onClick={onClose}>
            Salir sin guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const content: Record<
    SaveStatus,
    {
      label: string
      color: 'default' | 'success' | 'warning' | 'error'
      icon: ReactElement
    }
  > = {
    saved: {
      label: 'Guardado',
      color: 'success',
      icon: <CloudDoneRoundedIcon />,
    },
    dirty: {
      label: 'Cambios pendientes',
      color: 'warning',
      icon: <CloudUploadRoundedIcon />,
    },
    saving: {
      label: 'Guardando…',
      color: 'default',
      icon: <CircularProgress size={16} />,
    },
    error: {
      label: 'Error al guardar',
      color: 'error',
      icon: <ErrorOutlineRoundedIcon />,
    },
    conflict: {
      label: 'Conflicto de revisión',
      color: 'warning',
      icon: <ErrorOutlineRoundedIcon />,
    },
  }
  const item = content[status]
  return <Chip size="small" label={item.label} color={item.color} icon={item.icon} />
}

function PublishPanel({
  localIssues,
  serverIssues,
  serverWarnings,
  validating,
  publishing,
  version,
  versions,
  onVersionChange,
  onValidate,
  onPublish,
}: {
  localIssues: BoardValidationIssue[]
  serverIssues: BoardValidationIssue[] | null
  serverWarnings: BoardValidationIssue[]
  validating: boolean
  publishing: boolean
  version: string
  versions: BoardVersionSummary[]
  onVersionChange: (value: string) => void
  onValidate: () => void
  onPublish: () => void
}) {
  const issues = serverIssues ?? localIssues
  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="h6" fontWeight={900}>
          Validar y publicar
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Una versión publicada es inmutable. Las partidas quedarán fijadas a
          esa versión aunque sigas editando el borrador.
        </Typography>
      </Box>
      {issues.length === 0 ? (
        <Alert severity="success" icon={<CheckCircleRoundedIcon />}>
          El tablero está listo para validación del servidor.
        </Alert>
      ) : (
        <Alert severity="warning">
          Corrige {issues.length} problema(s) antes de publicar.
        </Alert>
      )}
      <Stack spacing={0.75}>
        {issues.slice(0, 20).map((issue, index) => (
          <Paper key={`${issue.path}-${index}`} variant="outlined" sx={{ p: 1 }}>
            <Typography variant="caption" color="secondary.main">
              {issue.path}
            </Typography>
            <Typography variant="body2">{issue.message}</Typography>
          </Paper>
        ))}
      </Stack>
      {serverWarnings.map((warning, index) => (
        <Alert key={`${warning.path}-${index}`} severity="info">
          {warning.message}
        </Alert>
      ))}
      <Button
        variant="outlined"
        disabled={validating || localIssues.length > 0}
        onClick={onValidate}
      >
        {validating ? 'Validando…' : 'Validar en servidor'}
      </Button>
      <Divider />
      <TextField
        size="small"
        label="Versión (opcional)"
        value={version}
        onChange={(event) => onVersionChange(event.target.value)}
        helperText="Acepta 1, 1.2 o 1.2.3. Si queda vacío, se asignará la siguiente."
      />
      <Button
        variant="contained"
        color="secondary"
        startIcon={
          publishing ? <CircularProgress size={18} /> : <PublishRoundedIcon />
        }
        disabled={publishing || issues.length > 0}
        onClick={onPublish}
      >
        {publishing ? 'Publicando…' : 'Publicar versión inmutable'}
      </Button>
      <Divider />
      <Typography fontWeight={800}>Versiones publicadas</Typography>
      {versions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Aún no hay versiones publicadas.
        </Typography>
      ) : (
        versions.map((item) => (
          <Stack
            key={`${item.pack_id}-${item.version}`}
            direction="row"
            justifyContent="space-between"
            spacing={1}
          >
            <Typography variant="body2">{item.pack_id}</Typography>
            <Chip size="small" label={`v${item.version}`} />
          </Stack>
        ))
      )}
    </Stack>
  )
}
