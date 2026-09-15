import { StyleSheet, View, type DimensionValue } from 'react-native';
import { useTheme } from '@/theme/theme';
import { hitTarget, radius } from '@/theme/tokens';

/**
 * Скелетоны первой загрузки: форма будущего экрана вместо крутилки, чтобы
 * содержимое не прыгало при появлении. Без мерцания — анимация ради
 * ожидания не нужна и не должна спорить с «уменьшением движения».
 */

function Block({ width, height, round }: { width: DimensionValue; height: number; round?: number }) {
  const { colors } = useTheme();
  return <View style={{ width, height, borderRadius: round ?? 6, backgroundColor: colors.bg2 }} />;
}

const ROW_WIDTHS: DimensionValue[] = ['62%', '48%', '70%', '55%', '40%', '66%', '52%'];

/**
 * `inset` — свой горизонтальный отступ 16, как на вкладке «Чаты» и в
 * запросах на переписку, где список ничем больше не отделён от края экрана.
 * Экраны, где отступ уже даёт родитель (вкладка «Люди» — 20 через `.body`),
 * должны передавать `inset={false}`, иначе строки скелетона съезжают правее
 * строк настоящего контента (раунд оценки 005, дефект 5).
 */
export function ChatListSkeleton({ inset = true }: { inset?: boolean } = {}) {
  return (
    <View accessible accessibilityLabel="Загружаем беседы" accessibilityRole="progressbar">
      {ROW_WIDTHS.map((width, index) => (
        <View key={index} style={[styles.row, !inset && styles.rowNoInset]}>
          <Block width={52} height={52} round={16} />
          <View style={styles.rowBody}>
            <Block width={width} height={14} />
            <Block width="85%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const BUBBLES: { mine: boolean; width: DimensionValue; height: number }[] = [
  { mine: false, width: '58%', height: 56 },
  { mine: true, width: '44%', height: 40 },
  { mine: false, width: '70%', height: 76 },
  { mine: true, width: '52%', height: 56 },
  { mine: false, width: '36%', height: 40 },
];

export function MessagesSkeleton() {
  return (
    <View style={styles.messages} accessible accessibilityLabel="Загружаем сообщения" accessibilityRole="progressbar">
      {BUBBLES.map((bubble, index) => (
        <View key={index} style={{ alignItems: bubble.mine ? 'flex-end' : 'flex-start' }}>
          <Block width={bubble.width} height={bubble.height} round={radius.md} />
        </View>
      ))}
    </View>
  );
}

/** Карточка человека (`app/people/[id].tsx`): аватар, имя, подпись, блок формы. */
export function PersonCardSkeleton() {
  return (
    <View accessible accessibilityLabel="Загружаем карточку" accessibilityRole="progressbar" style={styles.person}>
      <View style={styles.personHeader}>
        <Block width={72} height={72} round={22} />
        <View style={styles.rowBody}>
          <Block width="60%" height={18} />
          <Block width="80%" height={14} />
          <Block width="45%" height={14} />
        </View>
      </View>
      <Block width="100%" height={140} round={radius.md} />
    </View>
  );
}

/** Строка «Запросов»: карточка выше и с местом под кнопки — не строка чата. */
export function RequestCardSkeleton() {
  return (
    <View accessible accessibilityLabel="Загружаем запросы" accessibilityRole="progressbar" style={styles.requestList}>
      {[0, 1, 2].map((key) => (
        <View key={key} style={styles.requestCard}>
          <View style={styles.personHeader}>
            <Block width={44} height={44} round={14} />
            <View style={styles.rowBody}>
              <Block width="55%" height={14} />
              <Block width="35%" height={12} />
            </View>
          </View>
          <Block width="100%" height={44} round={radius.sm} />
        </View>
      ))}
    </View>
  );
}

/**
 * Строка общины (`components/communities/community-badge-row.tsx`): аватар
 * 48dp, без подложки в отличие от строки беседы — та же форма, что у
 * настоящей строки, без своего горизонтального отступа (родитель — вкладка
 * «Общины» — уже даёт 20, см. дефект 5 раунда оценки 005 про несовпадение
 * скелетона со строками).
 */
export function CommunityListSkeleton() {
  return (
    <View accessible accessibilityLabel="Загружаем общины" accessibilityRole="progressbar" style={styles.communityList}>
      {ROW_WIDTHS.slice(0, 3).map((width, index) => (
        <View key={index} style={styles.communityRow}>
          <Block width={48} height={48} round={14} />
          <View style={styles.rowBody}>
            <Block width={width} height={14} />
            <Block width="50%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Строка каталога бесед общины (`components/chat/discover-item-row.tsx`):
 * аватар, две строки текста и место под кнопку «Открыть»/«Вступить» справа —
 * иначе скелетон предполагал бы строку без действия, а в контенте оно есть.
 */
export function DiscoverListSkeleton() {
  return (
    <View accessible accessibilityLabel="Загружаем беседы общины" accessibilityRole="progressbar" style={styles.communityList}>
      {ROW_WIDTHS.slice(0, 4).map((width, index) => (
        <View key={index} style={styles.discoverRow}>
          <Block width={48} height={48} round={14} />
          <View style={styles.rowBody}>
            <Block width={width} height={14} />
            <Block width="40%" height={12} />
          </View>
          <Block width={92} height={hitTarget} round={radius.sm} />
        </View>
      ))}
    </View>
  );
}

/**
 * Сетка карточек «Сервисы» (VED-174): та же двухколоночная раскладка, что
 * у настоящих карточек `components/services/service-card.tsx` — скелетон
 * строк выглядел бы списком, а контент — сеткой (тот же урок, что дал
 * дефект 5 в раунде оценки 005 про несовпадение формы скелетона и контента).
 */
export function ServiceGridSkeleton() {
  return (
    <View accessible accessibilityLabel="Загружаем сервисы" accessibilityRole="progressbar" style={styles.serviceGrid}>
      {[0, 1, 2, 3, 4, 5].map((key) => (
        <Block key={key} width="47%" height={hitTarget * 2} round={radius.md} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 76 },
  rowNoInset: { paddingHorizontal: 0 },
  rowBody: { flex: 1, gap: 8 },
  messages: { flex: 1, justifyContent: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 12 },
  person: { padding: 20, gap: 20 },
  personHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  requestList: { gap: 10 },
  requestCard: { borderRadius: radius.md, padding: 14, gap: 14 },
  communityList: { gap: 4 },
  communityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 64 },
  discoverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 68 },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
