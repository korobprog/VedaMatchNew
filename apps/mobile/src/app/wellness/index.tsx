import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenBack } from '@/components/wellness/screen-back';
import { appCapabilities, appVariant } from '@/config/app-variant';
import { serviceUrl } from '@/config/services';
import {
  WELLNESS_SITE_SECTIONS,
  WELLNESS_TOOLS,
  type WellnessToolIcon,
} from '@/lib/wellness/wellness-tools';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Раздел «Здоровье» (VED-335, третий заход).
 *
 * Вход в сервис открывает раздел с ярлыками средств, а не сразу сканер:
 * сканер — одно из средств «Здоровья», и следующему нужно место рядом, а не
 * кнопка внутри чужого экрана. Список ярлыков — данные
 * (`lib/wellness/wellness-tools.ts`), добавить средство значит дописать
 * строку.
 *
 * Прямые ссылки на сканер и историю при этом не сломаны: это по-прежнему
 * самостоятельные маршруты, раздел просто встал перед ними.
 */
export default function WellnessSectionScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { webOrigin } = appVariant();
  const { siteServiceLinks } = appCapabilities();

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg0 }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
    >
      {/* Выход наверху, а не только системной кнопкой: экран открывают из
          каталога сервисов, и вернуться в него надо уметь пальцем. */}
      <ScreenBack />

      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
          Здоровье
        </Text>
        <Text style={[styles.subtitle, { color: colors.text1 }]}>
          Стоять у полки и разбирать мелкий шрифт не нужно.
        </Text>
      </View>

      {WELLNESS_TOOLS.map((tool) => (
        <Pressable
          key={tool.key}
          accessibilityRole="button"
          accessibilityLabel={`${tool.title}. ${tool.text}`}
          onPress={() => router.push(tool.route as never)}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [
            styles.tile,
            { backgroundColor: colors.glass, borderColor: colors.glassBorder },
            pressedStyle(pressed),
          ]}
        >
          <ToolIcon kind={tool.icon} color={colors.magenta} />
          <View style={styles.tileText}>
            <Text style={[styles.tileTitle, { color: colors.text0 }]}>{tool.title}</Text>
            <Text style={[styles.tileBody, { color: colors.text1 }]}>{tool.text}</Text>
          </View>
        </Pressable>
      ))}

      {siteServiceLinks ? (
        <View style={[styles.site, { backgroundColor: colors.bg1 }]}>
          <Text accessibilityRole="header" style={[styles.siteTitle, { color: colors.text0 }]}>
            Остальное — на сайте
          </Text>
          <Text style={[styles.tileBody, { color: colors.text1 }]}>
            Пока в приложении только сканер и история. Ограничения важны и для
            ответа сканера: без них вердикт считается по умолчанию портала.
          </Text>
          {WELLNESS_SITE_SECTIONS.map((section) => (
            <Pressable
              key={section.key}
              accessibilityRole="button"
              accessibilityHint="Откроется на сайте VedaMatch в браузере"
              onPress={() =>
                void WebBrowser.openBrowserAsync(serviceUrl(webOrigin, section.path))
              }
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [
                styles.siteLink,
                { borderColor: colors.glassBorder },
                pressedStyle(pressed),
              ]}
            >
              <Text style={[styles.siteLinkText, { color: colors.text0 }]}>
                {section.title}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

/**
 * Значки ярлыков. Рисуются своими путями, а не берутся из чужой библиотеки:
 * иконочного пакета в приложении нет, а тащить его ради двух значков —
 * лишняя зависимость. Декоративные: подпись рядом говорит то же самое.
 */
function ToolIcon({ kind, color }: { kind: WellnessToolIcon; color: string }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
      {kind === 'scan' ? (
        <>
          {/* Уголки рамки прицеливания и полоски штрихкода внутри. */}
          <Path
            d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Path d="M8 8v8M12 8v8M16 8v8" stroke={color} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : (
        <>
          {/* Часы со стрелкой назад — «что было раньше». */}
          <Path
            d="M12 21a9 9 0 1 0-9-9"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Path d="M3 3v5h5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M12 7v5l3 2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 12 },
  head: { gap: 6, marginBottom: 4 },
  title: { fontFamily: fonts.displayBold, fontSize: 24 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  tile: {
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 16,
    overflow: 'hidden',
  },
  tileText: { flex: 1, gap: 4 },
  tileTitle: { fontFamily: fonts.displayMedium, fontSize: 17 },
  tileBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  site: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 16,
    gap: 10,
    marginTop: 8,
  },
  siteTitle: { fontFamily: fonts.bodyBold, fontSize: 15 },
  siteLink: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  siteLinkText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
