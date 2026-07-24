type ChordDiagramProps = {
  label: string;
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres?: number[];
  className?: string;
};

/** SVG guitar chord diagram (UG-style). frets: low E → high e, -1 muted, 0 open. */
export function ChordDiagram({
  label,
  frets,
  fingers,
  baseFret,
  barres = [],
  className = "",
}: ChordDiagramProps) {
  const strings = 6;
  const fretCount = 4;
  const w = 80;
  const h = 96;
  const left = 14;
  const right = 14;
  const top = 22;
  const bottom = 12;
  const gridW = w - left - right;
  const gridH = h - top - bottom;
  const stringX = (i: number) => left + (i / (strings - 1)) * gridW;
  const fretY = (f: number) => top + (f / fretCount) * gridH;

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      <p className="mb-0.5 text-center text-xs font-bold text-text">{label}</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-20 text-text" aria-hidden>
        {/* Nut or base fret label */}
        {baseFret > 1 ? (
          <text x={2} y={top + gridH / fretCount / 2 + 3} className="fill-muted text-[8px]">
            {baseFret}
          </text>
        ) : (
          <line
            x1={left}
            y1={top}
            x2={left + gridW}
            y2={top}
            stroke="currentColor"
            strokeWidth={3}
          />
        )}

        {/* Frets */}
        {Array.from({ length: fretCount + 1 }, (_, f) => (
          <line
            key={`f-${f}`}
            x1={left}
            y1={fretY(f)}
            x2={left + gridW}
            y2={fretY(f)}
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.7}
          />
        ))}

        {/* Strings */}
        {Array.from({ length: strings }, (_, s) => (
          <line
            key={`s-${s}`}
            x1={stringX(s)}
            y1={top}
            x2={stringX(s)}
            y2={top + gridH}
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.7}
          />
        ))}

        {/* Open / mute markers */}
        {frets.map((fret, s) => {
          const x = stringX(s);
          if (fret === -1) {
            return (
              <text
                key={`m-${s}`}
                x={x}
                y={top - 6}
                textAnchor="middle"
                className="fill-muted text-[9px]"
              >
                ×
              </text>
            );
          }
          if (fret === 0) {
            return (
              <circle
                key={`o-${s}`}
                cx={x}
                cy={top - 8}
                r={3.2}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.2}
              />
            );
          }
          return null;
        })}

        {/* Barres */}
        {barres.map((barreFret) => {
          const y = fretY(barreFret - 0.5);
          const pressed = frets
            .map((f, i) => ({ f, i }))
            .filter(({ f }) => f === barreFret);
          if (pressed.length < 2) return null;
          const x1 = stringX(pressed[0].i);
          const x2 = stringX(pressed[pressed.length - 1].i);
          return (
            <rect
              key={`b-${barreFret}`}
              x={Math.min(x1, x2) - 4}
              y={y - 4}
              width={Math.abs(x2 - x1) + 8}
              height={8}
              rx={4}
              className="fill-text"
            />
          );
        })}

        {/* Finger dots */}
        {frets.map((fret, s) => {
          if (fret <= 0) return null;
          const x = stringX(s);
          const y = fretY(fret - 0.5);
          const finger = fingers[s] || 0;
          return (
            <g key={`d-${s}`}>
              <circle cx={x} cy={y} r={5.5} className="fill-text" />
              {finger > 0 && (
                <text
                  x={x}
                  y={y + 2.5}
                  textAnchor="middle"
                  style={{ fill: "var(--bg)", fontSize: 8, fontWeight: 700 }}
                >
                  {finger}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
