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
  // Не просто «Telegram»: у мессенджера та же подпись, а после дедупликации
  // по значению здесь остаётся только канал/публичная ссылка, не личный
  // контакт — разные вещи, и визуально это не должно читаться как дубль
  // (раунд оценки 005, дефект 4).
  telegram: 'Telegram-канал',
  x: 'X',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  vk: 'VK',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  website: 'Сайт',
};

interface ContactRow {
  /** Уникален по группе+полю — иначе «Telegram» в мессенджерах и в соцсетях дают одинаковый `key` (раунд оценки 005, дефект 4). */
  id: string;
  label: string;
  value: string;
}

function entries<T extends object>(group: 'messenger' | 'social', labels: Record<keyof T & string, string>, values: T | null | undefined): ContactRow[] {
  const result: ContactRow[] = [];
  for (const [key, label] of Object.entries(labels) as [keyof T & string, string][]) {
    const value = values?.[key];
    const text = typeof value === 'string' ? value.trim() : '';
    if (text) result.push({ id: `${group}:${key}`, label, value: text });
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
  const messengerRows = entries('messenger', MESSENGER_LABELS, contacts.messengers);
  const socialRows = entries('social', SOCIAL_LABELS, contacts.socialLinks);
  // Одна и та же ссылка не повторяется дважды, если человек указал её и
  // мессенджером, и социальной сетью (например, один Telegram в обоих полях).
  const seenValues = new Set(messengerRows.map((row) => row.value));
  const rows = [...messengerRows, ...socialRows.filter((row) => !seenValues.has(row.value))];

  if (rows.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.text1 }]}>Доступ открыт, но человек пока не указал ни одного способа связи.</Text>
    );
  }

  return (
    <View style={styles.root}>
      {rows.map((row) => (
        <View key={row.id} style={[styles.row, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
          <Text style={[styles.label, { color: colors.text1 }]}>{row.label}</Text>
          <Text selectable style={[styles.value, { color: colors.text0 }]}>
            {row.value}
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
