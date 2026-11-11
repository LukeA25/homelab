const GAP_MS = 1500;
const MAX_TURNS = 24;

export function appendCaption(turns, who, delta, startMs, endMs) {
  const text = typeof delta === 'string' ? delta : '';
  if (!text) return turns;
  const last = turns.at(-1);
  const paused = last && last.who === who && Number.isFinite(startMs) && Number.isFinite(last.endMs) && startMs - last.endMs > GAP_MS;
  if (!last || last.who !== who || paused) turns.push({who, text, endMs: Number.isFinite(endMs) ? endMs : startMs});
  else {
    last.text += text;
    if (Number.isFinite(endMs)) last.endMs = endMs;
  }
  if (turns.length > MAX_TURNS) turns.splice(0, turns.length - MAX_TURNS);
  return turns;
}

export function finishCaption(turns, who, transcript) {
  const text = typeof transcript === 'string' ? transcript : '';
  if (!text.trim()) return turns;
  const last = turns.at(-1);
  const partial = last && last.who === who ? last.text.trim() : '';
  if (last && last.who === who && (text.startsWith(partial) || partial.startsWith(text.trim()))) last.text = text;
  else turns.push({who, text});
  if (turns.length > MAX_TURNS) turns.splice(0, turns.length - MAX_TURNS);
  return turns;
}
