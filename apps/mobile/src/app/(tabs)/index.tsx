import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/screen';
import { useSession } from '@/lib/auth/session';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

export default function ChatsScreen() {
  const { colors } = useTheme();
  const { user, signOut } = useSession();
  return (
    <Screen title="Чаты" subtitle="Беседы и канал VedaMatch появятся во второй фазе.">
      <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <Text style={[styles.name, { color: colors.text0 }]}>{user?.name ?? 'Вы вошли'}</Text>
        {user?.email ? <Text style={[styles.email, { color: colors.text2 }]}>{user.email}</Text> : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={({ pressed }) => [styles.button, { borderColor: colors.glassBorder }, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.buttonText, { color: colors.text0 }]}>Выйти</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: 16, gap: 6 },
  name: { fontFamily: fonts.bodyBold, fontSize: 16 },
  email: { fontFamily: fonts.body, fontSize: 13 },
  button: { marginTop: 10, minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
