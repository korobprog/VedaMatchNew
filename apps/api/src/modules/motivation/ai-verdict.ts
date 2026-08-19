/**
 * Чистая логика ИИ-модерации пользовательских рилсов: промпт, разбор ответа
 * модели и превращение «что сказала модель» в решение по порогам. Сетевой
 * вызов и запись в аудит живут в `MotivationAiModeratorService`.
 */

export type AiDecision = 'approve' | 'reject' | 'escalate';

export interface AiVerdict {
  /** Что предлагает модель. */
  decision: AiDecision;
  /** Уверенность 0..1 в своём предложении. */
  confidence: number;
  /** Краткие флаги: `politics`, `advertising`, `off_track`, `tone`… */
  flags: string[];
  /** Причина для человека, на его языке; пусто при одобрении. */
  reason: string;
}

export interface AiThresholds {
  approve: number;
  reject: number;
}

export interface ModerationPromptInput {
  text: string;
  explanation: string;
  author: string | null;
  work: string | null;
  locator: string | null;
  sourceVerified: boolean;
  audienceTrack: 'universal' | 'vaishnava';
  language: string;
  editorialRules: string;
}

export const DEFAULT_REJECT_REASON =
  'Текст не подходит для ленты мотивации. Попробуйте переформулировать мысль или выбрать цитату из Библиотеки.';

const DECISIONS = new Set<string>(['approve', 'reject', 'escalate']);
const MAX_REASON = 400;
const MAX_FLAGS = 8;

/**
 * Разбор JSON от модели. Всё, что не похоже на вердикт, — `null`: вызывающий
 * эскалирует к человеку, а не гадает.
 */
export function parseAiVerdict(raw: unknown): AiVerdict | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const decision =
    typeof value.decision === 'string'
      ? value.decision.trim().toLowerCase()
      : '';
  const confidence = Number(value.confidence);
  if (!DECISIONS.has(decision) || !Number.isFinite(confidence)) return null;
  const flags = Array.isArray(value.flags)
    ? value.flags
        .filter((flag): flag is string => typeof flag === 'string')
        .map((flag) => flag.trim().toLowerCase().slice(0, 40))
        .filter(Boolean)
        .slice(0, MAX_FLAGS)
    : [];
  const reason =
    typeof value.reason === 'string'
      ? value.reason.trim().slice(0, MAX_REASON)
      : '';
  return {
    decision: decision as AiDecision,
    confidence: Math.max(0, Math.min(1, confidence)),
    flags,
    reason,
  };
}

/**
 * Решение по порогам. Модель может предлагать что угодно, но автономно
 * исполняется только уверенное: одобрение от `approve`, отказ от `reject`,
 * всё остальное — эскалация к админу. Отказ с низкой уверенностью тоже
 * эскалируется: лучше подождать человека, чем обидеть автора зря.
 */
export function resolveDecision(
  verdict: Pick<AiVerdict, 'decision' | 'confidence'>,
  thresholds: AiThresholds,
): AiDecision {
  if (
    verdict.decision === 'approve' &&
    verdict.confidence >= thresholds.approve
  )
    return 'approve';
  if (verdict.decision === 'reject' && verdict.confidence >= thresholds.reject)
    return 'reject';
  return 'escalate';
}

/** Причина для автора: текст модели либо запасной, если модель промолчала. */
export function reasonForUser(verdict: AiVerdict): string {
  return verdict.reason || DEFAULT_REJECT_REASON;
}

export function buildModerationPrompt(input: ModerationPromptInput): string {
  const track =
    input.audienceTrack === 'vaishnava'
      ? 'вайшнавская мудрость (бхакти, писания, ачарьи)'
      : 'мудрость мира (универсальная духовная мудрость)';
  const source = input.sourceVerified
    ? `Источник проверен: ${[input.author, input.work, input.locator].filter(Boolean).join(', ')}.`
    : input.author
      ? `Автор указан пользователем (не проверен): ${input.author}.`
      : 'Источник не указан: это собственная мысль пользователя.';
  const rules = input.editorialRules.trim()
    ? `\nПравила редакции (обязательны):\n${input.editorialRules.trim()}\n`
    : '';
  return [
    'Ты модератор ленты духовной мотивации VedaMatch. Пользователь хочет опубликовать рилс с текстом ниже.',
    `Трек ленты: ${track}. Язык: ${input.language}. ${source}`,
    'Отклоняй: рекламу и ссылки, политику и живых публичных лиц, оскорбления, сексуальное и насилие, призывы к бездействию или вреду, сарказм, текст без смысла, чужие бренды. Одобряй: цитаты писаний и учителей, искренние духовные размышления, поддержку и вдохновение. Если сомневаешься — escalate.',
    rules,
    `Текст:\n"""${input.text.trim()}"""`,
    input.explanation.trim()
      ? `Пояснение автора:\n"""${input.explanation.trim()}"""`
      : '',
    'Ответь строго JSON без пояснений: {"decision":"approve|reject|escalate","confidence":0..1,"flags":["..."],"reason":"одно-два предложения для автора на его языке, доброжелательно, пусто при approve"}',
  ]
    .filter(Boolean)
    .join('\n\n');
}
