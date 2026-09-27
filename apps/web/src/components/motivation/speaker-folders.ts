import {
  MOTIVATION_SPEAKER_FOLDERS,
  type MotivationAttributionOptionDto,
  type MotivationSpeakerFolder,
} from "@vedamatch/shared";
import { sameAttribution } from "./attribution-filter";

/**
 * Папки авторов в фильтре ленты (VED-584): «Мудрость мира» и «Веды» стоят
 * там же, где сами авторы, — над теми, кого администратор ещё никуда не
 * убрал. Чистая часть: раскладка списка; окно только рисует.
 */

export interface SpeakerFolderGroup {
  id: MotivationSpeakerFolder;
  label: string;
  options: MotivationAttributionOptionDto[];
  /** Сколько афоризмов у авторов папки — число справа, как у автора. */
  count: number;
  /** В папке выбранный автор: её надо показать раскрытой. */
  containsCurrent: boolean;
}

/**
 * Разложить авторов по папкам. Порядок внутри папки — тот же, что прислал
 * сервер (по числу афоризмов). Пустая папка не показывается: в ней нечего
 * выбрать. `overrides` — только что сделанные правки администратора, до
 * нового ответа сервера.
 */
export function groupSpeakersByFolder(
  options: readonly MotivationAttributionOptionDto[],
  current?: string,
  overrides: Readonly<Record<string, MotivationSpeakerFolder | null>> = {},
): { folders: SpeakerFolderGroup[]; loose: MotivationAttributionOptionDto[] } {
  const folderOf = (option: MotivationAttributionOptionDto) =>
    option.label in overrides
      ? overrides[option.label]
      : (option.folder ?? null);
  const folders = MOTIVATION_SPEAKER_FOLDERS.map(({ id, label }) => {
    const inFolder = options
      .filter((option) => folderOf(option) === id)
      .map((option) => ({ ...option, folder: id }));
    return {
      id,
      label,
      options: inFolder,
      count: inFolder.reduce((sum, option) => sum + option.count, 0),
      containsCurrent: inFolder.some((option) =>
        sameAttribution(option.label, current),
      ),
    };
  }).filter((folder) => folder.options.length > 0);
  const loose = options
    .filter((option) => folderOf(option) === null)
    .map((option) => ({ ...option, folder: null }));
  return { folders, loose };
}
