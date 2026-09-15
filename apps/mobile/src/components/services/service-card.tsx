import type { ServiceCard as ServiceCardDto } from '@vedamatch/shared';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { serviceIconKind } from '@/lib/services/service-icon-kind';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, radius } from '@/theme/tokens';
import { ServiceIcon } from './service-icons';

interface Props {
  service: ServiceCardDto;
  onPress(service: ServiceCardDto): void;
}

/** Размер иллюстрации над названием — как в подробном режиме на сайте. */
const ICON_SIZE = 32;

/**
 * Высота карточки — общая константа со скелетоном `ServiceGridSkeleton`
 * (раунд оценки 007, дефект 8: скелетон и настоящая карточка расходились по
 * высоте после первой загрузки). Без `numberOfLines` у описания карточка
 * может стать выше этого значения на длинных текстах — это пол, не потолок;
 * иконка 32dp сверху увеличивает пол по сравнению с чисто текстовой
 * версией карточки (было 108, стало 144 — плюс иконка и отступ до неё).
 */
export const SERVICE_CARD_MIN_HEIGHT = 144;

/**
 * Карточка каталога сервисов (VED-174, «Иконки»): иллюстрация
 * `components/services/service-icons.tsx` над названием, порт
 * `ServiceIcon` с сайта (`apps/web/src/components/icons/service-icons.tsx`,
 * размещение — как в `apps/web/src/components/service-card.tsx` в
 * подробном режиме). `iconUrl` у всех сервисов в базе сейчас `null`
 * (проверено по `apps/api/prisma/seed.cjs`), поэтому источник картинки —
 * не поле из API, а `serviceIconKind(service.slug, service.category)`, тот
 * же выбор, что и на сайте.
 *
 * Иконка декоративная: `accessible={false}` и
 * `importantForAccessibility="no-hide-descendants"` на обёртке — TalkBack
 * читает только `accessibilityLabel` карточки с названием и описанием, а
 * не проваливается в SVG.
 *
 * Описание рисуется без `numberOfLines`: с ограничением в 2 строки текст
 * почти везде обрезался на полуслове (раунд оценки 007, дефект 5) — на
 * колонке 179dp двух строк не хватает даже коротким описаниям с сервера.
 */
function ServiceCardImpl({ service, onPress }: Props) {
  const { colors } = useTheme();
  const comingSoon = service.status === 'coming_soon';
  const iconKind = serviceIconKind(service.slug, service.category);

  const icon = (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.iconWrap}>
      <ServiceIcon kind={iconKind} size={ICON_SIZE} />
    </View>
  );

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
        {icon}
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
      {icon}
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
  iconWrap: { marginBottom: 2 },
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
