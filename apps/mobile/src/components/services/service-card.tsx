import type { ServiceCard as ServiceCardDto } from '@vedamatch/shared';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, radius } from '@/theme/tokens';

interface Props {
  service: ServiceCardDto;
  onPress(service: ServiceCardDto): void;
}

/**
 * Высота карточки — общая константа со скелетоном `ServiceGridSkeleton`
 * (раунд оценки 007, дефект 8: скелетон был 88dp, настоящая карточка с
 * описанием на 2 строки — 101dp, разница бросалась в глаза при переходе от
 * загрузки к списку). Без `numberOfLines` карточка может стать выше этого
 * значения на длинных описаниях — это пол, не потолок.
 */
export const SERVICE_CARD_MIN_HEIGHT = 108;

/**
 * Карточка каталога сервисов (VED-174): только название и описание, без
 * значка. `iconUrl` у всех сервисов в базе сейчас `null` (проверено по
 * `apps/api/prisma/seed.cjs` — поле правит только администратор из
 * админки), а копировать набор SVG-иконок `ServiceIcon` с сайта под 12
 * разных `slug` без общего кода между приложениями противоречит контракту
 * сервисного модуля (общие хелперы не импортируются между приложениями) и
 * не стоит цены новой сетки ради значков, которых на проде ещё нет —
 * поэтому решение сознательно в пользу чистых текстовых карточек.
 *
 * Описание рисуется без `numberOfLines`: с ограничением в 2 строки текст
 * почти везде обрезался на полуслове (раунд оценки 007, дефект 5) — на
 * колонке 179dp двух строк не хватает даже коротким описаниям с сервера.
 */
function ServiceCardImpl({ service, onPress }: Props) {
  const { colors } = useTheme();
  const comingSoon = service.status === 'coming_soon';

  if (comingSoon) {
    return (
      <View
        accessible
        accessibilityLabel={`${service.name}. Скоро. ${service.description}`}
        style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
      >
        {/* Бейдж в потоке над названием, а не `position: absolute` — иначе
            длинное название уходит под него, если карточка выше минимума
            (раунд оценки 007, дефект 6). */}
        <Text style={[styles.badge, { color: colors.text1, backgroundColor: colors.bg2 }]}>Скоро</Text>
        <Text style={[styles.title, { color: colors.text0 }]}>{service.name}</Text>
        <Text style={[styles.description, { color: colors.text1 }]}>{service.description}</Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${service.name}. ${service.description}`}
      accessibilityHint="Открывает раздел на сайте в браузере"
      onPress={() => onPress(service)}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.glass, borderColor: colors.glassBorder },
        pressedStyle(pressed),
      ]}
    >
      <Text style={[styles.title, { color: colors.text0 }]}>{service.name}</Text>
      <Text style={[styles.description, { color: colors.text1 }]}>{service.description}</Text>
    </Pressable>
  );
}

export const ServiceCard = memo(ServiceCardImpl);

const styles = StyleSheet.create({
  card: {
    flexBasis: '47%',
    // Не растягивать одинокую нечётную карточку на всю ширину строки
    // (раунд оценки 007, дефект 4: «Рынок» при 11 сервисах занимал весь ряд).
    flexGrow: 0,
    minHeight: SERVICE_CARD_MIN_HEIGHT,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 16,
    justifyContent: 'flex-end',
    gap: 4,
    overflow: 'hidden',
  },
  badge: {
    alignSelf: 'flex-start',
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 2,
    overflow: 'hidden',
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 16 },
  description: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
});
