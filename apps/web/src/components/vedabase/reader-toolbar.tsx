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
        Предыдущая глава
      </button>
      <button
        type="button"
        disabled={!hasNext}
        onClick={onNext}
        className="reader-hover rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-40"
      >
        Следующая глава
      </button>
      <button
        type="button"
        onClick={onToggleBookmark}
        className="reader-accent reader-hover rounded-lg px-3 py-2 text-sm font-medium transition-colors"
      >
        {bookmarked ? "Убрать закладку" : "Добавить закладку"}
      </button>
      <button
        type="button"
        onClick={onOpenSearch}
        className="reader-hover rounded-lg px-3 py-2 text-sm transition-colors"
      >
        Поиск по скачанным книгам
      </button>
      <label className="ml-auto flex items-center gap-2 text-sm">
        Тема
        <select
          aria-label="Тема"
          value={preferences.theme}
          onChange={(event) =>
            onPreferencesChange({
              ...preferences,
              theme: event.target.value as ReaderTheme,
            })
          }
          className="reader-field rounded-lg border px-2 py-1"
        >
          <option value="light">Светлая</option>
          <option value="dark">Тёмная</option>
          <option value="sepia">Сепия</option>
        </select>
      </label>
      <button
        type="button"
        aria-label="Уменьшить шрифт"
        onClick={() => fontSize(-1)}
        className="reader-hover rounded-lg px-2 py-1 transition-colors"
      >
        A−
      </button>
      <span className="min-w-10 text-center text-sm" aria-label="Размер шрифта">
        {preferences.fontSize}px
      </span>
      <button
        type="button"
        aria-label="Увеличить шрифт"
        onClick={() => fontSize(1)}
        className="reader-hover rounded-lg px-2 py-1 transition-colors"
      >
        A+
      </button>
      <label className="flex items-center gap-2 text-sm">
        Ширина строки
        <select
          aria-label="Ширина строки"
          value={preferences.lineWidth}
          onChange={(event) =>
            onPreferencesChange({
              ...preferences,
              lineWidth: event.target.value as ReaderLineWidth,
            })
          }
          className="reader-field rounded-lg border px-2 py-1"
        >
          <option value="narrow">Узкая</option>
          <option value="medium">Средняя</option>
          <option value="wide">Широкая</option>
        </select>
      </label>
    </div>
  );
}
