import type {
  MusicReportKind,
  MusicTrackStatus,
  MusicUploadRightsBasis,
} from '@vedamatch/shared';

/**
 * Кто попадает в каталог сразу, а кто через проверку.
 *
 * Прежде проверку проходило всё, и каталог стоял: наполнять его мог только
 * человек, готовый прослушать каждую запись. Развилка идёт по основанию
 * прав — по тому единственному полю, которое загружающий и так обязан
 * заполнить осознанно.
 *
 * Своя запись и свободно распространяемая идут в каталог сразу: риск на
 * том, кто её принёс, и он невелик. Запись с открытой программы — чужое
 * исполнение, и отвечать за неё будет портал; она ждёт проверки.
 *
 * Постмодерация «для всего подряд» здесь не работает не из осторожности:
 * правообладатель находит свой концерт в открытом каталоге быстрее, чем
 * трое случайных людей нажмут «пожаловаться».
 */
export function initialStatusFor(
  basis: MusicUploadRightsBasis,
): Extract<MusicTrackStatus, 'published' | 'pending'> {
  return basis === 'open_program' ? 'pending' : 'published';
}

/**
 * Сколько открытых жалоб скрывают запись.
 *
 * Копия приёма из market/report-threshold.ts — контракт сервисного модуля
 * запрещает импортировать хелперы чужого сервиса. Три обычные жалобы: одной
 * мало (ею легко свести счёты), десяти на небольшой площадке не наберётся.
 *
 * Копирайт — исключение: он скрывает запись с первой же претензии. Здесь
 * молчание опаснее ошибки, а скрытие обратимо.
 */
export const MUSIC_REPORT_HIDE_THRESHOLD = 3;
export const MUSIC_COPYRIGHT_HIDE_THRESHOLD = 1;

export function hideThresholdFor(kind: MusicReportKind): number {
  return kind === 'copyright'
    ? MUSIC_COPYRIGHT_HIDE_THRESHOLD
    : MUSIC_REPORT_HIDE_THRESHOLD;
}

/**
 * Пересекла ли жалоба порог **именно сейчас**.
 *
 * Ключевое здесь — «именно сейчас»: проверка `count >= threshold`
 * срабатывала бы на каждой следующей жалобе, и запись пряталась бы снова
 * после того, как админ её вернул. Поэтому сравниваем ровно с порогом.
 * Та же тонкость, что у Рынка, и найдена она была там же.
 */
export function crossesHideThreshold(
  openReportsAfter: number,
  kind: MusicReportKind,
): boolean {
  return openReportsAfter === hideThresholdFor(kind);
}

/**
 * Сколько у редакции есть времени на решение по скрытой записи.
 *
 * Неделя — не срок исполнения, а признак того, что разбирать её никто не
 * будет. По его истечении запись не удаляется: она остаётся скрытой и
 * возвращается автору с честной причиной. Удалять чужой файл за то, что
 * админ не подошёл, нельзя — наказан оказался бы не тот, а три аккаунта
 * превратились бы в кнопку «удалить чужое».
 */
export const MUSIC_REVIEW_DEADLINE_DAYS = 7;

export function isReviewOverdue(
  escalatedAt: Date,
  now: Date,
  deadlineDays: number = MUSIC_REVIEW_DEADLINE_DAYS,
): boolean {
  const limit = deadlineDays * 24 * 60 * 60 * 1000;
  return now.getTime() - escalatedAt.getTime() >= limit;
}

/** Что видит автор, когда решения так и не было. */
export const MUSIC_REVIEW_EXPIRED_NOTE =
  'За неделю жалобы никто не разобрал. Запись убрана из каталога и вернулась вам: файл на месте, место в квоте занято. Снимите её или напишите в поддержку, если считаете жалобы несправедливыми.';
