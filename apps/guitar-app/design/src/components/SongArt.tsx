type SongArtProps = {
  title: string;
  artist: string;
  hasArt: boolean;
  artHue: number;
  size?: "sm" | "md" | "lg" | "cover";
  className?: string;
};

const SIZES = {
  sm: "h-12 w-12 text-sm rounded-2xl",
  md: "h-14 w-14 text-base rounded-2xl",
  lg: "h-28 w-28 text-3xl rounded-3xl",
  cover: "aspect-square w-full text-3xl rounded-[1.35rem]",
};

export function SongArt({
  title,
  artist,
  hasArt,
  artHue,
  size = "sm",
  className = "",
}: SongArtProps) {
  const initials = `${title[0] ?? ""}${artist[0] ?? ""}`.toUpperCase();
  const base = `${SIZES[size]} shrink-0 ${className}`;

  if (hasArt) {
    return (
      <div
        className={base}
        style={{
          background: `
            radial-gradient(circle at 30% 25%, hsl(${artHue} 90% 68% / 0.9), transparent 45%),
            linear-gradient(145deg, hsl(${artHue} 75% 48%), hsl(${(artHue + 50) % 360} 65% 28%))
          `,
        }}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={`${base} grid place-items-center border border-border bg-accent-soft font-bold text-accent`}
      aria-hidden
    >
      {initials}
    </div>
  );
}
