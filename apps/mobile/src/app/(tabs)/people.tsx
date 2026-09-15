import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PeopleDirectorySection } from '@/components/people/people-directory-section';
import { PeopleRequestsSection } from '@/components/people/people-requests-section';
import { useSession } from '@/lib/auth/session';
import { createChatApi } from '@/lib/chat/chat-api';
import { createPeopleApi } from '@/lib/people/people-api';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

type Segment = 'directory' | 'requests';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'directory', label: 'Справочник' },
  { key: 'requests', label: 'Запросы' },
];

function openPerson(userId: string) {
  router.push({ pathname: '/people/[id]', params: { id: userId } });
}

/**
 * Вкладка «Люди»: справочник `chat/people` и запросы контакта. Переключатель
 * внутри вкладки, а не отдельная вкладка нижнего меню — в нём только связь
 * (`README.md`). Обе секции остаются смонтированными и просто скрываются:
 * переключение назад на «Справочник» не сбрасывает ни текст поиска, ни выдачу.
 */
export default function PeopleScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const peopleApi = useMemo(() => createPeopleApi(api), [api]);
  const chatApi = useMemo(() => createChatApi(api), [api]);
  const [segment, setSegment] = useState<Segment>('directory');

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0, paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
          Люди
        </Text>
        <View style={[styles.segments, { backgroundColor: colors.bg1, borderColor: colors.glassBorder }]}>
          {SEGMENTS.map((item) => {
            const active = segment === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setSegment(item.key)}
                android_ripple={ripple(colors.glassBorder)}
                style={({ pressed }) => [
                  styles.segment,
                  active ? { backgroundColor: colors.bg2 } : null,
                  pressedStyle(pressed),
                ]}
              >
                <Text style={[styles.segmentText, { color: active ? colors.text0 : colors.text1 }, active && styles.segmentTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.body, { display: segment === 'directory' ? 'flex' : 'none' }]}>
        <PeopleDirectorySection peopleApi={peopleApi} onOpenPerson={openPerson} />
      </View>
      <View style={[styles.body, { display: segment === 'requests' ? 'flex' : 'none' }]}>
        <PeopleRequestsSection peopleApi={peopleApi} chatApi={chatApi} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, gap: 14, marginBottom: 12 },
  title: { fontFamily: fonts.displayBold, fontSize: 24 },
  segments: { flexDirection: 'row', gap: 4, borderWidth: 1, borderRadius: radius.sm, padding: 4 },
  segment: { flex: 1, minHeight: hitTarget - 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm - 2, overflow: 'hidden' },
  segmentText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  segmentTextActive: { fontFamily: fonts.bodyBold },
  body: { flex: 1, paddingHorizontal: 20 },
});
