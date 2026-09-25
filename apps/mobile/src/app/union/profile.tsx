import {
  STATUS_LINE_MAX_LENGTH,
  type Gender,
  type UnionChildrenStatus,
  type UnionContactMode,
  type UnionDiet,
  type UnionEducationLevel,
  type UnionFormat,
  type UnionHousing,
  type UnionIncomeLevel,
  type UnionProfileCompleteness,
  type UnionProfileUpdateRequest,
  type UnionRegulativePrinciple,
  type UnionSpiritualEducation,
  type UnionVisibilityLevel,
  type UserProfile,
} from '@vedamatch/shared';
import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckRow } from '@/components/onboarding/check-row';
import { InlineError } from '@/components/inline-error';
import { PersonKeyboardAwareScroll as KeyboardAwareScrollView } from '@/components/keyboard-controller-web';
import { GalleryEditor } from '@/components/union/gallery-editor';
import { IntentionEditor } from '@/components/union/intention-editor';
import {
  ChoiceChips,
  FieldLabel,
  MultiChips,
  PortalFieldRow,
  ProfileSection,
  TagChips,
} from '@/components/union/profile-controls';
import { UnionNav } from '@/components/union/union-nav';
import { UnionButton, UnionLoadFailed, UnionLoading, unionHeaderOptions } from '@/components/union/union-screen-parts';
import { useIncomingPending, useUnionApi } from '@/components/union/use-union';
import { useSession } from '@/lib/auth/session';
import { confirmTap } from '@/lib/feedback';
import { createProfileApi } from '@/lib/profile/profile-api';
import {
  UNION_CHILDREN_LABELS,
  UNION_DIET_LABELS,
  UNION_EDUCATION_LABELS,
  UNION_FAMILY_STATUS_OPTIONS,
  UNION_HOUSING_LABELS,
  UNION_INCOME_LABELS,
  UNION_INTEREST_OPTIONS,
  UNION_PET_OPTIONS,
  UNION_PRINCIPLE_LABELS,
  UNION_SKILL_CATEGORIES,
  UNION_SPIRITUAL_EDUCATION_LABELS,
  UNION_VALUE_OPTIONS,
  type UnionTagOption,
} from '@/lib/union/union-dictionaries';
import { hasCompleteUnionLocation } from '@/lib/union/union-entry';
import { describeUnionError } from '@/lib/union/union-error';
import {
  CONTACT_MODE_LABELS,
  FORMAT_LABELS,
  MAX_HEIGHT_CM,
  MIN_HEIGHT_CM,
  PRIVACY_FIELDS,
  PRIVACY_LABELS,
  SAVE_DEBOUNCE_MS,
  ageRangeValue,
  canAddCustomTag,
  contactModeHint,
  intentionSum,
  listValue,
  mergePatch,
  parseAgeRange,
  parseBoundedNumber,
  progressHint,
  progressTone,
  toDraft,
  toggleTag,
  toWeights,
  type IntentionWeights,
  type UnionDraft,
} from '@/lib/union/union-profile-form';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type TagKey = 'interests' | 'values' | 'skills' | 'pets';

const entries = <T extends string>(labels: Record<T, string>) => Object.entries(labels) as [T, string][];

const EMPTY_COMPLETENESS: UnionProfileCompleteness = { percent: 0, items: [], missing: [], next: null };

interface Loaded {
  me: UserProfile;
  created: boolean;
}

/**
 * Своя анкета Знакомств (`/union/profile` на сайте). Правки сохраняются сами
 * — копятся ~0,6 с и уходят одним запросом, как на сайте; статус — сразу в
 * портальный профиль. Пока сумма целей не 100%, правки ждут: сервер такую
 * анкету не примет, а терять их незачем.
 *
 * «О себе» и языки — портальные: они в профиле и одинаковы во всех
 * сервисах, здесь только показываются со ссылкой туда, где их меняют.
 */
export default function UnionProfileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const unionApi = useUnionApi();
  const profileApi = useMemo(() => createProfileApi(api), [api]);
  const incomingPending = useIncomingPending(unionApi);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<UnionDraft | null>(null);
  const [weights, setWeights] = useState<IntentionWeights | null>(null);
  const [completeness, setCompleteness] = useState<UnionProfileCompleteness>(EMPTY_COMPLETENESS);
  const [created, setCreated] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  // Поля с клавиатурой держат набранное отдельно от черновика: в анкету
  // уходит только проверенное значение, по кнопке «Применить».
  const [statusText, setStatusText] = useState('');
  const [heightText, setHeightText] = useState('');
  const [ageMinText, setAgeMinText] = useState('');
  const [ageMaxText, setAgeMaxText] = useState('');
  const [fieldError, setFieldError] = useState<{ field: 'status' | 'height' | 'age'; message: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [customTag, setCustomTag] = useState<Record<TagKey, string>>({ interests: '', values: '', skills: '', pets: '' });

  const pending = useRef<UnionProfileUpdateRequest | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weightsRef = useRef<IntentionWeights | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [me, state] = await Promise.all([profileApi.me(), unionApi.profileState()]);
      // Без места подбор не работает — сначала место, как на сайте.
      if (!hasCompleteUnionLocation(me)) {
        router.replace('/union/location');
        return;
      }
      const nextDraft = toDraft(state.profile, { statusLine: me.statusLine, about: me.about });
      const nextWeights = toWeights(state.profile);
      setLoaded({ me, created: state.profile !== null });
      setDraft(nextDraft);
      setWeights(nextWeights);
      weightsRef.current = nextWeights;
      setCompleteness(state.completeness);
      setCreated(state.profile !== null);
      setStatusText(nextDraft.status ?? '');
      setHeightText(nextDraft.heightCm ? String(nextDraft.heightCm) : '');
      setAgeMinText(nextDraft.ageRangeMin ? String(nextDraft.ageRangeMin) : '');
      setAgeMaxText(nextDraft.ageRangeMax ? String(nextDraft.ageRangeMax) : '');
    } catch (e) {
      setLoadError(describeUnionError(e, 'Не удалось открыть анкету.'));
    }
  }, [profileApi, unionApi]);

  useEffect(() => {
    void load();
  }, [load]);

  const flush = useCallback(async () => {
    const body = pending.current;
    if (!body || !weightsRef.current || intentionSum(weightsRef.current) !== 100) return;
    pending.current = null;
    setSaveState('saving');
    setError(null);
    try {
      const state = await unionApi.updateProfile(body);
      setCompleteness(state.completeness);
      setCreated(true);
      setSaveState('saved');
    } catch (e) {
      setSaveState('error');
      setError(describeUnionError(e, 'Не удалось сохранить анкету.'));
    }
  }, [unionApi]);

  const schedule = useCallback(
    (patch: Partial<UnionProfileUpdateRequest>) => {
      if (!weightsRef.current) return;
      pending.current = mergePatch(pending.current, patch, weightsRef.current);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // Ушли с экрана раньше, чем истекла задержка, — правки не теряем.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      const body = pending.current;
      if (body && weightsRef.current && intentionSum(weightsRef.current) === 100) {
        pending.current = null;
        void unionApi.updateProfile(body).catch(() => undefined);
      }
    },
    [unionApi],
  );

  const update = <K extends keyof UnionDraft>(key: K, value: UnionDraft[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    schedule({ [key]: value } as Partial<UnionProfileUpdateRequest>);
  };

  const changeWeights = (next: IntentionWeights) => {
    setWeights(next);
    weightsRef.current = next;
    // Сумма не 100 — сервер не примет; правка дождётся, пока её выровняют.
    schedule({});
  };

  const saveStatus = async (value: string | null) => {
    setFieldError(null);
    if (value !== null && value.length > STATUS_LINE_MAX_LENGTH) {
      setFieldError({ field: 'status', message: `Статус не длиннее ${STATUS_LINE_MAX_LENGTH} символов.` });
      return;
    }
    setSaveState('saving');
    try {
      await unionApi.saveStatusLine(value);
      setDraft((current) => (current ? { ...current, status: value } : current));
      setStatusText(value ?? '');
      setSaveState('saved');
    } catch (e) {
      setSaveState('error');
      setFieldError({ field: 'status', message: describeUnionError(e, 'Не удалось сохранить статус.') });
    }
  };

  const generateStatus = async () => {
    if (generating) return;
    setGenerating(true);
    setFieldError(null);
    try {
      const { text } = await unionApi.generateText('status');
      await saveStatus(text.slice(0, STATUS_LINE_MAX_LENGTH));
    } catch (e) {
      setFieldError({ field: 'status', message: describeUnionError(e, 'Не удалось придумать статус.') });
    } finally {
      setGenerating(false);
    }
  };

  const applyHeight = () => {
    const parsed = parseBoundedNumber(heightText, MIN_HEIGHT_CM, MAX_HEIGHT_CM);
    if (!parsed.ok) {
      setFieldError({ field: 'height', message: `Рост: ${parsed.message}` });
      return;
    }
    setFieldError(null);
    update('heightCm', parsed.value);
  };

  const applyAgeRange = () => {
    const parsed = parseAgeRange(ageMinText, ageMaxText);
    if (!parsed.ok) {
      setFieldError({ field: 'age', message: parsed.message });
      return;
    }
    setFieldError(null);
    setDraft((current) => (current ? { ...current, ageRangeMin: parsed.min, ageRangeMax: parsed.max } : current));
    schedule({ ageRangeMin: parsed.min, ageRangeMax: parsed.max });
  };

  const toggleListTag = (key: TagKey, value: string) => {
    if (!draft) return;
    update(key, toggleTag(draft[key] ?? [], value));
  };

  const addCustomTag = (key: TagKey, options: readonly UnionTagOption[]) => {
    if (!draft) return;
    const value = customTag[key];
    if (!canAddCustomTag(value, draft[key] ?? [], options)) return;
    update(key, toggleTag(draft[key] ?? [], value));
    setCustomTag((current) => ({ ...current, [key]: '' }));
  };

  const create = async () => {
    confirmTap();
    schedule({});
    if (timer.current) clearTimeout(timer.current);
    await flush();
  };

  if (!loaded || !draft || !weights) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        <Stack.Screen options={unionHeaderOptions(colors, 'Моя анкета')} />
        {loadError ? <UnionLoadFailed message={loadError} onRetry={() => void load()} /> : <UnionLoading label="Загружаем анкету" />}
      </View>
    );
  }

  const sumOk = intentionSum(weights) === 100;
  const tone = progressTone(completeness.percent);
  const toneColor = tone === 'cyan' ? colors.cyan : tone === 'gold' ? colors.gold : colors.magenta;
  const saveLabel =
    saveState === 'saving' ? 'Сохранение…' : saveState === 'saved' ? 'Сохранено' : saveState === 'error' ? 'Не удалось сохранить' : '';

  const tagInput = (key: TagKey, placeholder: string, options: readonly UnionTagOption[]) => (
    <View style={styles.inline}>
      <TextInput
        value={customTag[key]}
        onChangeText={(value) => setCustomTag((current) => ({ ...current, [key]: value }))}
        placeholder={placeholder}
        placeholderTextColor={colors.text1}
        maxLength={100}
        accessibilityLabel={`Свой вариант: ${placeholder}`}
        onSubmitEditing={() => addCustomTag(key, options)}
        returnKeyType="done"
        style={[styles.input, styles.grow, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
      />
      <UnionButton
        kind="secondary"
        label="Добавить"
        disabled={!canAddCustomTag(customTag[key], draft[key] ?? [], options)}
        onPress={() => addCustomTag(key, options)}
      />
    </View>
  );

  const allSkills = UNION_SKILL_CATEGORIES.flatMap((category) => category.options);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={unionHeaderOptions(colors, 'Моя анкета')} />
      <KeyboardAwareScrollView
        bottomOffset={140}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        <UnionNav active="profile" incomingPending={incomingPending} />

        {!created ? (
          <Text style={[styles.welcome, { color: colors.text1, backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            Добро пожаловать! Чтобы увидеть подходящих людей, заполните анкету: отметьте цели и расскажите о себе.
          </Text>
        ) : null}

        {/* Заполненность: процент и то, что сделать дальше. */}
        <View style={[styles.progress, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={styles.progressHead}>
            <Text style={[styles.progressTitle, { color: colors.text0 }]}>{`Заполнена на ${completeness.percent}%`}</Text>
            <Text accessibilityLiveRegion="polite" style={[styles.saveState, { color: colors.text1 }]}>
              {saveLabel}
            </Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Заполненность анкеты"
            accessibilityValue={{ min: 0, max: 100, now: completeness.percent }}
            style={[styles.track, { backgroundColor: colors.bg1 }]}
          >
            <View style={[styles.bar, { width: `${completeness.percent}%`, backgroundColor: toneColor }]} />
          </View>
          <Text style={[styles.hint, { color: colors.text1 }]}>{progressHint(completeness)}</Text>
        </View>

        <ProfileSection title="Фото">
          <GalleryEditor
            unionApi={unionApi}
            onChanged={() => {
              // Фото влияют на заполненность — перечитываем её.
              void unionApi.profileState().then((state) => setCompleteness(state.completeness)).catch(() => undefined);
            }}
          />
        </ProfileSection>

        <ProfileSection title="Статус">
          <View style={styles.field}>
            <FieldLabel label="Короткий статус" hint="Одна фраза, которую увидят первой. Видна на всём портале." />
            <TextInput
              value={statusText}
              onChangeText={setStatusText}
              maxLength={STATUS_LINE_MAX_LENGTH}
              placeholder="Расскажите что-нибудь…"
              placeholderTextColor={colors.text1}
              accessibilityLabel="Короткий статус"
              style={[styles.input, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
            />
            <View style={styles.inline}>
              <UnionButton
                grow
                label="Сохранить статус"
                disabled={statusText.trim() === (draft.status ?? '')}
                onPress={() => void saveStatus(statusText.trim() || null)}
              />
              <UnionButton grow kind="secondary" label="Придумать" busy={generating} onPress={() => void generateStatus()} />
            </View>
            {fieldError?.field === 'status' ? <InlineError message={fieldError.message} /> : null}
          </View>
          <PortalFieldRow
            label="О себе"
            value={draft.about ?? null}
            empty="Не заполнено — расскажите о себе в профиле"
            action={{ label: 'В профиле', onPress: () => router.push('/profile') }}
          />
        </ProfileSection>

        <ProfileSection title="Цель знакомства">
          <IntentionEditor
            weights={weights}
            onChange={changeWeights}
            viewerAge={loaded.me.age}
            viewerGender={loaded.me.gender}
            seeksGender={draft.familySeeksGender}
            onSeeksGenderChange={(gender: Gender | null) => update('familySeeksGender', gender)}
          />
          {!sumOk ? (
            <Text accessibilityRole="alert" style={[styles.hint, { color: colors.text0 }]}>
              Пока сумма приоритетов не равна 100, изменения ждут и не сохраняются.
            </Text>
          ) : null}
          <View style={styles.field}>
            <FieldLabel
              label="Желаемый возраст партнёра"
              hint={ageRangeValue(draft.ageRangeMin, draft.ageRangeMax) ?? 'Не указан — по желанию'}
            />
            <View style={styles.inline}>
              <TextInput
                value={ageMinText}
                onChangeText={setAgeMinText}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="от"
                placeholderTextColor={colors.text1}
                accessibilityLabel="Возраст партнёра от"
                style={[styles.input, styles.grow, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
              />
              <TextInput
                value={ageMaxText}
                onChangeText={setAgeMaxText}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="до"
                placeholderTextColor={colors.text1}
                accessibilityLabel="Возраст партнёра до"
                style={[styles.input, styles.grow, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
              />
              <UnionButton kind="secondary" label="Применить" onPress={applyAgeRange} />
            </View>
            {fieldError?.field === 'age' ? <InlineError message={fieldError.message} /> : null}
          </View>
        </ProfileSection>

        <ProfileSection title="О себе">
          <View style={styles.field}>
            <FieldLabel label="Рост, см" hint={draft.heightCm ? `${draft.heightCm} см` : 'Не указан'} />
            <View style={styles.inline}>
              <TextInput
                value={heightText}
                onChangeText={setHeightText}
                keyboardType="number-pad"
                maxLength={3}
                placeholder={`${MIN_HEIGHT_CM}–${MAX_HEIGHT_CM}`}
                placeholderTextColor={colors.text1}
                accessibilityLabel="Рост в сантиметрах"
                style={[styles.input, styles.grow, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
              />
              <UnionButton kind="secondary" label="Применить" onPress={applyHeight} />
            </View>
            {fieldError?.field === 'height' ? <InlineError message={fieldError.message} /> : null}
          </View>
          <ChoiceChips<string>
            label="Семейный статус"
            options={UNION_FAMILY_STATUS_OPTIONS.map((value) => [value, value] as const)}
            value={draft.familyStatus ?? null}
            onChange={(value) => update('familyStatus', value)}
          />
          <ChoiceChips<UnionChildrenStatus>
            label="Дети"
            options={entries(UNION_CHILDREN_LABELS)}
            value={draft.childrenStatus ?? null}
            onChange={(value) => update('childrenStatus', value)}
          />
          <ChoiceChips<UnionDiet>
            label="Питание"
            options={entries(UNION_DIET_LABELS)}
            value={draft.diet ?? null}
            onChange={(value) => update('diet', value)}
          />
          <MultiChips<UnionRegulativePrinciple>
            label="Регулирующие принципы"
            hint="Отметьте те, которым следуете. Пустой список означает «не указано»."
            options={entries(UNION_PRINCIPLE_LABELS)}
            values={draft.regulativePrinciples ?? []}
            onChange={(values) => update('regulativePrinciples', values)}
          />
          <ChoiceChips<UnionEducationLevel>
            label="Образование"
            options={entries(UNION_EDUCATION_LABELS)}
            value={draft.education ?? null}
            onChange={(value) => update('education', value)}
          />
          <ChoiceChips<UnionSpiritualEducation>
            label="Духовное образование"
            options={entries(UNION_SPIRITUAL_EDUCATION_LABELS)}
            value={draft.spiritualEducation ?? null}
            onChange={(value) => update('spiritualEducation', value)}
          />
          <ChoiceChips<UnionHousing>
            label="Жилищные условия"
            options={entries(UNION_HOUSING_LABELS)}
            value={draft.housing ?? null}
            onChange={(value) => update('housing', value)}
          />
          <ChoiceChips<UnionIncomeLevel>
            label="Материальная обеспеченность"
            hint="Поле необязательное: можно не указывать вовсе."
            options={entries(UNION_INCOME_LABELS)}
            value={draft.income ?? null}
            onChange={(value) => update('income', value)}
          />
          <PortalFieldRow
            label="Знание языков"
            value={listValue(draft.languages ?? [])}
            empty="Не указаны — языки меняются в профиле на сайте"
          />
          <TagChips
            label="Домашние животные"
            options={UNION_PET_OPTIONS}
            selected={draft.pets ?? []}
            onToggle={(value) => toggleListTag('pets', value)}
          >
            {tagInput('pets', 'Свой вариант, например: кролик', UNION_PET_OPTIONS)}
          </TagChips>
        </ProfileSection>

        <ProfileSection title="Интересы и навыки">
          <TagChips
            label="Интересы"
            hint="Участвуют в расчёте совместимости."
            options={UNION_INTEREST_OPTIONS}
            selected={draft.interests ?? []}
            onToggle={(value) => toggleListTag('interests', value)}
          >
            {tagInput('interests', 'Свой интерес', UNION_INTEREST_OPTIONS)}
          </TagChips>
          <TagChips
            label="Ценности"
            hint="Участвуют в расчёте совместимости."
            options={UNION_VALUE_OPTIONS}
            selected={draft.values ?? []}
            onToggle={(value) => toggleListTag('values', value)}
          >
            {tagInput('values', 'Своя ценность', UNION_VALUE_OPTIONS)}
          </TagChips>
          <TagChips
            label="Навыки"
            options={UNION_SKILL_CATEGORIES}
            selected={draft.skills ?? []}
            onToggle={(value) => toggleListTag('skills', value)}
          >
            {tagInput('skills', 'Свой навык', allSkills)}
          </TagChips>
        </ProfileSection>

        <ProfileSection title="Общение и приватность">
          <ChoiceChips<UnionFormat>
            label="Формат общения"
            options={entries(FORMAT_LABELS)}
            value={draft.format ?? 'any'}
            allowEmpty={false}
            onChange={(value) => update('format', value ?? 'any')}
          />
          <CheckRow label="Готов(а) к переезду" checked={draft.relocationReady ?? false} onChange={(value) => update('relocationReady', value)} />
          <CheckRow label="Показывать анкету в подборе" checked={draft.isActive} onChange={(value) => update('isActive', value)} />
          {!draft.isActive ? (
            <Text style={[styles.hint, { color: colors.text1 }]}>
              Анкета исчезнет из подбора, но существующие связи и переписки останутся.
            </Text>
          ) : null}
          <CheckRow
            label="Показывать анкету на публичной странице Знакомств"
            checked={draft.showcaseOptIn}
            onChange={(value) => update('showcaseOptIn', value)}
          />
          <Text style={[styles.hint, { color: colors.text1 }]}>
            Страницу сервиса видят гости и поисковики — без входа на портал. На неё попадают только фото,
            проверенные администрацией, и только поля, открытые «всем». Галочку можно снять в любой момент.
          </Text>
          <CheckRow
            label="Принимать запросы только от подтверждённых администрацией"
            checked={draft.requestsFromVerifiedOnly}
            onChange={(value) => update('requestsFromVerifiedOnly', value)}
          />
          <Text style={[styles.hint, { color: colors.text1 }]}>
            Анкета остаётся в подборе, но отправить вам запрос смогут только те, у кого значок «Проверен». Уже
            существующие связи и переписки останутся.
          </Text>
          <ChoiceChips<UnionContactMode>
            label="Кто может со мной связаться"
            hint={contactModeHint(draft.contactMode)}
            options={entries(CONTACT_MODE_LABELS)}
            value={draft.contactMode}
            allowEmpty={false}
            onChange={(value) => update('contactMode', value ?? 'requests')}
          />
          <Text accessibilityRole="header" style={[styles.subTitle, { color: colors.text0 }]}>
            Что видно другим
          </Text>
          {PRIVACY_FIELDS.map(([key, label]) => (
            <ChoiceChips<UnionVisibilityLevel>
              key={key}
              label={label}
              options={entries(PRIVACY_LABELS)}
              value={draft.privacy[key] ?? 'everyone'}
              allowEmpty={false}
              onChange={(value) => update('privacy', { ...draft.privacy, [key]: value ?? 'everyone' })}
            />
          ))}
        </ProfileSection>

        {error ? (
          <View style={styles.padded}>
            <InlineError message={error} />
          </View>
        ) : null}

        <View style={styles.padded}>
          {created ? (
            <View style={styles.finalButtons}>
              <UnionButton label="Смотреть анкеты" onPress={() => router.replace('/union/recommendations')} />
              <UnionButton
                kind="secondary"
                label="Как меня видят"
                accessibilityHint="Открывает вашу анкету так, как её видят другие"
                onPress={() => router.push({ pathname: '/union/users/[id]', params: { id: loaded.me.id } })}
              />
            </View>
          ) : (
            <UnionButton
              label="Создать анкету"
              busy={saveState === 'saving'}
              disabled={!sumOk}
              onPress={() => void create()}
            />
          )}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 14 },
  welcome: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    overflow: 'hidden',
  },
  progress: { marginHorizontal: 16, borderWidth: 1, borderRadius: radius.md, padding: 14, gap: 8 },
  progressHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  progressTitle: { fontFamily: fonts.bodyBold, fontSize: 15 },
  saveState: { fontFamily: fonts.body, fontSize: 12 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  field: { gap: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  input: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  subTitle: { fontFamily: fonts.bodyBold, fontSize: 15 },
  padded: { paddingHorizontal: 16 },
  finalButtons: { gap: 10 },
});
