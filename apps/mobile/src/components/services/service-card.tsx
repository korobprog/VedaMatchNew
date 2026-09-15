import type { ServiceCard as ServiceCardDto } from '@vedamatch/shared';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

interface Props {
  service: ServiceCardDto;
  onPress(service: ServiceCardDto): void;
}

/**
 * Карточка каталога сервисов (VED-174): только название и описание, без
 * значка. `iconUrl` у всех сервисов в базе сейчас `null` (проверено по
 * `apps/api/prisma/seed.cjs` — поле правит только администратор из
 * админки), а копировать набор SVG-иконок `ServiceIcon` с сайта под 12
 * разных `slug` без общего кода между приложениями противоречит контракту
 * сервисного модуля (общие хелперы не импортируются между приложениями) и
 * не стоит цены новой сетки ради значков, которых на проде ещё нет —
 * поэтому решение сознательно в пользу чистых текстовых карточек.
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
        <Text style={[styles.badge, { color: colors.text1, backgroundColor: colors.bg2 }]}>Скоро</Text>
        <Text style={[styles.title, { color: colors.text0 }]}>{service.name}</Text>
        <Text numberOfLines={2} style={[styles.description, { color: colors.text1 }]}>
          {service.description}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={service.name}
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
      <Text numberOfLines={2} style={[styles.description, { color: colors.text1 }]}>
        {service.description}
      </Text>
    </Pressable>
  );
}

export const ServiceCard = memo(ServiceCardImpl);

const styles = StyleSheet.create({
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: hitTarget * 2,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 16,
    justifyContent: 'flex-end',
    gap: 4,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 16 },
  description: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
});
