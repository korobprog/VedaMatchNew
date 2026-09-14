import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/screen';
import { appVariant } from '@/config/app-variant';
import { SERVICE_LINKS, serviceUrl } from '@/config/services';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

export default function ServicesScreen() {
  const { colors } = useTheme();
  const { webOrigin } = appVariant();

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
});
