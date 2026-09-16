import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text } from 'react-native';
import { appVariant } from '@/config/app-variant';
import { serviceUrl } from '@/config/services';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { Screen } from './screen';

interface Props {
  title: string;
  /** Что появится в приложении и что пока доступно на сайте. */
  subtitle: string;
  /** Раздел сайта, где это уже работает. */
  path: string;
  /** Скрытое действие на долгое нажатие заголовка (служебные экраны). */
  onTitleLongPress?: () => void;
}

/**
 * Вкладка, чей нативный экран ещё не готов. Пустой экран без действия —
 * тупик, поэтому ведёт туда, где раздел уже работает.
 */
export function SitePlaceholder({ title, subtitle, path, onTitleLongPress }: Props) {
  const { colors } = useTheme();
  const { webOrigin } = appVariant();

  return (
    <Screen title={title} subtitle={subtitle} onTitleLongPress={onTitleLongPress}>
      <Pressable
        accessibilityRole="link"
        accessibilityHint="Открывает раздел на сайте в браузере"
        onPress={() => WebBrowser.openBrowserAsync(serviceUrl(webOrigin, path))}
        android_ripple={ripple(colors.glassBorder)}
        style={({ pressed }) => [
          styles.button,
          { borderColor: colors.glassBorder, backgroundColor: colors.glass },
          pressedStyle(pressed),
        ]}
      >
        <Text style={[styles.buttonText, { color: colors.text0 }]}>Открыть на сайте</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 20,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
});
