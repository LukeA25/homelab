/** ASCII guitar tab string line, e.g. e|--------| or B|----3---| */
const TAB_LINE_RE =
  /^[eEbBgGdDaA]\s*\|[\s\-0-9|xXhHpPbBrRsStT\/\\.+=~]+$/;

export function isAsciiTabLine(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  return TAB_LINE_RE.test(t);
}
