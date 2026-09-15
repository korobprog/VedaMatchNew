import { StyleSheet, View, type DimensionValue } from 'react-native';
import { useTheme } from '@/theme/theme';
import { radius } from '@/theme/tokens';

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

export function ChatListSkeleton() {
  return (
    <View accessible accessibilityLabel="Загружаем беседы" accessibilityRole="progressbar">
      {ROW_WIDTHS.map((width, index) => (
        <View key={index} style={styles.row}>
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 76 },
  rowBody: { flex: 1, gap: 8 },
  messages: { flex: 1, justifyContent: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 12 },
  person: { padding: 20, gap: 20 },
  personHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
