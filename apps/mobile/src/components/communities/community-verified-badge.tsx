import { VerifiedDot } from '@/components/verified-badge';

interface Props {
  /**
   * Значок внутри строки, чья подпись уже включает «, подтверждена» — тогда
   * он не должен фокусироваться отдельным шагом скринридера (раунд оценки
   * 006, дефект 6).
   */
  decorative?: boolean;
}

/**
 * Значок подтверждённой общины — тот же кружок `cyan` с галочкой, что у
 * значка «Преданный подтверждён» (`components/verified-badge.tsx`), через
 * общий `VerifiedDot`, но со своей подписью: сущности разные, подпись
 * значка человека сюда не подходит по смыслу. Дублировать контур иконки
 * здесь больше не нужно (раунд оценки 006, дефект 8).
 */
export function CommunityVerifiedBadge({ decorative = false }: Props) {
  return <VerifiedDot label="Община подтверждена администрацией" decorative={decorative} />;
}
