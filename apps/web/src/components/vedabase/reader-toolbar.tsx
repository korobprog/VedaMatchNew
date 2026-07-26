export type ReaderTheme = "light" | "dark" | "sepia";
export type ReaderLineWidth = "narrow" | "medium" | "wide";

export interface ReaderPreferences {
  theme: ReaderTheme;
  fontSize: number;
  lineWidth: ReaderLineWidth;
}

export function ReaderToolbar({
  preferences,
  hasPrevious,
  hasNext,
  bookmarked,
  onPreferencesChange,
  onPrevious,
  onNext,
  onToggleBookmark,
  onOpenSearch,
}: {
  preferences: ReaderPreferences;
  hasPrevious: boolean;
  hasNext: boolean;
  bookmarked: boolean;
  onPreferencesChange(preferences: ReaderPreferences): void;
  onPrevious(): void;
  onNext(): void;
  onToggleBookmark(): void;
  onOpenSearch(): void;
}) {
  const fontSize = (amount: number) =>
    onPreferencesChange({
      ...preferences,
      fontSize: Math.min(26, Math.max(14, preferences.fontSize + amount)),
    });

  return (
    <div className="reader-surface flex flex-wrap items-center gap-2 rounded-2xl border p-3 shadow-sm">
      <button
        type="button"
        disabled={!hasPrevious}
        onClick={onPrevious}
        className="reader-hover rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-40"
      >
        Previous chapter
      </button>
      <button
        type="button"
        disabled={!hasNext}
        onClick={onNext}
        className="reader-hover rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-40"
      >
        Next chapter
      </button>
      <button
        type="button"
        onClick={onToggleBookmark}
        className="reader-accent reader-hover rounded-lg px-3 py-2 text-sm font-medium transition-colors"
      >
        {bookmarked ? "Remove bookmark" : "Add bookmark"}
      </button>
      <button
        type="button"
        onClick={onOpenSearch}
        className="reader-hover rounded-lg px-3 py-2 text-sm transition-colors"
      >
        Search downloaded books
      </button>
      <label className="ml-auto flex items-center gap-2 text-sm">
        Theme
        <select
          aria-label="Theme"
          value={preferences.theme}
          onChange={(event) =>
            onPreferencesChange({
              ...preferences,
              theme: event.target.value as ReaderTheme,
            })
          }
          className="reader-field rounded-lg border px-2 py-1"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="sepia">Sepia</option>
        </select>
      </label>
      <button
        type="button"
        aria-label="Decrease font size"
        onClick={() => fontSize(-1)}
        className="reader-hover rounded-lg px-2 py-1 transition-colors"
      >
        A−
      </button>
      <span className="min-w-10 text-center text-sm" aria-label="Font size">
        {preferences.fontSize}px
      </span>
      <button
        type="button"
        aria-label="Increase font size"
        onClick={() => fontSize(1)}
        className="reader-hover rounded-lg px-2 py-1 transition-colors"
      >
        A+
      </button>
      <label className="flex items-center gap-2 text-sm">
        Line width
        <select
          aria-label="Line width"
          value={preferences.lineWidth}
          onChange={(event) =>
            onPreferencesChange({
              ...preferences,
              lineWidth: event.target.value as ReaderLineWidth,
            })
          }
          className="reader-field rounded-lg border px-2 py-1"
        >
          <option value="narrow">Narrow</option>
          <option value="medium">Medium</option>
          <option value="wide">Wide</option>
        </select>
      </label>
    </div>
  );
}
