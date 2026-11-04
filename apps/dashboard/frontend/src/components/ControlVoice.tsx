import { Mic, MicOff, Square } from "lucide-react";
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
import { cn } from "@/lib/utils";

const PTT_MS = 8000;
const MIN_HOLD_MS = 280;
const COMMAND_SILENCE_MS = 1400;
const COMMAND_MAX_MS = 10000;
const FOLLOWUP_MAX_MS = 10000;
const FOLLOWUP_SILENCE_MS = 1400;
const FOLLOWUP_SPEECH_RMS = 0.018;

type ListenMode = "off" | "wake" | "command";

type Props = {
  className?: string;
  onRoomsMaybeChanged?: () => void;
};

export function ControlVoice({ className, onRoomsMaybeChanged }: Props) {
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
  const holdStartedRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
  const startWakeRef = useRef<() => Promise<void>>(async () => undefined);
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
          const { audio, done } = playAudioBase64(result.audio_base64, result.audio_mime);
          audioRef.current = audio;
          await done;
        } catch {
          /* still show text */
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
          setError("Mic permission failed: " + (err instanceof Error ? err.message : err));
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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const mr = new MediaRecorder(stream, { mimeType: mime });
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
      const blob = new Blob(chunksRef.current, { type: mime });
      if (blob.size < 800) {
        setPhaseSafe("idle");
        setHeard("");
        setError("Didn't catch that.");
        modeRef.current = wakeOnRef.current ? "wake" : "off";
        return;
      }
      setPhaseSafe("thinking");
      try {
        const result = await sendAudioTurn(blob);
        await finishTurn(result);
      } catch (err) {
        setPhaseSafe("error");
        setError(String(err instanceof Error ? err.message : err));
        window.setTimeout(() => setPhaseSafe("idle"), 2500);
      }
    };
    mr.start();
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

  const startWake = useCallback(async () => {
    if (!wakeOnRef.current) return;
    if (recordingRef.current || autoListenRef.current) return;
    if (phaseRef.current === "thinking" || phaseRef.current === "speaking") return;
    if (wakeFatalRef.current) return;

    const rec = createWakeRecognizer();
    if (!rec) {
      setError("Wake unsupported in this browser");
      return;
    }
    try {
      const warm = await navigator.mediaDevices.getUserMedia({ audio: true });
      warm.getTracks().forEach((t) => t.stop());
    } catch (err) {
      setWakeOn(false);
      wakeOnRef.current = false;
      setError(String(err instanceof Error ? err.message : err));
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
            ? "Speech service blocked in this browser"
            : code === "network"
              ? "Speech network error — Firefox’s recognition server is not usable. Hold to talk instead."
              : `Wake error: ${code}`;
      if (
        code === "not-allowed" ||
        code === "service-not-allowed" ||
        code === "network" ||
        code === "audio-capture" ||
        code === "language-not-supported"
      ) {
        wakeFatalRef.current = true;
        setError(msg);
        setWakeOn(false);
        wakeOnRef.current = false;
        stopRecognizer();
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
      setError(String(err instanceof Error ? err.message : err));
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
    if (wakeOn) {
      wakeFatalRef.current = false;
      wakeRestartCountRef.current = 0;
      modeRef.current = "wake";
      void startWake();
    } else {
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

  const onPointerDown = async (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (phaseRef.current === "speaking") {
      stopSpeech();
      return;
    }
    if (phaseRef.current === "thinking") return;
    if (recordingRef.current && autoListenRef.current) {
      stopRecording();
      return;
    }
    if (recordingRef.current) return;
    holdStartedRef.current = Date.now();
    try {
      await startRecording();
    } catch (err) {
      setPhaseSafe("error");
      setError("Mic permission failed: " + (err instanceof Error ? err.message : err));
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!recordingRef.current) return;
    if (autoListenRef.current) return;
    const held = Date.now() - holdStartedRef.current;
    if (held < MIN_HOLD_MS) return;
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
      ? "Say “Hey Homelab”"
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
                ? "Listening for Homelab"
                : "Hold the mic to talk";

  return (
    <section
      className={cn(
        "relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-hairline bg-card/90 p-3.5",
        className,
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Voice
          </p>
          <p className="truncate text-base font-medium text-ink-muted">{statusLabel}</p>
        </div>
        <div className="flex shrink-0 items-center justify-end">
          <button
            type="button"
            onClick={() => {
              const next = !wakeOn;
              wakeOnRef.current = next;
              setWakeOn(next);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium",
              wakeOn
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-hairline bg-panel text-ink-faint",
            )}
          >
            {wakeOn ? "Wake on" : "Wake off"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid min-h-0 flex-1 grid-cols-[1.15fr_1fr] gap-3">
        <div className="flex min-h-0 flex-col justify-between gap-3 rounded-xl border border-hairline bg-panel/60 px-3.5 py-3">
          <div className="min-h-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">You</p>
            <p className="mt-1 line-clamp-4 text-base leading-snug text-ink">{heard || "—"}</p>
          </div>
          <div className="min-h-0 flex-1 border-t border-hairline pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Assistant
            </p>
            <p
              className={cn(
                "mt-1 line-clamp-5 text-base leading-snug",
                error ? "text-loss" : "text-ink-muted",
              )}
            >
              {error || reply || "—"}
            </p>
            {savedNote && !error ? (
              <p
                className={cn(
                  "mt-1.5 text-xs",
                  savedNote.includes("failed") ? "text-loss" : "text-gain",
                )}
              >
                {savedNote}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 w-full flex-col items-center justify-center gap-2 overflow-hidden">
          <button
            type="button"
            onPointerDown={(e) => void onPointerDown(e)}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={cn(
              "voice-orb relative flex items-center justify-center rounded-full border transition-colors select-none touch-none",
              "h-[8.5rem] w-[8.5rem]",
              phase === "listening" || phase === "wake"
                ? "border-warm/50 bg-warm-soft text-warm"
                : phase === "thinking"
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : phase === "speaking"
                    ? "border-gain/50 bg-gain/10 text-gain"
                    : phase === "error"
                      ? "border-loss/50 bg-loss/10 text-loss"
                      : "border-hairline bg-panel text-ink-muted",
            )}
            aria-label={
              phase === "speaking"
                ? "Stop speaking"
                : phase === "listening"
                  ? autoListen
                    ? "Listening"
                    : "Release to send"
                  : "Hold to talk"
            }
          >
            <span className={cn("voice-ring", phase)} aria-hidden />
            <span className={cn("voice-ring delay", phase)} aria-hidden />
            {phase === "speaking" ? (
              <Square className="relative z-10 h-9 w-9 fill-current" aria-hidden />
            ) : phase === "listening" || phase === "wake" ? (
              <Mic className="relative z-10 h-10 w-10" />
            ) : (
              <MicOff className="relative z-10 h-10 w-10" />
            )}
          </button>
          <p className="text-center text-xs text-ink-faint">
            {phase === "speaking"
              ? "Tap to stop"
              : phase === "listening" && autoListen
                ? "Pause to send"
                : phase === "listening" && recordingRef.current
                  ? "Release to send"
                  : "Hold to talk"}
          </p>
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
