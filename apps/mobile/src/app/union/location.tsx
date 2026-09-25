import type { GeoSearchResult } from '@vedamatch/shared';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { PersonKeyboardAwareScroll as KeyboardAwareScrollView } from '@/components/keyboard-controller-web';
import { UnionButton, unionHeaderOptions } from '@/components/union/union-screen-parts';
import { useUnionApi } from '@/components/union/use-union';
import { useSession } from '@/lib/auth/session';
import { confirmTap } from '@/lib/feedback';
import { canSearchCity, locationDetails, toHomeLocation } from '@/lib/union/union-gallery';
import { describeUnionError } from '@/lib/union/union-error';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/** Пауза перед поиском: не дёргать геокодер на каждую букву. */
const SEARCH_DELAY_MS = 350;

/**
 * Место жительства для Знакомств (`/union/location` на сайте,
 * `union-location-onboarding.tsx`): страна и город из подсказок геокодера.
 * Без места подбор не работает — от него считаются «рядом» и расстояние в
 * совместимости. Сохраняется в портальный профиль, как на сайте.
 *
 * Город выбирается только из подсказок: набранное руками название без
 * координат серверу ни о чём не говорит.
 */
export default function UnionLocationScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const unionApi = useUnionApi();
  const { reloadUser } = useSession();
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [selected, setSelected] = useState<GeoSearchResult | null>(null);
  const [results, setResults] = useState<GeoSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canSearchCity(city, country)) return;
    if (selected && city.trim() === selected.city && country.trim() === (selected.country ?? country.trim())) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      setError(null);
      unionApi
        .searchCities(city, country, controller.signal)
        .then((items) => setResults(items))
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          setResults([]);
          setError(describeUnionError(e, 'Не удалось найти город. Попробуйте ещё раз.'));
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [city, country, selected, unionApi]);

  const choose = (item: GeoSearchResult) => {
    setSelected(item);
    setCity(item.city);
    if (item.country) setCountry(item.country);
    setResults([]);
  };

  const save = async () => {
    if (!selected) {
      setError('Выберите город из списка подсказок.');
      return;
    }
    confirmTap();
    setSaving(true);
    setError(null);
    try {
      const profile = await unionApi.saveHomeLocation(toHomeLocation(selected, country));
      if (!profile.homeLocation?.country) throw new Error('Место не сохранилось');
      void reloadUser().catch(() => undefined);
      // Вход в раздел решит, куда дальше: к анкете или сразу в подбор.
      router.replace('/union');
    } catch (e) {
      setError(describeUnionError(e, 'Не удалось сохранить место. Попробуйте ещё раз.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={unionHeaderOptions(colors, 'Место')} />
      <KeyboardAwareScrollView
        bottomOffset={120}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
          Укажите страну и город
        </Text>
        <Text style={[styles.text, { color: colors.text1 }]}>
          Место нужно для подбора людей рядом и для фильтров Знакомств.
        </Text>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text1 }]}>Страна</Text>
          <TextInput
            value={country}
            onChangeText={(value) => {
              setCountry(value);
              setSelected(null);
              setResults([]);
            }}
            placeholder="Например, Россия"
            placeholderTextColor={colors.text1}
            autoComplete="country"
            accessibilityLabel="Страна"
            style={[styles.input, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text1 }]}>Город</Text>
          <TextInput
            value={city}
            onChangeText={(value) => {
              setCity(value);
              setSelected(null);
              setResults([]);
            }}
            placeholder="Начните вводить город"
            placeholderTextColor={colors.text1}
            accessibilityLabel="Город"
            style={[styles.input, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
          />
        </View>

        {searching ? (
          <View style={styles.searching}>
            <ActivityIndicator color={colors.magenta} />
            <Text style={[styles.hint, { color: colors.text1 }]}>Ищем город…</Text>
          </View>
        ) : null}

        {results.length > 0 ? (
          <View accessibilityRole="list" style={[styles.results, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
            {results.map((item) => {
              const details = locationDetails(item);
              return (
                <Pressable
                  key={`${item.lat}-${item.lon}-${item.city}-${item.country}`}
                  accessibilityRole="button"
                  accessibilityLabel={[item.city, item.country, details].filter(Boolean).join(', ')}
                  onPress={() => choose(item)}
                  android_ripple={ripple(colors.glassBorder)}
                  style={({ pressed }) => [styles.result, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
                >
                  <Text style={[styles.resultTitle, { color: colors.text0 }]}>
                    {[item.city, item.country].filter(Boolean).join(', ')}
                  </Text>
                  {details ? <Text style={[styles.hint, { color: colors.text1 }]}>{details}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {selected ? (
          <Text accessibilityLiveRegion="polite" style={[styles.chosen, { color: colors.text0 }]}>
            {`Выбрано: ${[selected.city, selected.country].filter(Boolean).join(', ')}`}
          </Text>
        ) : null}

        {error ? <InlineError message={error} /> : null}

        <UnionButton label="Сохранить и продолжить" busy={saving} disabled={!selected} onPress={() => void save()} />

        <Text style={[styles.hint, { color: colors.text1 }]}>
          Мы сохраняем только выбранный город и примерные координаты. Кому виден город, настраивается в анкете.
        </Text>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, gap: 14 },
  title: { fontFamily: fonts.displayBold, fontSize: 20 },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  field: { gap: 6 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  input: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  searching: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  results: { borderWidth: 1, borderRadius: radius.sm, overflow: 'hidden' },
  result: { minHeight: hitTarget, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', borderBottomWidth: 1, gap: 2 },
  resultTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  chosen: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
});
