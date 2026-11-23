import { VoiceRadialArray } from "@/components/VoiceRadialArray";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { CursorOverlay } from "@/components/CursorOverlay";
import {
  cancelCursorProposal,
  confirmCursorProposal,
  createWakeRecognizer,
  fetchCursorProposals,
  playAudioBase64,
  sendAudioTurn,
  sendTextTurn,
  stripWakePhrase,
  textContainsWakePhrase,
  type CursorProposal,
  type TurnResult,
  type VoicePhase,
} from "@/lib/assistantClient";

const PTT_MS = 8000;
const MIN_HOLD_MS = 280;
const COMMAND_SILENCE_MS = 1400;
const COMMAND_MAX_MS = 10000;
const FOLLOWUP_MAX_MS = 10000;
const FOLLOWUP_SILENCE_MS = 1400;
const FOLLOWUP_SPEECH_RMS = 0.018;

const SILENT_AUDIO = "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

function requestMicrophone() {
  if (!window.isSecureContext) throw new Error("Open the HTTPS kiosk to use the microphone.");
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not provide microphone access.");
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

function microphoneError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was denied. Allow it in Safari’s website settings and try again.";
  }
  return error instanceof Error ? error.message : String(error);
}

function startMicrophoneRecorder(stream: MediaStream) {
  // Let WebKit choose its native container before trying explicit formats.
  try {
    const recorder = new MediaRecorder(stream);
    recorder.start();
    return recorder;
  } catch {
    for (const mimeType of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]) {
      if (!MediaRecorder.isTypeSupported(mimeType)) continue;
      try {
        const recorder = new MediaRecorder(stream, { mimeType });
        recorder.start();
        return recorder;
      } catch {
        // Try the next advertised format if the browser rejects this one.
      }
    }
    throw new Error("The browser could not start an audio recording with this microphone.");
  }
}

type ListenMode = "off" | "wake" | "command";

type Props = {
  onRoomsMaybeChanged?: () => void;
};

export function ControlVoice({ onRoomsMaybeChanged }: Props) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [wakeOn, setWakeOn] = useState(false);
  const [autoListen, setAutoListen] = useState(false);
  const [proposal, setProposal] = useState<CursorProposal | null>(null);
  const [proposalBusy, setProposalBusy] = useState(false);

  const phaseRef = useRef<VoicePhase>("idle");
  const recordingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const pttTimerRef = useRef<number | null>(null);
  const holdReleasedRef = useRef(true);
  const startingHoldRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const autoListenRef = useRef(false);
  const vadRafRef = useRef<number | null>(null);
  const startRecordingRef = useRef<(opts?: { auto?: boolean }) => Promise<void>>(async () => undefined);
  const roomsCb = useRef(onRoomsMaybeChanged);
  roomsCb.current = onRoomsMaybeChanged;

  const wakeOnRef = useRef(false);
  const modeRef = useRef<ListenMode>("off");
  const wakeRecRef = useRef<ReturnType<typeof createWakeRecognizer>>(null);
  const commandTextRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const submitLockRef = useRef(false);
  const startWakeRef = useRef<() => void>(() => undefined);
  const wakeRestartTimerRef = useRef<number | null>(null);
  const wakeRestartCountRef = useRef(0);
  const wakeRestartWindowRef = useRef(0);
  const wakeFatalRef = useRef(false);
  const lastWakeErrorRef = useRef("");

  const setPhaseSafe = (p: VoicePhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const clearCommandTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (maxTimerRef.current) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  const stopRecognizer = useCallback(() => {
    if (wakeRestartTimerRef.current) {
      window.clearTimeout(wakeRestartTimerRef.current);
      wakeRestartTimerRef.current = null;
    }
    const rec = wakeRecRef.current;
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.stop();
    } catch {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }
    wakeRecRef.current = null;
  }, []);

  const preparePlayback = () => {
    if (playbackRef.current) return;
    // Safari grants playback permission to the audio element used during a gesture.
    const player = new Audio(SILENT_AUDIO);
    playbackRef.current = player;
    void player.play().catch(() => {
      if (playbackRef.current === player && player.src === SILENT_AUDIO) playbackRef.current = null;
    });
  };

  const stopSpeech = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.dispatchEvent(new Event("ended"));
    audioRef.current = null;
  }, []);

  const finishTurn = useCallback(
    async (result: TurnResult) => {
      setHeard(result.transcript ? `“${result.transcript}”` : "");
      setReply(result.reply || "");
      const personaAction = result.actions?.find((a) => a.tool === "update_persona");
      setSavedNote(
        personaAction
          ? personaAction.ok
            ? "Saved to persona"
            : "Persona save failed"
          : "",
      );
      const queued =
        result.cursor_proposal ||
        result.actions?.find((a) => a.tool === "propose_cursor_edit" && a.ok)?.result;
      if (queued?.id) {
        setProposal({
          id: queued.id,
          prompt: queued.prompt || "",
          status: queued.status || "pending",
          result: queued.result,
          error: queued.error,
        });
      }
      if (result.actions?.some((a) => a.tool.includes("light") || a.tool.includes("room"))) {
        roomsCb.current?.();
      }
      if (result.audio_base64) {
        setPhaseSafe("speaking");
        try {
          const { audio, done } = playAudioBase64(result.audio_base64, result.audio_mime, playbackRef.current ?? undefined);
          audioRef.current = audio;
          await done;
        } catch (err) {
          setError(err instanceof DOMException && err.name === "NotAllowedError"
            ? "Safari blocked audio playback. Hold to talk once to enable audio."
            : "Couldn’t play the voice reply.");
        } finally {
          audioRef.current = null;
        }
      }
      const asksFollowUp = /\?\s*$/.test((result.reply || "").trim());
      if (asksFollowUp) {
        modeRef.current = "off";
        autoListenRef.current = true;
        stopRecognizer();
        try {
          await startRecordingRef.current({ auto: true });
        } catch (err) {
          autoListenRef.current = false;
          setAutoListen(false);
          setPhaseSafe("idle");
          modeRef.current = wakeOnRef.current ? "wake" : "off";
          setError(microphoneError(err));
        }
        return;
      }
      setPhaseSafe("idle");
      modeRef.current = wakeOnRef.current ? "wake" : "off";
    },
    [stopRecognizer],
  );

  const runTextCommand = useCallback(
    async (text: string) => {
      const cleaned = text.trim();
      if (cleaned.length < 2) {
        setPhaseSafe("idle");
        setError("Didn't catch a command.");
        modeRef.current = wakeOnRef.current ? "wake" : "off";
        return;
      }
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      clearCommandTimers();
      modeRef.current = "off";
      stopRecognizer();
      setHeard(`“${cleaned}”`);
      setPhaseSafe("thinking");
      setError("");
      setSavedNote("");
      try {
        const result = await sendTextTurn(cleaned);
        await finishTurn(result);
      } catch (err) {
        setPhaseSafe("error");
        setError(String(err instanceof Error ? err.message : err));
        window.setTimeout(() => setPhaseSafe("idle"), 2500);
      } finally {
        submitLockRef.current = false;
        if (!autoListenRef.current && !recordingRef.current) {
          modeRef.current = wakeOnRef.current ? "wake" : "off";
        }
      }
    },
    [clearCommandTimers, finishTurn, stopRecognizer],
  );

  const scheduleCommandSubmit = useCallback(() => {
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = window.setTimeout(() => {
      void runTextCommand(commandTextRef.current.trim());
    }, COMMAND_SILENCE_MS);
  }, [runTextCommand]);

  const beginCommandCapture = useCallback(
    (seed: string) => {
      modeRef.current = "command";
      commandTextRef.current = stripWakePhrase(seed);
      setPhaseSafe("listening");
      setHeard(commandTextRef.current ? `“${commandTextRef.current}”` : "Listening…");
      clearCommandTimers();
      maxTimerRef.current = window.setTimeout(() => {
        void runTextCommand(commandTextRef.current);
      }, COMMAND_MAX_MS);
      if (commandTextRef.current.length >= 2) scheduleCommandSubmit();
    },
    [clearCommandTimers, runTextCommand, scheduleCommandSubmit],
  );

  const stopRecording = useCallback(() => {
    if (!recordingRef.current || !mediaRecorderRef.current) return;
    recordingRef.current = false;
    if (pttTimerRef.current) {
      window.clearTimeout(pttTimerRef.current);
      pttTimerRef.current = null;
    }
    if (vadRafRef.current != null) {
      window.cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
  }, []);

  const startRecording = useCallback(async (opts: { auto?: boolean } = {}) => {
    if (recordingRef.current) return;
    const auto = !!opts.auto;
    autoListenRef.current = auto;
    setAutoListen(auto);
    modeRef.current = "off";
    clearCommandTimers();
    stopRecognizer();
    setError("");
    if (!auto) {
      setReply("");
      setSavedNote("");
    }
    const stream = await requestMicrophone();
    if (!auto && holdReleasedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      setError("Hold until you see Listening, then speak and release.");
      setPhaseSafe("idle");
      return;
    }
    let mr: MediaRecorder;
    try {
      mr = startMicrophoneRecorder(stream);
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      throw error;
    }
    const recordingStartedAt = performance.now();
    streamRef.current = stream;
    chunksRef.current = [];
    mediaRecorderRef.current = mr;
    mr.ondataavailable = (e) => {
      if (e.data?.size) chunksRef.current.push(e.data);
    };
    mr.onstop = async () => {
      autoListenRef.current = false;
      setAutoListen(false);
      if (vadRafRef.current != null) {
        window.cancelAnimationFrame(vadRafRef.current);
        vadRafRef.current = null;
      }
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || mr.mimeType });
      if ((!auto && performance.now() - recordingStartedAt < MIN_HOLD_MS) || !blob.size) {
        setPhaseSafe("idle");
        setHeard("");
        setError(auto ? "No audio was recorded. Hold to talk to try again." : "Hold until you see Listening, then speak and release.");
        modeRef.current = wakeOnRef.current ? "wake" : "off";
        return;
      }
      setPhaseSafe("thinking");
      try {
        const result = await sendAudioTurn(blob);
        await finishTurn(result);
      } catch (err) {
        setPhaseSafe("error");
        const detail = err instanceof DOMException ? err.name : microphoneError(err);
        setError(`Couldn’t send the recording. ${detail}`);
        window.setTimeout(() => setPhaseSafe("idle"), 2500);
      }
    };
    recordingRef.current = true;
    setPhaseSafe("listening");
    setHeard(auto ? "Your turn…" : "Listening…");
    if (pttTimerRef.current) window.clearTimeout(pttTimerRef.current);
    pttTimerRef.current = window.setTimeout(
      () => stopRecording(),
      auto ? FOLLOWUP_MAX_MS : PTT_MS,
    );

    if (auto) {
      const ctx = new AudioContext();
      void ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let heardSpeech = false;
      let silentAt = 0;
      const tick = () => {
        if (!recordingRef.current || !autoListenRef.current) {
          void ctx.close();
          return;
        }
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const s of samples) sum += s * s;
        const rms = Math.sqrt(sum / samples.length);
        if (rms >= FOLLOWUP_SPEECH_RMS) {
          heardSpeech = true;
          silentAt = 0;
        } else if (heardSpeech) {
          if (!silentAt) silentAt = performance.now();
          else if (performance.now() - silentAt >= FOLLOWUP_SILENCE_MS) {
            void ctx.close();
            stopRecording();
            return;
          }
        }
        vadRafRef.current = window.requestAnimationFrame(tick);
      };
      vadRafRef.current = window.requestAnimationFrame(tick);
    }
  }, [clearCommandTimers, finishTurn, stopRecognizer, stopRecording]);

  startRecordingRef.current = startRecording;

  const handleRecognizerResult = useCallback(
    (fullText: string) => {
      if (modeRef.current === "wake") {
        if (!textContainsWakePhrase(fullText)) return;
        beginCommandCapture(fullText);
        return;
      }
      if (modeRef.current === "command") {
        const cmd = stripWakePhrase(fullText);
        commandTextRef.current = cmd;
        setHeard(cmd ? `“${cmd}”` : "Listening…");
        scheduleCommandSubmit();
      }
    },
    [beginCommandCapture, scheduleCommandSubmit],
  );

  const startWake = useCallback(() => {
    if (!wakeOnRef.current) return;
    if (recordingRef.current || autoListenRef.current) return;
    if (phaseRef.current === "thinking" || phaseRef.current === "speaking") return;
    if (wakeFatalRef.current) return;

    const disableWake = (message: string) => {
      wakeFatalRef.current = true;
      wakeOnRef.current = false;
      setWakeOn(false);
      setError(message);
      stopRecognizer();
      if (phaseRef.current === "wake") setPhaseSafe("idle");
    };

    if (!window.isSecureContext) {
      disableWake("Open the HTTPS kiosk to use the wake word.");
      return;
    }
    const rec = createWakeRecognizer();
    if (!rec) {
      disableWake("Wake word detection is unavailable here. Hold to talk instead.");
      return;
    }

    stopRecognizer();
    wakeRecRef.current = rec;
    modeRef.current = "wake";
    commandTextRef.current = "";
    setPhaseSafe("wake");

    const scheduleRestart = () => {
      if (!wakeOnRef.current || wakeFatalRef.current) return;
      if (modeRef.current !== "wake") return;
      if (phaseRef.current !== "idle" && phaseRef.current !== "wake") return;

      const now = Date.now();
      if (now - wakeRestartWindowRef.current > 8_000) {
        wakeRestartWindowRef.current = now;
        wakeRestartCountRef.current = 0;
      }
      wakeRestartCountRef.current += 1;

      if (wakeRestartCountRef.current >= 8) {
        wakeFatalRef.current = true;
        stopRecognizer();
        return;
      }

      const delay = Math.min(4000, 400 * wakeRestartCountRef.current);
      if (wakeRestartTimerRef.current) window.clearTimeout(wakeRestartTimerRef.current);
      wakeRestartTimerRef.current = window.setTimeout(() => {
        wakeRestartTimerRef.current = null;
        if (!wakeOnRef.current || wakeFatalRef.current) return;
        try {
          rec.start();
        } catch {
          void startWakeRef.current();
        }
      }, delay);
    };

    rec.onresult = (ev) => {
      wakeRestartCountRef.current = 0;
      let full = "";
      for (let i = 0; i < ev.results.length; i++) {
        full += ev.results[i][0]?.transcript || "";
      }
      handleRecognizerResult(full.trim());
    };
    rec.onerror = (ev) => {
      const code = ev.error || "unknown";
      if (code === "aborted") return;
      lastWakeErrorRef.current = code;
      if (code === "no-speech") return;
      const msg =
        code === "not-allowed"
          ? "Mic permission denied"
          : code === "service-not-allowed"
            ? "Wake word unavailable. In Safari, enable Siri or Dictation, or hold to talk."
            : code === "network"
              ? "The browser could not reach its speech recognition service. Hold to talk instead."
              : `Wake error: ${code}`;
      if (
        code === "not-allowed" ||
        code === "service-not-allowed" ||
        code === "network" ||
        code === "audio-capture" ||
        code === "language-not-supported"
      ) {
        disableWake(msg);
      }
    };
    rec.onend = () => {
      if (!wakeOnRef.current) return;
      if (wakeFatalRef.current) return;
      if (modeRef.current === "command") {
        void runTextCommand(commandTextRef.current);
        return;
      }
      lastWakeErrorRef.current = "";
      scheduleRestart();
    };
    try {
      rec.start();
    } catch (err) {
      disableWake(`Couldn’t start wake word detection. ${microphoneError(err)}`);
    }
  }, [handleRecognizerResult, runTextCommand, stopRecognizer]);

  startWakeRef.current = startWake;

  useEffect(() => {
    let cancelled = false;
    void fetchCursorProposals()
      .then((list) => {
        if (cancelled) return;
        const active = [...list].reverse().find((p) => p.status === "pending" || p.status === "running");
        if (active) setProposal(active);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!proposal || proposal.status !== "running") return;
    let cancelled = false;
    const tick = () => {
      void fetchCursorProposals()
        .then((list) => {
          if (cancelled) return;
          const next = list.find((p) => p.id === proposal.id);
          if (next) setProposal(next);
        })
        .catch(() => undefined);
    };
    const id = window.setInterval(tick, 1000);
    tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [proposal?.id, proposal?.status]);

  useEffect(() => {
    wakeOnRef.current = wakeOn;
    if (!wakeOn) {
      modeRef.current = "off";
      wakeFatalRef.current = false;
      clearCommandTimers();
      stopRecognizer();
      if (phaseRef.current === "wake") setPhaseSafe("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeOn]);

  useEffect(() => {
    if (
      wakeOn &&
      phase === "idle" &&
      modeRef.current !== "command" &&
      !recordingRef.current &&
      !autoListenRef.current &&
      !wakeFatalRef.current
    ) {
      modeRef.current = "wake";
      void startWake();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const beginHold = async () => {
    if (phaseRef.current === "speaking") {
      stopSpeech();
      return;
    }
    if (phaseRef.current === "thinking") return;
    if (recordingRef.current && autoListenRef.current) {
      stopRecording();
      return;
    }
    holdReleasedRef.current = false;
    if (recordingRef.current || startingHoldRef.current) return;
    startingHoldRef.current = true;
    try {
      preparePlayback();
    } catch {
      // Recording is still available if the browser rejects playback setup.
    }
    try {
      await startRecording();
    } catch (err) {
      setPhaseSafe("error");
      setError(microphoneError(err));
    } finally {
      startingHoldRef.current = false;
    }
  };

  const endHold = () => {
    holdReleasedRef.current = true;
    if (!recordingRef.current || autoListenRef.current) return;
    stopRecording();
  };

  const onConfirmProposal = async () => {
    if (!proposal || proposalBusy) return;
    setProposalBusy(true);
    try {
      const next = await confirmCursorProposal(proposal.id);
      setProposal({ ...proposal, ...next, status: next.status || "running" });
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setProposalBusy(false);
    }
  };

  const onCancelProposal = async () => {
    if (!proposal || proposalBusy) return;
    setProposalBusy(true);
    try {
      await cancelCursorProposal(proposal.id);
      setProposal(null);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setProposalBusy(false);
    }
  };

  const statusLabel =
    phase === "wake"
      ? "Say “NOVA”"
      : phase === "listening"
        ? autoListen
          ? "Your turn… pause when you’re done"
          : recordingRef.current
            ? "Listening… release to send"
            : "Listening… speak the command"
        : phase === "thinking"
          ? "Thinking…"
          : phase === "speaking"
            ? "Speaking… tap to stop"
            : phase === "error"
              ? "Something went wrong"
              : wakeOn
                ? "Listening for “NOVA”"
                : "Hold the mic to talk";

  return (
    <section className="kiosk-voice" aria-labelledby="kiosk-voice-title">
      <header className="kiosk-voice-header">
        <h2 id="kiosk-voice-title">Voice assistant</h2>
        <button
          type="button"
          className="kiosk-wake"
          aria-label="Wake word detection"
          aria-pressed={wakeOn}
          onClick={() => {
            const next = !wakeOn;
            wakeOnRef.current = next;
            setWakeOn(next);
            if (next) {
              wakeFatalRef.current = false;
              wakeRestartCountRef.current = 0;
              setError("");
              startWake();
            }
          }}
        >
          {wakeOn ? "Wake on" : "Wake off"}
        </button>
      </header>

      <button
        type="button"
        className="kiosk-voice-array"
        data-phase={phase}
        aria-label={phase === "speaking" ? "Stop speaking" : "Hold to talk"}
        aria-describedby="kiosk-voice-status"
        onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          void beginHold();
        }}
        onPointerUp={endHold}
        onPointerCancel={endHold}
        onKeyDown={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          if (!event.repeat) void beginHold();
        }}
        onKeyUp={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          endHold();
        }}
        onBlur={endHold}
      >
        <VoiceRadialArray phase={phase} streamRef={streamRef} audioRef={audioRef} />
      </button>
      <p id="kiosk-voice-status" className="kiosk-voice-status" role="status">{statusLabel}</p>

      <div className="kiosk-captions" aria-live="polite">
        <div className="kiosk-caption">
          <p>You</p>
          <div tabIndex={heard ? 0 : undefined}>{heard || "—"}</div>
        </div>
        <div className="kiosk-caption">
          <p>NOVA</p>
          <div tabIndex={error || reply ? 0 : undefined}>
            <span>{reply || (!error ? "—" : "")}</span>
            {error && <small data-error="true">{error}</small>}
            {savedNote && !error && <small>{savedNote}</small>}
          </div>
        </div>
      </div>

      {proposal && proposal.status !== "cancelled" ? (
        <CursorOverlay
          proposal={proposal}
          busy={proposalBusy}
          onConfirm={() => void onConfirmProposal()}
          onCancel={() => void onCancelProposal()}
          onDismiss={() => setProposal(null)}
        />
      ) : null}
    </section>
  );
}
