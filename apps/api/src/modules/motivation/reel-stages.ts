import type { MotivationReelStage } from '@vedamatch/shared';

/**
 * Стадия рилса глазами автора — из полей поста. Отдельного состояния у рилса
 * нет: мастер читает пост, а конвейер (ИИ-модератор, воркер картинки, админ)
 * двигает его теми же статусами, что и редакционные посты.
 */
export function reelStageOf(post: {
  status: string;
  reviewStatus: string;
  generationStage: string | null;
}): MotivationReelStage {
  if (post.status === 'published' || post.reviewStatus === 'published')
    return 'published';
  switch (post.reviewStatus) {
    case 'rejected':
      return 'rejected';
    case 'failed':
      return 'failed';
    case 'image_review':
      return 'image_review';
    case 'image_queued':
      return 'generating';
    case 'text_review':
      // Пока ИИ не высказался — «проверка»; после эскалации ждём человека.
      return post.generationStage === 'ai_escalated' ||
        post.generationStage === 'ai_suggested'
        ? 'admin_review'
        : 'ai_review';
    default:
      return 'ai_review';
  }
}

/** Обжаловать можно только отказ, и только пока обращения ещё не было. */
export function canAppeal(
  stage: MotivationReelStage,
  hasAppeal: boolean,
): boolean {
  return stage === 'rejected' && !hasAppeal;
}

/** Начало суток в UTC: лимит «рилсов в день» считается по календарному дню. */
export function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
