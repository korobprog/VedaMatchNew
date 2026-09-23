import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { PersonKeyboardAwareScroll as KeyboardAwareScrollView } from '@/components/keyboard-controller-web';
import { RetryButton } from '@/components/retry-button';
import { ClearGlyph, SearchGlyph } from '@/components/search/search-icons';
import { SearchResultRow } from '@/components/search/search-result-row';
import { appVariant } from '@/config/app-variant';
import { useSession } from '@/lib/auth/session';
import { openSearchTarget } from '@/lib/search/open-search-target';
import { createSearchApi } from '@/lib/search/search-api';
import { SEARCH_MAX_QUERY, normalizeSearchQuery, searchesChats } from '@/lib/search/search-query';
import { SEARCH_SCOPE_HINT, unavailableNote, type SearchItem } from '@/lib/search/search-results';
import { usePortalSearch } from '@/lib/search/use-portal-search';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Поиск по порталу в приложении (VED-337).
 *
 * На сайте поиск — страница `/search` за кнопкой панели горячих кнопок; в
 * приложении его не было вовсе, и найти что-то за пределами своих чатов было
 * нечем. Здесь одна выдача на всё: люди, общины, своя переписка и материалы
 * сервисов. Что есть в приложении своим экраном, открывается им, остальное —
 * на сайте (`lib/search/search-results.ts`).
 *
 * Отдельный экран, а не поле внутри вкладки: выдача занимает весь экран, у
 * неё своя клавиатура и своё «назад», а вход — поле в шапке «Сервисов»
 * (`components/search/search-entry.tsx`).
 */
export default function SearchScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const searchApi = useMemo(() => createSearchApi(api), [api]);
  const { webOrigin } = appVariant();

  const [input, setInput] = useState('');
  const [openError, setOpenError] = useState<string | null>(null);
  const search = usePortalSearch(searchApi, input);

  const typed = input.trim();
  const query = normalizeSearchQuery(input);

  const open = useCallback(
    async (item: SearchItem) => {
      setOpenError(null);
      const result = await openSearchTarget(item.target, {
        push: (route) => router.push(route as never),
        opener: {
          openBrowser: (url) => WebBrowser.openBrowserAsync(url),
          openLink: (url) => Linking.openURL(url),
        },
        webOrigin,
      });
      if (result?.kind === 'failed') setOpenError(result.message);
    },
    [webOrigin],
  );

  const view = search.view;
  // Выдача относится к другому запросу, чем набран сейчас, — ещё не
  // пришёл ответ на свежую букву. Её не прячем, но и «ничего не нашлось»
  // для старого слова не показываем: оно уже неправда.
  const stale = search.query !== query;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          android_ripple={ripple(colors.glassBorder, true)}
          style={({ pressed }) => [styles.back, pressedStyle(pressed)]}
        >
          <Text style={[styles.backText, { color: colors.text0 }]}>‹</Text>
        </Pressable>
        <View
          style={[
            styles.field,
            { backgroundColor: colors.bg1, borderColor: typed ? colors.magenta : colors.glassBorder },
          ]}
        >
          <SearchGlyph color={colors.text1} />
          <TextInput
            value={input}
            onChangeText={(next) => {
              setInput(next);
              setOpenError(null);
            }}
            autoFocus
            autoCorrect={false}
            maxLength={SEARCH_MAX_QUERY}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
            placeholder="Люди, общины, книги, товары…"
            placeholderTextColor={colors.text1}
            accessibilityLabel="Поиск по VedaMatch"
            style={[styles.input, { color: colors.text0 }]}
          />
          {typed ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Очистить поиск"
              onPress={() => setInput('')}
              android_ripple={ripple(colors.glassBorder, true)}
              style={({ pressed }) => [styles.clear, pressedStyle(pressed)]}
            >
              <ClearGlyph color={colors.text1} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={24}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* Состояние словами — и для скринридера, и чтобы было видно, что
            запрос ушёл. Прежняя выдача при этом остаётся под ним. */}
        <Text accessibilityLiveRegion="polite" style={[styles.status, { color: colors.text1 }]}>
          {search.loading && query ? 'Ищем…' : ''}
        </Text>

        {openError ? <InlineError message={openError} /> : null}

        {!typed ? <Text style={[styles.note, { color: colors.text1 }]}>{SEARCH_SCOPE_HINT}</Text> : null}

        {typed && !query ? (
          <Text style={[styles.note, { color: colors.text1 }]}>Нужно хотя бы два символа.</Text>
        ) : null}

        {query && !view && search.loading ? <ActivityIndicator color={colors.magenta} /> : null}

        {query && view?.kind === 'error' && !stale ? (
          <View style={styles.block}>
            <InlineError message="Поиск не ответил — похоже, нет соединения. Проверьте интернет и повторите." />
            <RetryButton onPress={search.retry} busy={search.loading} />
          </View>
        ) : null}

        {query && view?.kind === 'empty' && !stale ? (
          <View style={[styles.empty, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text style={[styles.emptyTitle, { color: colors.text0 }]}>По запросу «{search.query}» ничего не нашлось</Text>
            <Text style={[styles.emptyBody, { color: colors.text1 }]}>
              Попробуйте другое слово или запрос короче.
              {searchesChats(query) ? '' : ' Переписку ищем с трёх букв.'}
            </Text>
          </View>
        ) : null}

        {query && view?.kind === 'results'
          ? view.groups.map((group) => (
              <View key={group.id} style={styles.group}>
                <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.text1 }]}>
                  {group.title}
                </Text>
                {group.items.map((item) => (
                  <SearchResultRow key={item.key} item={item} onPress={(target) => void open(target)} />
                ))}
              </View>
            ))
          : null}

        {query && view && view.kind !== 'error' && !stale && unavailableNote(view.unavailable) ? (
          <Text style={[styles.note, { color: colors.text1 }]}>{unavailableNote(view.unavailable)}</Text>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingBottom: 8 },
  back: { minWidth: hitTarget, minHeight: hitTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  backText: { fontFamily: fonts.body, fontSize: 30, lineHeight: 34 },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingLeft: 12,
  },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 16, paddingVertical: 0, minHeight: hitTarget },
  clear: { minWidth: hitTarget, minHeight: hitTarget, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, gap: 16 },
  status: { fontFamily: fonts.body, fontSize: 12, minHeight: 16 },
  note: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  block: { gap: 12 },
  empty: { borderWidth: 1, borderRadius: radius.md, borderCurve: 'continuous', padding: 16, gap: 6 },
  emptyTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 21 },
  emptyBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  group: { gap: 8 },
  groupTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.4 },
});
