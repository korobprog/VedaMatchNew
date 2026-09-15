import type { ProfileMessengers, ProfileSocialLinks } from '@vedamatch/shared';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

/** Открытые способы связи: непустое поле `contacts` бывает только при действующем раскрытии. */
export interface ContactsDetailsValue {
  socialLinks: ProfileSocialLinks;
  messengers: ProfileMessengers;
}

const MESSENGER_LABELS: Record<keyof ProfileMessengers, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  mx: 'MX',
  phone: 'Телефон',
};

const SOCIAL_LABELS: Record<keyof ProfileSocialLinks, string> = {
  instagram: 'Instagram',
  telegram: 'Telegram',
  x: 'X',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  vk: 'VK',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  website: 'Сайт',
};

function entries<T extends object>(labels: Record<keyof T & string, string>, values: T | null | undefined): [string, string][] {
  const result: [string, string][] = [];
  for (const [key, label] of Object.entries(labels) as [keyof T & string, string][]) {
    const value = values?.[key];
    const text = typeof value === 'string' ? value.trim() : '';
    if (text) result.push([label, text]);
  }
  return result;
}

/**
 * Открытые способы связи — главный результат принятого запроса контакта
 * (перенос с сайта, `people-details.tsx`). Ничего сверх того, что прислал
 * API: своей логики «кому можно» здесь нет.
 */
export function PeopleDetails({ contacts }: { contacts: ContactsDetailsValue }) {
  const { colors } = useTheme();
  // Мессенджеры первыми — за ними обычно и обращаются.
  const rows = [...entries(MESSENGER_LABELS, contacts.messengers), ...entries(SOCIAL_LABELS, contacts.socialLinks)];

  if (rows.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.text1 }]}>Доступ открыт, но человек пока не указал ни одного способа связи.</Text>
    );
  }

  return (
    <View style={styles.root}>
      {rows.map(([label, value]) => (
        <View key={label} style={[styles.row, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
          <Text style={[styles.label, { color: colors.text1 }]}>{label}</Text>
          <Text selectable style={[styles.value, { color: colors.text0 }]}>
            {value}
          </Text>
        </View>
      ))}
      <Text style={[styles.notice, { color: colors.text1 }]}>Это личные данные человека. Не передавайте их дальше и не публикуйте.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  row: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontFamily: fonts.body, fontSize: 14 },
  empty: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  notice: { fontFamily: fonts.body, fontSize: 11, lineHeight: 15 },
});
