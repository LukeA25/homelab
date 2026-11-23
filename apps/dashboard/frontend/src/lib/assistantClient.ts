/** Client for the voice assistant API (same origin when served via assistant.home.arpa). */

const TOKEN_KEY = "assistant_device_token";
const SESSION_KEY = "assistant_session_id";

export type VoicePhase =
  | "idle"
  | "wake"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export interface CursorProposal {
  id: string;
  prompt: string;
  status: "pending" | "running" | "done" | "error" | "cancelled" | string;
  created_at?: number;
  result?: string | null;
  error?: string | null;
  message?: string;
  progress?: string[];
}

export interface TurnResult {
  transcript?: string;
  reply?: string;
  audio_base64?: string;
  audio_mime?: string;
  elapsed_ms?: number;
  actions?: { tool: string; ok: boolean; result?: CursorProposal }[];
  cursor_proposal?: CursorProposal;
  detail?: string;
}

export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function getAssistantToken(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("token");
  if (fromUrl) {
    localStorage.setItem(TOKEN_KEY, fromUrl);
    return fromUrl;
  }
  return localStorage.getItem(TOKEN_KEY) || "dev-token-change-me";
}

export function setAssistantToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

function authHeaders(): HeadersInit {
  return {
    "X-Assistant-Token": getAssistantToken(),
    "X-Session-Id": getSessionId(),
  };
}

/** Prefer same-origin (assistant host). Fallback for direct :8004 testing. */
export function assistantBase(): string {
  const host = window.location.hostname;
  if (host === "assistant.home.arpa" || host === "localhost" || host === "127.0.0.1") {
    return "";
  }
  return "https://assistant.home.arpa";
}

async function readVoiceReply(response: Response): Promise<TurnResult> {
  if ([502, 503, 504].includes(response.status) && !response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("NOVA’s voice service is unavailable. Try again in a moment.");
  }
  let data: TurnResult;
  try {
    data = await response.json() as TurnResult;
  } catch {
    throw new Error(`NOVA returned an unreadable response (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(data.detail || `Voice request failed (HTTP ${response.status}).`);
  return data;
}

export async function sendAudioTurn(blob: Blob): Promise<TurnResult> {
  const form = new FormData();
  const container = blob.type.split(";")[0].split("/")[1];
  const extension = container === "mp4" || container === "ogg" || container === "wav" ? container : "webm";
  const recording = blob.slice(0, blob.size, `audio/${extension}`);
  form.append("audio", recording, `speech.${extension}`);
  form.append("session_id", getSessionId());
  const res = await fetch(`${assistantBase()}/api/turn`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return readVoiceReply(res);
}

export async function sendTextTurn(text: string): Promise<TurnResult> {
  const res = await fetch(`${assistantBase()}/api/turn/text`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, session_id: getSessionId() }),
  });
  return readVoiceReply(res);
}

export interface LastTurn {
  id: string | null;
  transcript: string;
  reply: string;
  updated_at: number;
  has_audio?: boolean;
  audio_mime?: string;
  actions?: { tool: string; ok: boolean; result?: CursorProposal }[];
  cursor_proposal?: CursorProposal;
}

export async function fetchLastTurn(): Promise<LastTurn> {
  const res = await fetch(`${assistantBase()}/api/last-turn`);
  if (!res.ok) throw new Error(res.statusText);
  return (await res.json()) as LastTurn;
}

export function lastTurnAudioUrl(id: string): string {
  return `${assistantBase()}/api/last-turn/audio?id=${encodeURIComponent(id)}`;
}

export async function fetchCursorProposals(): Promise<CursorProposal[]> {
  const res = await fetch(`${assistantBase()}/api/cursor/proposals`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(res.statusText);
  const data = (await res.json()) as { proposals?: CursorProposal[] };
  return data.proposals || [];
}

export async function confirmCursorProposal(id: string): Promise<CursorProposal> {
  const res = await fetch(`${assistantBase()}/api/cursor/proposals/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    headers: authHeaders(),
  });
  const data = (await res.json()) as CursorProposal & { detail?: string };
  if (!res.ok) throw new Error(data.detail || res.statusText);
  return data;
}

export async function cancelCursorProposal(id: string): Promise<CursorProposal> {
  const res = await fetch(`${assistantBase()}/api/cursor/proposals/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: authHeaders(),
  });
  const data = (await res.json()) as CursorProposal & { detail?: string };
  if (!res.ok) throw new Error(data.detail || res.statusText);
  return data;
}

export function playAudioBase64(b64: string, mime?: string, audio = new Audio()): {
  audio: HTMLAudioElement;
  done: Promise<void>;
} {
  audio.src = `data:${mime || "audio/mpeg"};base64,${b64}`;
  const done = new Promise<void>((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("Audio playback failed"));
    audio.play().catch(reject);
  });
  return { audio, done };
}

const WAKE_PHRASE = /^\s*(?:hey[\s,]+)?nova\b[\s,.:!?-]*/i;

export function textContainsWakePhrase(text: string): boolean {
  return WAKE_PHRASE.test(text);
}

export function stripWakePhrase(text: string): string {
  return text.replace(WAKE_PHRASE, "").trim();
}

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

export function createWakeRecognizer(): SpeechRec | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  return rec;
}
