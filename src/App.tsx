import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import './App.css'
import type {
  AttemptCurvePoint,
  AttemptResult,
  ExerciseSpec,
  UserSettings
} from './types'
import {
  AUTO_STOP_MIN_RECORD_SECONDS,
  AUTO_STOP_SILENCE_SECONDS,
  buildInitialSettings,
  COUNTDOWN_SECONDS,
  COUNTDOWN_START_SECONDS,
  DEFAULT_GENDER,
  DIFFICULTY_OPTIONS,
  KEY_OPTIONS,
  LIVE_CURVE_DELAY_SECONDS,
  MATCH_MODE_OPTIONS,
  MAX_DISPLAY_SECONDS,
  MAX_RECORDING_SECONDS,
  REPLAY_VOICE_PREROLL_SECONDS,
  TUNING_OPTIONS,
  defaultsForGender
} from './config/defaults'
import { buildAxisConfig } from './chart/axis'
import PitchCanvas from './chart/PitchCanvas'
import { generateExercise } from './exercise/generator'
import { buildDisplayCurve, evaluateAttempt, type RawSamplePoint } from './scoring/score'
import { MicCapture } from './audio/micCapture'
import { MemoryRecorder } from './audio/memoryRecorder'
import {
  ensureAudioContext,
  playClip,
  playExerciseTone,
  type AudioContextRef
} from './audio/tonePlayer'
import { createInitialMachine, transition } from './app/stateMachine'
import { shouldAutoStopSinging } from './app/autoStop'

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(buildInitialSettings)
  const [exercise, setExercise] = useState<ExerciseSpec | null>(null)
  const [questionSettings, setQuestionSettings] = useState<UserSettings | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [questionTransitioning, setQuestionTransitioning] = useState(false)
  const [machine, dispatch] = useReducer(transition, undefined, createInitialMachine)
  const [countdownLabel, setCountdownLabel] = useState<string | null>(null)
  const [liveCurve, setLiveCurve] = useState<AttemptCurvePoint[]>([])
  const [status, setStatus] = useState('Set your range, then start your first question.')
  const [targetPlaying, setTargetPlaying] = useState(false)
  const [replayPlaying, setReplayPlaying] = useState(false)

  const machineRef = useRef(machine)
  const countdownTimerRef = useRef<number | null>(null)
  const hardStopTimerRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const micRef = useRef<MicCapture | null>(null)
  const recorderRef = useRef<MemoryRecorder | null>(null)
  const exerciseRef = useRef<ExerciseSpec | null>(null)
  const questionSettingsRef = useRef<UserSettings | null>(null)
  const rawCurveRef = useRef<RawSamplePoint[]>([])
  const recordingActiveRef = useRef(false)
  const finishingRef = useRef(false)
  const hasVoicedRef = useRef(false)
  const lastVoicedAtRef = useRef<number | null>(null)

  useEffect(() => {
    machineRef.current = machine
  }, [machine])

  useEffect(() => {
    exerciseRef.current = exercise
  }, [exercise])

  useEffect(() => {
    questionSettingsRef.current = questionSettings
  }, [questionSettings])

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current)
      }
      if (hardStopTimerRef.current !== null) {
        window.clearTimeout(hardStopTimerRef.current)
      }
      const mic = micRef.current
      if (mic) {
        void mic.dispose()
      }
      if (audioCtxRef.current) {
        void audioCtxRef.current.close()
        audioCtxRef.current = null
      }
    }
  }, [])

  const axis = useMemo(() => {
    if (!exercise || !questionSettings) {
      return {
        yMinSemi: -8,
        yMaxSemi: 8,
        yRangeSemi: 16
      }
    }
    return buildAxisConfig(exercise, exercise.effectiveDoHz)
  }, [exercise, questionSettings])

  const currentCurve =
    isRecording ? liveCurve : machine.question.current?.curve ?? []

  const currentScore = machine.question.current?.score
  const bestScore = machine.question.best?.score
  const firstScore = machine.question.first?.score
  const isPreparing = targetPlaying || countdownLabel !== null || machine.phase === 'first_countdown'
  const hasFirstScoredAttempt = machine.question.first?.score !== undefined
  const hideChartsUntilFirstScore = questionTransitioning || !hasFirstScoredAttempt

  useEffect(() => {
    if (machine.question.first?.score !== undefined) {
      setQuestionTransitioning(false)
    }
  }, [machine.question.first?.score])

  function formatSubscores(attempt: AttemptResult | undefined): string {
    const subs = attempt?.subscores
    if (!subs) {
      return '(Acc --, Stb --, Lock --, Rhy --)'
    }
    return `(Acc ${subs.accuracy}, Stb ${subs.stability}, Lock ${subs.lock}, Rhy ${subs.rhythm})`
  }

  function validateSettings(next: UserSettings): string | null {
    if (next.minHz < 50 || next.maxHz > 1200 || next.minHz >= next.maxHz) {
      return 'Range must satisfy 50 <= minHz < maxHz <= 1200'
    }
    if (next.doHz < next.minHz || next.doHz > next.maxHz) {
      return 'Do must stay inside your min/max vocal range'
    }
    if (!Number.isInteger(next.keySemitone) || next.keySemitone < 0 || next.keySemitone > 11) {
      return 'Key must be an integer semitone between 0 and 11.'
    }
    return null
  }

  function clearTransientState(): void {
    rawCurveRef.current = []
    recorderRef.current = null
    hasVoicedRef.current = false
    lastVoicedAtRef.current = null
    setIsRecording(false)
    setLiveCurve([])
  }

  function resetQuestionDueToSettingsChange(): void {
    stopCountdown()
    clearHardStopTimer()
    recordingActiveRef.current = false
    finishingRef.current = false
    micRef.current?.stop()
    clearTransientState()
    exerciseRef.current = null
    questionSettingsRef.current = null
    setExercise(null)
    setQuestionSettings(null)
    setQuestionTransitioning(false)
    dispatch({ type: 'reset' })
    setStatus('Settings changed. Start Question to generate a new exercise.')
  }

  function applySettingsUpdate(updater: (prev: UserSettings) => UserSettings): void {
    setSettings((prev) => updater(prev))
    resetQuestionDueToSettingsChange()
  }

  function updateGender(gender: UserSettings['gender']): void {
    applySettingsUpdate((prev) => {
      const defaults = defaultsForGender(gender)
      return {
        ...prev,
        gender,
        minHz: prev.dirtyMinHz ? prev.minHz : defaults.minHz,
        maxHz: prev.dirtyMaxHz ? prev.maxHz : defaults.maxHz,
        doHz: prev.dirtyDoHz ? prev.doHz : defaults.doHz
      }
    })
  }

  function updateNumberField(
    key: 'minHz' | 'maxHz' | 'doHz',
    value: string,
    dirtyKey: 'dirtyMinHz' | 'dirtyMaxHz' | 'dirtyDoHz'
  ): void {
    const parsed = Number(value)
    applySettingsUpdate((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) ? parsed : prev[key],
      [dirtyKey]: true
    }))
  }

  function startCountdown(): void {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }

    dispatch({ type: 'start_countdown' })
    setCountdownLabel('3')
    setStatus('Get ready: 3, 2, 1, Start...')

    const started = performance.now()
    countdownTimerRef.current = window.setInterval(() => {
      const elapsed = (performance.now() - started) / 1000
      const remaining = COUNTDOWN_SECONDS - elapsed
      if (remaining > 2) {
        setCountdownLabel('3')
      } else if (remaining > 1) {
        setCountdownLabel('2')
      } else if (remaining > 0) {
        setCountdownLabel('1')
      } else if (remaining > -COUNTDOWN_START_SECONDS) {
        setCountdownLabel('Start')
      } else {
        if (countdownTimerRef.current !== null) {
          window.clearInterval(countdownTimerRef.current)
          countdownTimerRef.current = null
        }
        setCountdownLabel(null)
        dispatch({ type: 'countdown_done' })
        void beginRecording()
      }
    }, 50)
  }

  async function startQuestion(): Promise<void> {
    const error = validateSettings(settings)
    if (error) {
      setStatus(error)
      return
    }

    setQuestionTransitioning(true)
    stopCountdown()
    await stopRecordingIfNeeded()

    clearTransientState()
    const snapshot = { ...settings }
    const nextExercise = generateExercise(snapshot)

    questionSettingsRef.current = snapshot
    exerciseRef.current = nextExercise
    setQuestionSettings(snapshot)
    setExercise(nextExercise)
    setStatus('Playing target... listen first.')
    const played = await playTargetBySpec(nextExercise, false)
    if (!played) {
      setQuestionTransitioning(false)
      return
    }
    dispatch({ type: machineRef.current.phase === 'idle' ? 'start_question' : 'next_question' })
    startCountdown()
  }

  function stopCountdown(): void {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    setCountdownLabel(null)
  }

  function clearHardStopTimer(): void {
    if (hardStopTimerRef.current !== null) {
      window.clearTimeout(hardStopTimerRef.current)
      hardStopTimerRef.current = null
    }
  }

  async function beginRecording(): Promise<void> {
    const activeExercise = exerciseRef.current
    const activeSettings = questionSettingsRef.current
    if (!activeExercise || !activeSettings || recordingActiveRef.current) {
      setStatus('Recording did not start correctly. Please start this question again.')
      return
    }

    try {
      if (!micRef.current) {
        micRef.current = new MicCapture()
      }

      clearTransientState()
      recordingActiveRef.current = true
      finishingRef.current = false
      setIsRecording(true)
      clearHardStopTimer()
      hardStopTimerRef.current = window.setTimeout(() => {
        if (recordingActiveRef.current) {
          setStatus('Reached 10s max duration. Scoring...')
          void finishRecording()
        }
      }, MAX_RECORDING_SECONDS * 1000)

      const mic = micRef.current
      let recorder: MemoryRecorder | null = null

      dispatch({ type: 'start_recording' })
      setStatus('Recording... sing now')

      await mic.start((frame) => {
        const frameExercise = exerciseRef.current
        const frameSettings = questionSettingsRef.current
        if (!recordingActiveRef.current || !frameSettings || !frameExercise) {
          return
        }

        if (!recorder) {
          recorder = new MemoryRecorder(mic.sampleRate, MAX_RECORDING_SECONDS)
          recorderRef.current = recorder
        }

        recorder.push(frame.block)
        rawCurveRef.current.push({
          t: frame.t,
          hz: frame.hz
        })

        if (frame.hz !== null) {
          hasVoicedRef.current = true
          lastVoicedAtRef.current = frame.t
        }

        const preview = buildDisplayCurve({
          rawCurve: rawCurveRef.current,
          target: frameExercise.target,
          doHz: frameExercise.effectiveDoHz,
          mode: frameSettings.mode
        })
        if (preview.voiceStartSec === null) {
          setLiveCurve([])
        } else {
          const delayedVisibleLimit = Math.max(
            0,
            frame.t - preview.voiceStartSec - LIVE_CURVE_DELAY_SECONDS
          )
          if (delayedVisibleLimit <= 0) {
            setLiveCurve([])
          } else {
            setLiveCurve(preview.curve.filter((point) => point.t <= delayedVisibleLimit))
          }
        }

        if (frame.t >= MAX_RECORDING_SECONDS) {
          void finishRecording()
          return
        }

        if (
          shouldAutoStopSinging({
            hasVoiced: hasVoicedRef.current,
            lastVoicedAt: lastVoicedAtRef.current,
            nowSec: frame.t,
            minRecordSec: AUTO_STOP_MIN_RECORD_SECONDS,
            silenceSec: AUTO_STOP_SILENCE_SECONDS
          })
        ) {
          setStatus('Detected end of singing. Scoring...')
          void finishRecording()
        }
      })
    } catch (error) {
      recordingActiveRef.current = false
      setIsRecording(false)
      clearHardStopTimer()
      dispatch({ type: 'attempt_done', attempt: buildFailedAttempt('no_voiced') })
      setStatus(
        error instanceof Error
          ? `Mic permission failed: ${error.message}`
          : 'Mic permission failed.'
      )
    }
  }

  async function stopRecordingIfNeeded(): Promise<void> {
    if (!recordingActiveRef.current && machineRef.current.phase !== 'recording') {
      return
    }
    await finishRecording()
  }

  async function finishRecording(): Promise<void> {
    const activeExercise = exerciseRef.current
    const activeSettings = questionSettingsRef.current
    if (
      (!recordingActiveRef.current && machineRef.current.phase !== 'recording') ||
      finishingRef.current ||
      !activeExercise ||
      !activeSettings
    ) {
      return
    }

    finishingRef.current = true
    recordingActiveRef.current = false
    setIsRecording(false)
    clearHardStopTimer()

    micRef.current?.stop()
    dispatch({ type: 'start_evaluating' })

    const clip = recorderRef.current?.toClip() ?? new Float32Array()
    const attempt = evaluateAttempt({
      attemptIndex: machineRef.current.attemptsCount + 1,
      rawCurve: rawCurveRef.current,
      target: activeExercise.target,
      notes: activeExercise.notes,
      doHz: activeExercise.effectiveDoHz,
      mode: activeSettings.mode,
      clip,
      sampleRate: micRef.current?.sampleRate ?? 44100
    })

    dispatch({ type: 'attempt_done', attempt })

    if (!attempt.valid) {
      if (attempt.failReason === 'too_short') {
        setStatus('Attempt too short. Please try again.')
      } else {
        setStatus('No voiced signal detected. Please try again.')
      }
    } else {
      setStatus(
        `Scored ${attempt.score}/100 (Acc ${attempt.subscores?.accuracy}, Stb ${attempt.subscores?.stability}, Lock ${attempt.subscores?.lock}, Rhy ${attempt.subscores?.rhythm})`
      )
    }

    finishingRef.current = false
  }

  function buildFailedAttempt(failReason: 'too_short' | 'no_voiced'): AttemptResult {
    return {
      attemptIndex: machineRef.current.attemptsCount + 1,
      valid: false,
      failReason,
      curve: [],
      clip: new Float32Array(),
      sampleRate: 44100
    }
  }

  async function playTargetBySpec(spec: ExerciseSpec, updateStatus = true): Promise<boolean> {
    try {
      setTargetPlaying(true)
      const ctx = await ensureAudioContext(audioCtxRef as AudioContextRef)
      await playExerciseTone(ctx, spec)
      if (updateStatus) {
        setStatus('Target playback finished.')
      }
      return true
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to play target')
      return false
    } finally {
      setTargetPlaying(false)
    }
  }

  async function playTarget(): Promise<void> {
    if (!exercise) {
      setStatus('Start a question first.')
      return
    }
    await playTargetBySpec(exercise, true)
  }

  async function replayAttempt(attempt: AttemptResult | undefined): Promise<void> {
    if (!attempt || attempt.clip.length === 0) {
      setStatus('No recording available yet for replay.')
      return
    }

    try {
      setReplayPlaying(true)
      const ctx = await ensureAudioContext(audioCtxRef as AudioContextRef)
      const startSec = resolveReplayStartSec(attempt)
      const startSample = Math.max(0, Math.floor(startSec * attempt.sampleRate))
      const trimmed = attempt.clip.subarray(startSample)
      await playClip(ctx, trimmed, attempt.sampleRate)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Replay failed')
    } finally {
      setReplayPlaying(false)
    }
  }

  function resolveReplayStartSec(attempt: AttemptResult): number {
    const detected =
      typeof attempt.voiceStartSec === 'number'
        ? attempt.voiceStartSec
        : detectClipVoiceStartSec(attempt.clip, attempt.sampleRate)
    if (detected === null || !Number.isFinite(detected)) {
      return 0
    }
    return Math.max(0, detected - REPLAY_VOICE_PREROLL_SECONDS)
  }

  function detectClipVoiceStartSec(clip: Float32Array, sampleRate: number): number | null {
    if (clip.length === 0 || sampleRate <= 0) {
      return null
    }

    const windowSize = Math.max(128, Math.floor(sampleRate * 0.02))
    const hopSize = Math.max(64, Math.floor(sampleRate * 0.01))
    const rmsThreshold = 0.012
    const requiredRuns = 3

    let run = 0
    let runStart = 0
    for (let start = 0; start + windowSize <= clip.length; start += hopSize) {
      let sum = 0
      for (let i = start; i < start + windowSize; i += 1) {
        sum += clip[i] * clip[i]
      }
      const rms = Math.sqrt(sum / windowSize)
      if (rms >= rmsThreshold) {
        if (run === 0) {
          runStart = start
        }
        run += 1
        if (run >= requiredRuns) {
          return runStart / sampleRate
        }
      } else {
        run = 0
      }
    }

    return null
  }

  async function retryNow(): Promise<void> {
    if (!exercise) {
      setStatus('Start a question first.')
      return
    }
    if (recordingActiveRef.current) {
      setStatus('Already recording.')
      return
    }
    await beginRecording()
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">SingBack v0.2</p>
          <h1>Hear it. Sing it back. Improve visibly.</h1>
          <p className="lead">
            This training loop is tuned for pitch accuracy and repeatable progress in your personal vocal
            range.
          </p>
        </div>
        <details className="settings-panel">
          <summary>Settings</summary>
          <div className="settings-grid">
            <label>
              Gender
              <select
                value={settings.gender}
                onChange={(event) => updateGender(event.target.value as UserSettings['gender'])}
              >
                <option value={DEFAULT_GENDER}>Male</option>
                <option value="female">Female</option>
              </select>
            </label>
            <label>
              Min Hz
              <input
                type="number"
                min={50}
                max={1200}
                value={settings.minHz}
                onChange={(event) => updateNumberField('minHz', event.target.value, 'dirtyMinHz')}
              />
            </label>
            <label>
              Max Hz
              <input
                type="number"
                min={50}
                max={1200}
                value={settings.maxHz}
                onChange={(event) => updateNumberField('maxHz', event.target.value, 'dirtyMaxHz')}
              />
            </label>
            <label>
              Do Hz
              <input
                type="number"
                min={50}
                max={1200}
                step={0.1}
                value={settings.doHz}
                onChange={(event) => updateNumberField('doHz', event.target.value, 'dirtyDoHz')}
              />
            </label>
            <label>
              Key
              <select
                value={settings.keySemitone}
                onChange={(event) =>
                  applySettingsUpdate((prev) => ({
                    ...prev,
                    keySemitone: Number(event.target.value)
                  }))
                }
              >
                {KEY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tuning
              <select
                value={settings.tuning}
                onChange={(event) =>
                  applySettingsUpdate((prev) => ({
                    ...prev,
                    tuning: event.target.value as UserSettings['tuning']
                  }))
                }
              >
                {TUNING_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Match Mode
              <select
                value={settings.mode}
                onChange={(event) =>
                  applySettingsUpdate((prev) => ({
                    ...prev,
                    mode: event.target.value as UserSettings['mode']
                  }))
                }
              >
                {MATCH_MODE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Difficulty
              <select
                value={settings.difficulty}
                onChange={(event) =>
                  applySettingsUpdate((prev) => ({
                    ...prev,
                    difficulty: event.target.value as UserSettings['difficulty']
                  }))
                }
              >
                {DIFFICULTY_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
      </header>

      <section className="control-row">
        <button type="button" className="btn primary" onClick={() => void playTarget()} disabled={!exercise || targetPlaying || isRecording}>
          {targetPlaying ? 'Playing Target...' : 'Play Target'}
        </button>
        <button type="button" className="btn" onClick={() => void startQuestion()} disabled={isPreparing || isRecording}>
          {exercise ? 'Restart Question' : 'Start Question'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void retryNow()}
          disabled={!exercise || isPreparing || isRecording}
        >
          Record Attempt
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void finishRecording()}
          disabled={!isRecording && machine.phase !== 'recording'}
        >
          Stop Attempt
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void startQuestion()}
          disabled={!exercise || isPreparing || isRecording}
        >
          Next Question
        </button>
      </section>

      <section className="status-bar">
        <span className="chip">Phase: {machine.phase}</span>
        <span className="chip">Key: {KEY_OPTIONS.find((item) => item.value === settings.keySemitone)?.label ?? '1=C'}</span>
        <span className="chip">Current: {currentScore ?? '--'}</span>
        <span className="chip">First: {firstScore ?? '--'}</span>
        <span className="chip">Best: {bestScore ?? '--'}</span>
        <span className="status-text">{status}</span>
      </section>

      <section className="panel panel-current">
        <div className="panel-head">
          <h2>Current <span className="score-pill">Score {currentScore ?? '--'}</span></h2>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void replayAttempt(machine.question.current)}
            disabled={!machine.question.current || replayPlaying}
          >
            Replay Current
          </button>
        </div>
        <p className="subscore-row">{formatSubscores(machine.question.current)}</p>
        {countdownLabel !== null ? (
          <div className="countdown">{countdownLabel}</div>
        ) : hideChartsUntilFirstScore ? (
          <div className="first-attempt-mask">
            <p>Listen and sing first, no chart yet.</p>
            <p className="sub">Charts will appear after your first scored attempt.</p>
          </div>
        ) : (
          <PitchCanvas
            className="pitch-canvas"
            target={exercise?.target ?? []}
            attempt={currentCurve}
            axis={axis}
            doHz={exercise?.effectiveDoHz ?? settings.doHz}
            durationSec={MAX_DISPLAY_SECONDS}
          />
        )}
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-head">
            <h3>First <span className="score-pill">Score {firstScore ?? '--'}</span></h3>
            <button
              type="button"
              className="btn ghost"
              onClick={() => void replayAttempt(machine.question.first)}
              disabled={!machine.question.first || replayPlaying}
          >
            Replay First
          </button>
        </div>
          <p className="subscore-row">{formatSubscores(machine.question.first)}</p>
          {hideChartsUntilFirstScore ? (
            <div className="first-attempt-mask">
              <p>First chart hidden</p>
              <p className="sub">Complete your first scored attempt to unlock.</p>
            </div>
          ) : (
            <PitchCanvas
              className="pitch-canvas"
              target={exercise?.target ?? []}
              attempt={machine.question.first?.curve ?? []}
              axis={axis}
              doHz={exercise?.effectiveDoHz ?? settings.doHz}
              durationSec={MAX_DISPLAY_SECONDS}
            />
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <h3>Best <span className="score-pill">Score {bestScore ?? '--'}</span></h3>
            <button
              type="button"
              className="btn ghost"
              onClick={() => void replayAttempt(machine.question.best)}
              disabled={!machine.question.best || replayPlaying}
          >
            Replay Best
          </button>
        </div>
          <p className="subscore-row">{formatSubscores(machine.question.best)}</p>
          {hideChartsUntilFirstScore ? (
            <div className="first-attempt-mask">
              <p>Best chart hidden</p>
              <p className="sub">Complete your first scored attempt to unlock.</p>
            </div>
          ) : (
            <PitchCanvas
              className="pitch-canvas"
              target={exercise?.target ?? []}
              attempt={machine.question.best?.curve ?? []}
              axis={axis}
              doHz={exercise?.effectiveDoHz ?? settings.doHz}
              durationSec={MAX_DISPLAY_SECONDS}
            />
          )}
        </article>
      </section>
    </div>
  )
}
