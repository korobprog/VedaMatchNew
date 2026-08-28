import type {
  MusicPlaybackStateDto,
  MusicTrackDetailDto,
} from "@vedamatch/shared";
import { formatTrackDuration } from "./music-duration";

/**
 * Данные карточки быстрых действий Музыки на главной портала.
 * См. макет `.design/music/Main.dc.html` и docs/music-service-plan.md.
 *
 * Отдельный модуль от компонента по той же причине, что `union-quick-access`:
 * сборка данных — чистая логика, и ошибка в ней (отрицательный остаток,
 * доля больше ста) видна тестом, а не глазами на проде.
 */
export interface MusicQuickAccessResume {
  trackId: string;
  title: string;
  artistName: string | null;
  coverUrl: string | null;
  /**
   * Секунда, с которой продолжать. Кнопка пуска отдаёт её плееру: под
   * названием написано, сколько осталось, и начать с нуля значило бы
   * соврать подписью.
   */
  positionSeconds: number;
  /** Доля прослушанного, 0–100: ширина полоски под карточкой. */
  percent: number;
  /**
   * «осталось 4:12». `null`, когда длительность неизвестна или запись
   * дослушана до конца: «осталось 0:00» — это не подсказка, а мусор.
   */
  remainingLabel: string | null;
}

export interface MusicQuickAccessData {
  resume: MusicQuickAccessResume | null;
  favoritesCount: number;
}

export interface MusicQuickAccessInput {
  state: MusicPlaybackStateDto | null;
  /** Карточка записи из `state.trackId`; `null` — запись снята или не нашлась. */
  track: MusicTrackDetailDto | null;
  favoritesCount: number;
}

/**
 * `null` — карточку не рисуем вовсе. Пустой виджет с надписью «здесь пока
 * ничего» занимает место на самой посещаемой странице портала ради ничего;
 * та же логика у виджета Знакомств и у ленты друзей.
 */
export function buildMusicQuickAccess(
  input: MusicQuickAccessInput,
): MusicQuickAccessData | null {
  const resume = buildResume(input.state, input.track);
  const favoritesCount = Math.max(0, Math.trunc(input.favoritesCount));

  if (!resume && favoritesCount === 0) return null;
  return { resume, favoritesCount };
}

function buildResume(
  state: MusicPlaybackStateDto | null,
  track: MusicTrackDetailDto | null,
): MusicQuickAccessResume | null {
  if (!state?.trackId || !track) return null;
  // Состояние и карточка приезжают двумя запросами, и между ними человек мог
  // переключить запись на другом устройстве. Рассинхрон показывать нельзя:
  // обложка одной записи с названием другой хуже отсутствия карточки.
  if (state.trackId !== track.id) return null;

  const total = Math.max(0, track.durationSeconds);
  const position = clamp(state.positionSeconds, 0, total || Number.MAX_SAFE_INTEGER);
  const remaining = total > 0 ? total - position : 0;

  return {
    trackId: track.id,
    title: track.title,
    artistName: track.artist?.name ?? null,
    coverUrl: track.coverUrl,
    positionSeconds: Math.round(position),
    percent: total > 0 ? clamp((position / total) * 100, 0, 100) : 0,
    // Порог в секунду, а не строгий ноль: на последней секунде «осталось
    // 0:00» уже бессмысленно, а запись формально ещё не кончилась.
    remainingLabel:
      remaining >= 1 ? `осталось ${formatTrackDuration(remaining)}` : null,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
