import { Music2 } from "lucide-react";
import { Page, PageHeader } from "./Page";

export function AddScreen() {
  return (
    <Page>
      <PageHeader
        eyebrow="Add song"
        title="New entry"
        description="Design stub — Apple Music import and ChordPro paste come later."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Title</span>
              <input
                className="glass w-full rounded-card px-4 py-3 text-sm outline-none focus:border-accent"
                placeholder="Song title"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Artist</span>
              <input
                className="glass w-full rounded-card px-4 py-3 text-sm outline-none focus:border-accent"
                placeholder="Artist"
              />
            </label>
          </div>
          <label className="block sm:max-w-xs">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Style</span>
            <select className="glass w-full appearance-none rounded-card px-4 py-3 text-sm outline-none">
              <option>Fingerpicking</option>
              <option>Chords</option>
              <option>Mix</option>
            </select>
          </label>
          <label className="block sm:max-w-xs">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">BPM</span>
            <input
              type="number"
              min={40}
              max={220}
              defaultValue={90}
              className="glass w-full rounded-card px-4 py-3 text-sm outline-none focus:border-accent"
              placeholder="90"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">
              Chords / ChordPro
            </span>
            <textarea
              rows={10}
              className="glass w-full rounded-card px-4 py-3 font-mono text-sm outline-none focus:border-accent"
              placeholder={"{title: Song}\n[Am]Lyrics with [G]chords"}
            />
          </label>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <button
              type="button"
              className="btn-accent flex flex-1 items-center justify-center gap-2 rounded-pill py-3.5 text-sm shadow-glow"
            >
              <Music2 className="h-4 w-4" />
              Save to library
            </button>
            <button
              type="button"
              className="flex-1 rounded-pill border border-border bg-surface py-3.5 text-sm text-muted"
            >
              Import from Apple Music (soon)
            </button>
          </div>
        </div>

        <aside className="panel hidden rounded-panel p-6 lg:block">
          <h2 className="text-lg font-semibold">Coming next</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>Pick a track from Apple Music for title, artist, artwork</li>
            <li>Paste or edit ChordPro yourself</li>
            <li>Optional lyrics — chords stay in your control</li>
          </ul>
        </aside>
      </div>
    </Page>
  );
}
