import type { CommunityJoinPolicy, CommunityKind, GeoSearchResult } from '@vedamatch/shared';
import { COMMUNITY_DESCRIPTION_MAX_LENGTH, COMMUNITY_NAME_MAX_LENGTH } from '@vedamatch/shared';
import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { PersonKeyboardAwareScroll as KeyboardAwareScrollView } from '@/components/keyboard-controller-web';
import { OptionChips, type ChipOption } from '@/components/option-chips';
import { useSession } from '@/lib/auth/session';
import { createCommunitiesApi } from '@/lib/communities/communities-api';
import { COMMUNITY_KIND_LABELS } from '@/lib/communities/community-labels';
import {
  buildCreateCommunityRequest,
  COMMUNITY_ADDRESS_MAX_LENGTH,
  COMMUNITY_JOIN_POLICY_LABELS,
  COMMUNITY_JOIN_POLICY_ORDER,
  COMMUNITY_KIND_ORDER,
  emptyCommunityDraft,
  locationLabel,
  shouldSearchGeo,
  validateCommunityDraft,
  type CommunityDraft,
} from '@/lib/communities/community-draft';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

const KIND_OPTIONS: ChipOption<CommunityKind>[] = COMMUNITY_KIND_ORDER.map((kind) => ({
  value: kind,
  label: COMMUNITY_KIND_LABELS[kind],
}));

const JOIN_POLICY_OPTIONS: ChipOption<CommunityJoinPolicy>[] = COMMUNITY_JOIN_POLICY_ORDER.map((policy) => ({
  value: policy,
  label: COMMUNITY_JOIN_POLICY_LABELS[policy],
}));

const GEO_DEBOUNCE_MS = 350;

/**
 * «Завести общину» — ятру, храм, нама-хатту: та же форма, что на сайте
 * (`apps/web/src/components/communities/community-form.tsx`), и та же
 * портальная ручка `POST /communities`. Карточка уходит на проверку
 * администрации портала, поэтому вместо перехода в общину экран честно
 * говорит, что заявка отправлена.
 *
 * Общины — портальная инфраструктура, а не сервис: маршрут здесь
 * `/communities/*`, без slug'а сервиса, как и на сервере.
 */
export default function NewCommunityScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const communitiesApi = useMemo(() => createCommunitiesApi(api), [api]);

  const [draft, setDraft] = useState<CommunityDraft>(emptyCommunityDraft);
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<GeoSearchResult[]>([]);
  const [cityBusy, setCityBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);

  // Подсказки городов: ждём, пока человек допишет, и отменяем предыдущий
  // запрос — иначе ответ на «Мин» может прийти после ответа на «Минск».
  useEffect(() => {
    if (!shouldSearchGeo(cityQuery, draft.location)) {
      setCityResults([]);
      setCityBusy(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setCityBusy(true);
      communitiesApi
        .geoSearch(cityQuery.trim(), controller.signal)
        .then((results) => setCityResults(results.slice(0, 6)))
        .catch(() => setCityResults([]))
        .finally(() => setCityBusy(false));
    }, GEO_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cityQuery, draft.location, communitiesApi]);

  const submit = useCallback(async () => {
    const problem = validateCommunityDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    confirmTap();
    setBusy(true);
    setError(null);
    try {
      const community = await communitiesApi.create(buildCreateCommunityRequest(draft));
      setCreatedName(community.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }, [communitiesApi, draft]);

  const screenHeader = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: 'Новая община',
        headerStyle: { backgroundColor: colors.bg0 },
        headerTintColor: colors.text0,
        headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    />
  );

  if (createdName) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        {screenHeader}
        <View style={styles.center}>
          <Text accessibilityRole="header" style={[styles.doneTitle, { color: colors.text0 }]}>
            Заявка отправлена
          </Text>
          <Text accessibilityLiveRegion="polite" style={[styles.centerText, { color: colors.text1 }]}>
            «{createdName}» увидит администрация портала. Пока карточку не подтвердят, общины нет в справочнике, и
            беседы в ней не видны. Вы уже её владелец.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Готово"
            onPress={() => router.back()}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.magenta, borderColor: colors.magenta },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.primaryText, { color: colors.onAccent }]}>Готово</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      {screenHeader}
      <KeyboardAwareScrollView
        bottomOffset={160}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.notice, { color: colors.text1, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
          Карточку увидит администрация портала и подтвердит её. Так справочник не зарастает дублями одной и той же
          ятры под разными названиями.
        </Text>

        <OptionChips
          label="Тип"
          options={KIND_OPTIONS}
          value={draft.kind}
          onChange={(kind) => setDraft((current) => ({ ...current, kind }))}
          disabled={busy}
        />

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text1 }]}>Название</Text>
          <TextInput
            value={draft.name}
            onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
            maxLength={COMMUNITY_NAME_MAX_LENGTH}
            editable={!busy}
            placeholder="Минская ятра"
            placeholderTextColor={colors.text1}
            accessibilityLabel="Название общины"
            style={[styles.input, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text1 }]}>Описание</Text>
          <TextInput
            value={draft.description}
            onChangeText={(description) => setDraft((current) => ({ ...current, description }))}
            maxLength={COMMUNITY_DESCRIPTION_MAX_LENGTH}
            editable={!busy}
            multiline
            placeholder="Чем живёт община, когда собираетесь"
            placeholderTextColor={colors.text1}
            accessibilityLabel="Описание общины"
            style={[styles.textarea, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text1 }]}>Город</Text>
          <TextInput
            value={cityQuery}
            onChangeText={(next) => {
              setCityQuery(next);
              // Правят город — прежний выбор больше не годится: без
              // координат община не попадёт на карту.
              setDraft((current) => ({ ...current, location: null }));
            }}
            editable={!busy}
            placeholder="Начните вводить название"
            placeholderTextColor={colors.text1}
            accessibilityLabel="Город общины"
            style={[styles.input, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
          />
          {cityBusy ? (
            <View style={styles.row}>
              <ActivityIndicator color={colors.text1} />
              <Text style={[styles.hint, { color: colors.text1 }]}>Ищем город…</Text>
            </View>
          ) : null}
          {draft.location ? (
            <Text style={[styles.hint, { color: colors.text1 }]}>Выбрано: {locationLabel(draft.location)}</Text>
          ) : null}
          {cityResults.map((result) => (
            <Pressable
              key={`${result.lat},${result.lon},${result.displayName ?? result.city}`}
              accessibilityRole="button"
              accessibilityLabel={result.displayName ?? result.city}
              onPress={() => {
                const location = {
                  city: result.city,
                  country: result.country,
                  lat: result.lat,
                  lon: result.lon,
                  displayName: result.displayName,
                };
                setDraft((current) => ({ ...current, location }));
                // В поле кладётся ровно та подпись, с которой потом
                // сверяется `shouldSearchGeo`, — иначе форма пойдёт искать
                // уже выбранный город и снова покажет подсказки. Гасит их
                // тот же эффект: отдельный `setCityResults([])` здесь был бы
                // второй, незаметной причиной того же самого.
                setCityQuery(locationLabel(location) ?? '');
              }}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [
                styles.suggestion,
                { borderColor: colors.glassBorder, backgroundColor: colors.bg1 },
                pressedStyle(pressed),
              ]}
            >
              <Text numberOfLines={2} style={[styles.suggestionText, { color: colors.text0 }]}>
                {result.displayName ?? result.city}
              </Text>
            </Pressable>
          ))}
          <Text style={[styles.hint, { color: colors.text1 }]}>
            Необязательно, но без города общину не найдут на карте и в поиске по городу.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text1 }]}>Адрес</Text>
          <TextInput
            value={draft.address}
            onChangeText={(address) => setDraft((current) => ({ ...current, address }))}
            maxLength={COMMUNITY_ADDRESS_MAX_LENGTH}
            editable={!busy}
            placeholder="Необязательно"
            placeholderTextColor={colors.text1}
            accessibilityLabel="Адрес общины"
            style={[styles.input, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
          />
        </View>

        <OptionChips
          label="Как вступают"
          options={JOIN_POLICY_OPTIONS}
          value={draft.joinPolicy}
          onChange={(joinPolicy) => setDraft((current) => ({ ...current, joinPolicy }))}
          disabled={busy}
        />

        {error ? <InlineError message={error} /> : null}

        {/* Кнопка гаснет только на время отправки: пустое название не гасит
            её, а объясняется текстом отказа — как на сайте. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отправить на проверку"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => void submit()}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.magenta, borderColor: colors.magenta },
            busy ? styles.busy : pressedStyle(pressed),
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.primaryText, { color: colors.onAccent }]}>Отправить на проверку</Text>
          )}
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  notice: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: 12,
    overflow: 'hidden',
  },
  field: { gap: 8 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  textarea: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  suggestion: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  suggestionText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 },
  doneTitle: { fontFamily: fonts.displayBold, fontSize: 22, textAlign: 'center' },
  centerText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  primary: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  busy: { opacity: 0.6 },
});
