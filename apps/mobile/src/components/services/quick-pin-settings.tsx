import type { ServiceCard } from '@vedamatch/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { QUICK_PIN_LIMIT, isPinned, pinnableServices } from '@/lib/services/quick-pins';
import { quickPinsStore, useQuickPins, type QuickPinsStore } from '@/lib/services/quick-pins-store';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Настройка панели быстрого доступа во вкладке «Сервисы» (VED-385).
 *
 * Свёрнута по умолчанию: вкладка — прежде всего каталог, а настраивают панель
 * редко. Свёрнутая карточка и есть «пустое состояние» панели: пока ничего не
 * закреплено, подсказка стоит здесь, и только здесь — на остальных вкладках
 * пустой полосы нет.
 *
 * Развёрнутая читается как сама панель: сначала закреплённые в их порядке,
 * потом остальные в порядке каталога (тот же приём, что в `QuickSettings` на
 * сайте) — иначе стрелки двигали бы вслепую. Порядок — стрелками «раньше» /
 * «позже», а не перетаскиванием: одной рукой жест на коротких строках
 * промахивается, и TalkBack стрелки читает без особых жестов
 * (`quick-pins.ts`, `movePin`).
 *
 * Пятый закреплён — остальные строки не выключаются, а на нажатие объясняют,
 * почему не выйдет: молча неработающий переключатель хуже слов.
 */
export function QuickPinSettings({
  services,
  store = quickPinsStore,
}: {
  services: readonly ServiceCard[];
  /** Подменяется только в тестах. */
  store?: QuickPinsStore;
}) {
  const { colors } = useTheme();
  const pins = useQuickPins(store);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const pinnable = pinnableServices(services);
  const bySlug = new Map(pinnable.map((card) => [card.slug, card]));
  const pinnedCards = pins.flatMap((pin) => bySlug.get(pin.slug) ?? []);
  const rest = pinnable.filter((card) => !isPinned(pins, card.slug));
  const full = pins.length >= QUICK_PIN_LIMIT;

  async function toggle(service: ServiceCard) {
    const outcome = await store.toggle(service);
    setNotice(
      outcome === 'full'
        ? `Сверху помещается ${QUICK_PIN_LIMIT} сервисов. Открепите один, чтобы закрепить «${service.name}».`
        : null,
    );
  }

  const summary =
    pins.length === 0
      ? `Закрепите до ${QUICK_PIN_LIMIT} сервисов — они встанут полосой сверху на всех вкладках.`
      : 'Полоса сверху на всех вкладках. В переписке, звонке и сканере её нет — там место занято делом.';

  return (
    <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
            Быстрый доступ
          </Text>
          <Text style={[styles.count, { color: colors.text1 }]}>
            {pins.length} из {QUICK_PIN_LIMIT}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={open ? 'Готово' : 'Настроить быстрый доступ'}
          onPress={() => {
            setOpen((value) => !value);
            setNotice(null);
          }}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.toggle, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
        >
          <Text style={[styles.toggleText, { color: colors.text0 }]}>{open ? 'Готово' : 'Настроить'}</Text>
        </Pressable>
      </View>

      <Text style={[styles.summary, { color: colors.text1 }]}>{summary}</Text>

      {open ? (
        <View style={styles.list}>
          {[...pinnedCards, ...rest].map((service) => {
            const on = isPinned(pins, service.slug);
            const index = pinnedCards.indexOf(service);
            const blocked = !on && full;
            return (
              <View key={service.slug} style={styles.row}>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`Закрепить сверху: ${service.name}`}
                  accessibilityHint={blocked ? 'Панель заполнена — сначала открепите другой сервис' : undefined}
                  onPress={() => void toggle(service)}
                  android_ripple={ripple(colors.glassBorder)}
                  style={({ pressed }) => [styles.switchRow, pressedStyle(pressed)]}
                >
                  <View
                    style={[
                      styles.box,
                      on
                        ? { backgroundColor: colors.magenta, borderColor: colors.magenta }
                        : { borderColor: colors.text1 },
                    ]}
                  >
                    {on ? <Text style={[styles.check, { color: colors.onAccent }]}>✓</Text> : null}
                  </View>
                  <Text numberOfLines={1} style={[styles.name, { color: blocked ? colors.text1 : colors.text0 }]}>
                    {service.name}
                  </Text>
                </Pressable>
                {on ? (
                  <>
                    <Arrow
                      glyph="↑"
                      label={`Раньше: ${service.name}`}
                      disabled={index === 0}
                      onPress={() => void store.move(service.slug, -1)}
                    />
                    <Arrow
                      glyph="↓"
                      label={`Позже: ${service.name}`}
                      disabled={index === pinnedCards.length - 1}
                      onPress={() => void store.move(service.slug, 1)}
                    />
                  </>
                ) : null}
              </View>
            );
          })}
          {pinnable.length === 0 ? (
            <Text style={[styles.summary, { color: colors.text1 }]}>Закрепить пока нечего.</Text>
          ) : null}
        </View>
      ) : null}

      {notice ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.notice, { color: colors.text0 }]}>
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Стрелка порядка. Крайняя выключена и приглушена прозрачностью: неактивный
 * элемент управления требование контраста 4.5:1 не распространяется (WCAG
 * 1.4.3), а подпись для TalkBack говорит «недоступно».
 */
function Arrow({
  glyph,
  label,
  disabled,
  onPress,
}: {
  glyph: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder, true)}
      style={({ pressed }) => [styles.arrow, disabled ? styles.arrowDisabled : null, pressedStyle(pressed)]}
    >
      <Text style={[styles.arrowGlyph, { color: colors.text0 }]}>{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: 16, gap: 8, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fonts.bodyBold, fontSize: 16 },
  count: { fontFamily: fonts.body, fontSize: 13 },
  toggle: {
    minHeight: hitTarget,
    minWidth: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  toggleText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  summary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  list: { gap: 2, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  switchRow: {
    flex: 1,
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  check: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 18 },
  name: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 15 },
  arrow: {
    minWidth: hitTarget,
    minHeight: hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  arrowDisabled: { opacity: 0.35 },
  arrowGlyph: { fontFamily: fonts.bodyBold, fontSize: 18 },
  notice: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
});
