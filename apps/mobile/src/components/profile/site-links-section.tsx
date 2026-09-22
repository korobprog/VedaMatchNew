import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { InlineError } from '@/components/inline-error';
import { appVariant } from '@/config/app-variant';
import { PROFILE_SITE_LINKS, profileSiteUrl, type ProfileSiteLink } from '@/lib/profile/profile-site-links';
import { openWebPortal } from '@/lib/web-portal';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * «Правится на сайте» — честный хвост экрана профиля.
 *
 * Раньше это была плашка текстом: она перечисляла часть потерь и никуда не
 * вела. Человек читал, что город правят на сайте, и оставался с этим один на
 * один; про этап пути и духовную линию не было сказано вовсе, хотя пройти
 * анкету знакомства заново из приложения нельзя (раунд оценки 001, дефект 4).
 *
 * Открывается вкладкой внутри приложения, с запасным системным браузером и
 * честным текстом с адресом, если браузера нет вовсе, — тем же
 * `openWebPortal`, что и кнопка «Открыть сайт» на экранах входа.
 */
export function ProfileSiteLinksSection() {
  const { colors } = useTheme();
  const { webOrigin } = appVariant();
  const [error, setError] = useState<string | null>(null);

  async function open(link: ProfileSiteLink) {
    setError(null);
    const result = await openWebPortal(profileSiteUrl(webOrigin, link), {
      openBrowser: (url) => WebBrowser.openBrowserAsync(url),
      openLink: (url) => Linking.openURL(url),
    });
    if (result.kind === 'failed') setError(result.message);
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
        Правится на сайте
      </Text>
      {PROFILE_SITE_LINKS.map((link) => (
        <View key={link.id} style={styles.row}>
          <Text style={[styles.description, { color: colors.text1 }]}>{link.description}</Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={link.label}
            accessibilityHint="Откроется в браузере"
            onPress={() => void open(link)}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.button,
              { borderColor: colors.glassBorder, backgroundColor: colors.bg1 },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.text0 }]}>{link.label}</Text>
          </Pressable>
        </View>
      ))}
      {error ? <InlineError message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: 14, gap: 14 },
  title: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  row: { gap: 8 },
  description: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  button: {
    alignSelf: 'flex-start',
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
});
