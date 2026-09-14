import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/screen';
import { appVariant } from '@/config/app-variant';
import { useSession } from '@/lib/auth/session';
import { SERVICE_LINKS, serviceUrl } from '@/config/services';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

export default function ServicesScreen() {
  const { colors } = useTheme();
  const { webOrigin } = appVariant();
  const { user, signOut } = useSession();

  return (
    <Screen title="Сервисы" subtitle="Открываются на сайте VedaMatch в браузере.">
      <View style={styles.grid}>
        {SERVICE_LINKS.map((link) => (
          <Pressable
            key={link.key}
            accessibilityRole="link"
            accessibilityHint="Открывает раздел на сайте"
            onPress={() => WebBrowser.openBrowserAsync(serviceUrl(webOrigin, link.path))}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: colors.glass,
                borderColor: colors.glassBorder,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[styles.title, { color: colors.text0 }]}>{link.title}</Text>
            <Text style={[styles.description, { color: colors.text2 }]}>{link.description}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.profile, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <View style={styles.profileText}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text0 }]}>
            {user?.name ?? 'Аккаунт'}
          </Text>
          {user?.email ? <Text numberOfLines={1} style={[styles.description, { color: colors.text2 }]}>{user.email}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={({ pressed }) => [styles.logout, { borderColor: colors.glassBorder }, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.logoutText, { color: colors.text0 }]}>Выйти</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: hitTarget * 2,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 16,
    justifyContent: 'flex-end',
    gap: 2,
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 16 },
  description: { fontFamily: fonts.body, fontSize: 12 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.md, padding: 16, marginTop: 8 },
  profileText: { flex: 1, minWidth: 0, gap: 2 },
  logout: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 16, justifyContent: 'center' },
  logoutText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
