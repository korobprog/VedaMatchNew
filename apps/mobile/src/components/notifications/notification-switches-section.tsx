import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import type { NotificationPreferencesDto } from '@vedamatch/shared';
import { useSession } from '@/lib/auth/session';
import { createNotificationPreferencesApi } from '@/lib/notifications/notification-preferences-api';
import {
  notificationSwitchCopy,
  notificationSwitchValues,
  notificationSwitchesHint,
  type NotificationSwitchKey,
} from '@/lib/notifications/notification-switch-copy';
import { useTheme } from '@/theme/theme';
import { fonts, radius } from '@/theme/tokens';

/**
 * «О чём уведомлять» на экране «Аккаунт»: два тумблера — «Сообщения» и
 * «Звонки» (VED-361).
 *
 * Раньше тумблеры категорий жили только на сайте, а звонок вообще не имел
 * своего: он шёл категорией «Сообщения», и человек, заглушивший болтливую
 * переписку, переставал узнавать о вызовах. Теперь выключатель у звонков
 * свой, и до него можно дотянуться там же, где человек читает про доставку
 * на этот телефон, — остальные категории по-прежнему на сайте, тащить весь
 * список в приложение незачем.
 *
 * Формулировки — в чистом `notification-switch-copy.ts` со своим тестом:
 * обещание «звонки продолжат звонить» проверяется вместе с правилом, которое
 * его исполняет.
 */
export function NotificationSwitchesSection() {
  const { colors } = useTheme();
  const { api } = useSession();
  const preferencesApi = useMemo(
    () => createNotificationPreferencesApi(api),
    [api],
  );

  const [preferences, setPreferences] =
    useState<NotificationPreferencesDto | null>(null);
  const [busy, setBusy] = useState<NotificationSwitchKey | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void preferencesApi
      .load()
      .then((loaded) => {
        if (!cancelled) setPreferences(loaded);
      })
      .catch(() => {
        // Молчание сервера раздел не рисует вовсе: обещать «всё включено»,
        // не спросив, — то же враньё, от которого заведена вся карточка.
        if (!cancelled) setProblem('Не удалось загрузить настройки уведомлений.');
      });
    return () => {
      cancelled = true;
    };
  }, [preferencesApi]);

  const toggle = useCallback(
    async (key: NotificationSwitchKey, next: boolean) => {
      if (!preferences) return;
      setBusy(key);
      // Тумблер двигается сразу: ждать ответа сервера, глядя на неподвижный
      // переключатель, человек не станет — он нажмёт ещё раз.
      setPreferences({ ...preferences, [key]: next });
      try {
        setPreferences(await preferencesApi.save({ [key]: next }));
        setProblem(null);
      } catch {
        setPreferences(preferences);
        setProblem('Не удалось сохранить. Попробуйте ещё раз.');
      } finally {
        setBusy(null);
      }
    },
    [preferences, preferencesApi],
  );

  if (!preferences) {
    return problem ? (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text1 }]}>
          О чём уведомлять
        </Text>
        <Text
          accessibilityRole="alert"
          style={[styles.note, { color: colors.magenta }]}
        >
          {problem}
        </Text>
      </View>
    ) : null;
  }

  // Не `preferences` напрямую: сервер старше этой сборки поля `calls` не
  // пришлёт вовсе, и тумблер показал бы выключённые звонки вместо правды.
  const values = notificationSwitchValues(preferences);
  const rows = notificationSwitchCopy(values);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text1 }]}>
        О чём уведомлять
      </Text>
      {/* Состояние общего выключателя несёт слово, а не приглушённый цвет:
          серый текст роняет контраст ниже 4.5:1, а `disabled` у самих
          тумблеров и так виден. */}
      <Text style={[styles.hint, { color: colors.text1 }]}>
        {notificationSwitchesHint(preferences.enabled)}
      </Text>
      {rows.map((row) => (
        <View
          key={row.key}
          style={[
            styles.row,
            { borderColor: colors.glassBorder, backgroundColor: colors.glass },
          ]}
        >
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: colors.text0 }]}>
              {row.label}
            </Text>
            <Text style={[styles.rowNote, { color: colors.text1 }]}>
              {row.note}
            </Text>
          </View>
          <Switch
            accessibilityRole="switch"
            accessibilityLabel={row.accessibilityLabel}
            accessibilityHint={row.note}
            accessibilityState={{
              disabled: !preferences.enabled || busy === row.key,
              checked: values[row.key],
            }}
            disabled={!preferences.enabled || busy === row.key}
            value={values[row.key]}
            onValueChange={(next) => void toggle(row.key, next)}
            trackColor={{ false: colors.glassBorder, true: colors.cyan }}
            thumbColor={colors.onAccent}
          />
        </View>
      ))}
      {problem ? (
        <Text
          accessibilityRole="alert"
          style={[styles.note, { color: colors.magenta }]}
        >
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginTop: 4 },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 14,
  },
  rowText: { flex: 1, gap: 4 },
  rowLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  rowNote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
});
