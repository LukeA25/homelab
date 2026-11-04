"""Pi 3B voice client — push-to-talk and on-device wake word.

Environment:
  ASSISTANT_URL          default https://assistant.home.arpa
  ASSISTANT_DEVICE_TOKEN required
  ASSISTANT_SESSION_ID   default "pi-wake"; groups turns for 5-min context reset
  ASSISTANT_TLS_VERIFY   default 1; set 0 to skip internal-CA verification
  WAKE_ENGINE            default vosk (openwakeword / porcupine optional)
  WAKE_WORD              comma-separated phrases, default "hey homelab,hey home lab,hey home love"
  WAKE_SENSITIVITY       openwakeword score 0..1 (lower = easier); default 0.35
  WAKE_GAIN              software mic boost, default 2.2
  PREROLL_SECONDS        audio kept before wake so you can speak in one breath
  UTTERANCE_SECONDS      default 5.0; audio captured after wake
  VOSK_MODEL             path to vosk model dir
  QUIET_HOURS_START      default 23 (local hour)
  QUIET_HOURS_END        default 7
  MUTED                  set 1 to disable mic capture
  PICOVOICE_ACCESS_KEY   only if WAKE_ENGINE=porcupine
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import struct
import sys
import threading
import time
import wave
from collections import deque
from datetime import datetime
from typing import Optional, Protocol
from zoneinfo import ZoneInfo

import httpx

try:
    import sounddevice as sd
except ImportError:
    sd = None  # type: ignore


SAMPLE_RATE = 16000
CHANNELS = 1
OWW_FRAME = 1280  # 80 ms at 16 kHz
VOSK_FRAME = 4000  # 250 ms at 16 kHz — better for phrase spotting


def apply_gain(pcm: bytes, gain: float) -> bytes:
    if gain == 1.0:
        return pcm
    import numpy as np

    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) * gain
    return np.clip(audio, -32768, 32767).astype(np.int16).tobytes()


def normalize_phrase(text: str) -> str:
    t = text.lower()
    t = re.sub(r"[^a-z0-9\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    t = t.replace("home love", "home lab")
    t = t.replace("home lab", "homelab")
    t = t.replace("homelabs", "homelab")
    return t


def input_samplerate() -> int:
    if sd is None:
        return SAMPLE_RATE
    try:
        return int(sd.query_devices(kind="input")["default_samplerate"])
    except Exception:
        return SAMPLE_RATE


def resample_pcm(pcm: bytes, from_sr: int, to_sr: int, out_samples: int | None = None) -> bytes:
    if from_sr == to_sr and out_samples is None:
        return pcm
    import numpy as np
    from scipy.signal import resample_poly

    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
    if from_sr != to_sr:
        audio = resample_poly(audio, to_sr, from_sr)
    if out_samples is not None:
        if audio.size < out_samples:
            audio = np.pad(audio, (0, out_samples - audio.size))
        else:
            audio = audio[:out_samples]
    return np.clip(audio, -32768, 32767).astype(np.int16).tobytes()


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def in_quiet_hours(tz_name: str, start: int, end: int) -> bool:
    try:
        now = datetime.now(ZoneInfo(tz_name))
    except Exception:
        now = datetime.now()
    hour = now.hour
    if start == end:
        return False
    if start > end:
        return hour >= start or hour < end
    return start <= hour < end


def pcm_to_wav(pcm: bytes, sample_rate: int = SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm)
    return buf.getvalue()


def record_seconds(seconds: float = 4.0) -> bytes:
    if sd is None:
        raise RuntimeError("sounddevice is not installed")
    native_sr = input_samplerate()
    frames = int(seconds * native_sr)
    print(f"[ptt] recording {seconds:.1f}s at {native_sr} Hz…", flush=True)
    audio = sd.rec(frames, samplerate=native_sr, channels=CHANNELS, dtype="int16")
    sd.wait()
    return resample_pcm(audio.tobytes(), native_sr, SAMPLE_RATE)


def _tls_verify() -> bool:
    return env("ASSISTANT_TLS_VERIFY", "1") not in ("0", "false", "no")


def send_turn(wav_bytes: bytes, base_url: str, token: str) -> dict:
    headers = {"X-Assistant-Token": token}
    session_id = env("ASSISTANT_SESSION_ID", "pi-wake")
    if session_id:
        headers["X-Session-Id"] = session_id
    with httpx.Client(timeout=60.0, verify=_tls_verify()) as client:
        resp = client.post(
            f"{base_url.rstrip('/')}/api/turn",
            headers=headers,
            files={"audio": ("speech.wav", wav_bytes, "audio/wav")},
        )
        resp.raise_for_status()
        return resp.json()


def play_mp3_base64(b64: str) -> None:
    import base64
    import subprocess
    import tempfile

    raw = base64.b64decode(b64)
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp.write(raw)
        path = tmp.name
    try:
        for cmd in (
            ["mpg123", "-q", path],
            ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet", path],
        ):
            try:
                subprocess.run(cmd, check=True)
                return
            except (FileNotFoundError, subprocess.CalledProcessError):
                continue
        print("[tts] no mpg123/ffplay available; skipping playback", flush=True)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def run_ptt_once(base_url: str, token: str, seconds: float) -> None:
    pcm = record_seconds(seconds)
    wav = pcm_to_wav(pcm)
    print("[ptt] uploading…", flush=True)
    result = send_turn(wav, base_url, token)
    print(f"[heard] {result.get('transcript')}", flush=True)
    print(f"[reply] {result.get('reply')}", flush=True)
    print(f"[meta]  {result.get('elapsed_ms')} ms", flush=True)
    if result.get("audio_base64"):
        play_mp3_base64(result["audio_base64"])


class WakeEngine(Protocol):
    sample_rate: int
    frame_length: int
    label: str

    def process(self, pcm_bytes: bytes) -> bool: ...
    def reset(self) -> None: ...


def normalize_oww_name(keyword: str) -> str:
    name = keyword.strip().lower().replace(" ", "_").replace("-", "_")
    aliases = {
        "jarvis": "hey_jarvis",
        "heyjarvis": "hey_jarvis",
        "mycroft": "hey_mycroft",
        "heymycroft": "hey_mycroft",
        "rhasspy": "hey_rhasspy",
        "heyrhasspy": "hey_rhasspy",
    }
    return aliases.get(name, name)


def make_openwakeword(keyword: str, sensitivity: float) -> WakeEngine:
    import numpy as np
    from openwakeword.model import Model

    model_name = normalize_oww_name(keyword or "hey_jarvis")
    allowed = {"hey_jarvis", "alexa", "hey_mycroft", "hey_rhasspy"}
    if model_name not in allowed and not (
        model_name.endswith(".onnx") or model_name.endswith(".tflite")
    ):
        raise RuntimeError(
            f"Unknown openWakeWord model '{keyword}'. "
            f"Use one of: {', '.join(sorted(allowed))}"
        )

    models = [model_name]
    try:
        oww = Model(
            wakeword_models=models,
            inference_framework="onnx",
            vad_threshold=0.15,
        )
    except Exception:
        oww = Model(wakeword_models=models, inference_framework="onnx")

    class OpenWakeWordEngine:
        sample_rate = SAMPLE_RATE
        frame_length = OWW_FRAME
        label = model_name

        def process(self, pcm_bytes: bytes) -> bool:
            audio = np.frombuffer(pcm_bytes, dtype=np.int16)
            if audio.size < self.frame_length:
                return False
            scores = oww.predict(audio)
            return any(float(score) >= sensitivity for score in scores.values())

        def reset(self) -> None:
            reset = getattr(oww, "reset", None)
            if callable(reset):
                reset()

    return OpenWakeWordEngine()


def parse_wake_phrases(keyword: str) -> list[str]:
    raw = keyword or "hey homelab,hey home lab,hey home love"
    phrases = []
    for part in raw.split(","):
        n = normalize_phrase(part)
        if n:
            phrases.append(n)
    if not phrases:
        phrases = ["hey homelab"]
    if "hey homelab" not in phrases:
        # "hey home lab" normalizes to the same token.
        pass
    extra = []
    for p in phrases:
        if "home lab" in p:
            extra.append(normalize_phrase(p))
    return list(dict.fromkeys(phrases + extra))


def make_vosk(keyword: str) -> WakeEngine:
    from vosk import KaldiRecognizer, Model

    model_path = os.path.expanduser(
        env("VOSK_MODEL", "/home/homelab/vosk-model-small-en-us-0.15")
    )
    if not os.path.isdir(model_path):
        raise RuntimeError(f"Vosk model not found at {model_path}")
    phrases = parse_wake_phrases(keyword)
    model = Model(model_path)
    rec = KaldiRecognizer(model, SAMPLE_RATE)
    rec.SetWords(True)

    class VoskEngine:
        sample_rate = SAMPLE_RATE
        frame_length = VOSK_FRAME
        label = " / ".join(phrases)

        def process(self, pcm_bytes: bytes) -> bool:
            if rec.AcceptWaveform(pcm_bytes):
                payload = json.loads(rec.Result())
                text = payload.get("text") or ""
            else:
                payload = json.loads(rec.PartialResult())
                text = payload.get("partial") or ""
            n = normalize_phrase(text)
            if not n:
                return False
            return any(p in n for p in phrases)

        def reset(self) -> None:
            rec.Reset()

    print(f"[wake] vosk phrases: {phrases}", flush=True)
    return VoskEngine()


def make_porcupine(access_key: str, keyword: str, sensitivity: float) -> WakeEngine:
    try:
        import pvporcupine
    except ImportError as exc:
        raise RuntimeError("pvporcupine not installed") from exc

    if keyword.endswith(".ppn") and os.path.isfile(keyword):
        porcupine = pvporcupine.create(
            access_key=access_key,
            keyword_paths=[keyword],
            sensitivities=[sensitivity],
        )
    else:
        porcupine = pvporcupine.create(
            access_key=access_key,
            keywords=[keyword],
            sensitivities=[sensitivity],
        )

    class PorcupineEngine:
        sample_rate = porcupine.sample_rate
        frame_length = porcupine.frame_length
        label = keyword

        def process(self, pcm_bytes: bytes) -> bool:
            pcm = struct.unpack_from(f"{self.frame_length}h", pcm_bytes)
            return porcupine.process(pcm) >= 0

        def reset(self) -> None:
            return

    return PorcupineEngine()


def run_wake_loop(
    base_url: str,
    token: str,
    engine: WakeEngine,
    tz_name: str,
    quiet_start: int,
    quiet_end: int,
) -> None:
    if sd is None:
        raise RuntimeError("sounddevice is not installed")

    utterance_seconds = float(env("UTTERANCE_SECONDS", "5.0") or "5.0")
    preroll_seconds = float(env("PREROLL_SECONDS", "1.8") or "1.8")
    gain = float(env("WAKE_GAIN", "2.2") or "2.2")
    frame_length = engine.frame_length
    native_sr = input_samplerate()
    capture_block = int(round(frame_length * native_sr / engine.sample_rate))
    preroll_n = max(1, int(preroll_seconds * native_sr / capture_block))
    preroll: deque[bytes] = deque(maxlen=preroll_n)
    print(
        f"[wake] listening for '{engine.label}' "
        f"(engine={env('WAKE_ENGINE', 'vosk')}, "
        f"mic={native_sr} Hz, gain={gain}, preroll={preroll_seconds:.1f}s, "
        f"frame={frame_length}@{engine.sample_rate} Hz)",
        flush=True,
    )

    muted = False

    def stdin_mute():
        nonlocal muted
        for line in sys.stdin:
            cmd = line.strip().lower()
            if cmd in ("m", "mute"):
                muted = True
                print("[wake] muted", flush=True)
            elif cmd in ("u", "unmute"):
                muted = False
                print("[wake] unmuted", flush=True)

    threading.Thread(target=stdin_mute, daemon=True).start()

    with sd.RawInputStream(
        samplerate=native_sr,
        blocksize=capture_block,
        channels=1,
        dtype="int16",
    ) as stream:
        while True:
            if env("MUTED") == "1" or muted:
                time.sleep(0.2)
                continue
            if in_quiet_hours(tz_name, quiet_start, quiet_end):
                time.sleep(1.0)
                continue

            pcm_native, _ = stream.read(capture_block)
            preroll.append(pcm_native)
            pcm_bytes = apply_gain(
                resample_pcm(
                    pcm_native, native_sr, engine.sample_rate, out_samples=frame_length
                ),
                gain,
            )
            if not engine.process(pcm_bytes):
                continue

            print("[wake] detected — recording utterance", flush=True)
            chunks = list(preroll)
            needed = int(utterance_seconds * native_sr / capture_block)
            for _ in range(needed):
                more, _ = stream.read(capture_block)
                chunks.append(more)
            wav = pcm_to_wav(
                apply_gain(resample_pcm(b"".join(chunks), native_sr, SAMPLE_RATE), gain),
                sample_rate=SAMPLE_RATE,
            )
            try:
                result = send_turn(wav, base_url, token)
                print(f"[heard] {result.get('transcript')}", flush=True)
                print(f"[reply] {result.get('reply')}", flush=True)
                if result.get("audio_base64") and env("PLAY_ON_DEVICE", "0") in (
                    "1",
                    "true",
                    "yes",
                ):
                    play_mp3_base64(result["audio_base64"])
            except Exception as exc:
                print(f"[error] {exc}", flush=True)
            engine.reset()
            # Drain a couple of frames so playback echo is less likely to re-trigger.
            for _ in range(8):
                stream.read(capture_block)


def build_engine() -> WakeEngine:
    engine_name = env("WAKE_ENGINE", "vosk").lower() or "vosk"
    keyword = env("WAKE_WORD") or (
        "hey homelab,hey home lab,hey home love"
        if engine_name in ("vosk", "homelab")
        else "hey_jarvis"
        if engine_name in ("openwakeword", "oww", "jarvis")
        else "porcupine"
    )
    sensitivity = float(env("WAKE_SENSITIVITY", "0.35") or "0.35")
    if engine_name in ("vosk", "homelab"):
        return make_vosk(keyword)
    if engine_name in ("openwakeword", "oww", "jarvis"):
        return make_openwakeword(keyword, sensitivity)
    if engine_name == "porcupine":
        key = env("PICOVOICE_ACCESS_KEY")
        if not key:
            raise RuntimeError("PICOVOICE_ACCESS_KEY required for WAKE_ENGINE=porcupine")
        return make_porcupine(key, keyword, sensitivity)
    raise RuntimeError(f"Unknown WAKE_ENGINE '{engine_name}' (use vosk or openwakeword)")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Homelab Pi voice client")
    parser.add_argument("--mode", choices=("ptt", "wake"), default="ptt")
    parser.add_argument("--seconds", type=float, default=4.0)
    parser.add_argument("--url", default=env("ASSISTANT_URL", "https://assistant.home.arpa"))
    parser.add_argument("--token", default=env("ASSISTANT_DEVICE_TOKEN"))
    args = parser.parse_args(argv)

    if not args.token:
        print("ASSISTANT_DEVICE_TOKEN is required", file=sys.stderr)
        return 1
    if sd is None:
        print("Install sounddevice: pip install sounddevice", file=sys.stderr)
        return 1

    if args.mode == "ptt":
        run_ptt_once(args.url, args.token, args.seconds)
        return 0

    try:
        engine = build_engine()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1
    run_wake_loop(
        base_url=args.url,
        token=args.token,
        engine=engine,
        tz_name=env("DISPLAY_TZ", "America/Chicago"),
        quiet_start=int(env("QUIET_HOURS_START", "23") or "23"),
        quiet_end=int(env("QUIET_HOURS_END", "7") or "7"),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
