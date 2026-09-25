import type { UnionBoostStatus } from '@vedamatch/shared';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { InlineError } from '@/components/inline-error';
import { confirmTap } from '@/lib/feedback';
import type { UnionApi } from '@/lib/union/union-api';
import { describeUnionError } from '@/lib/union/union-error';
import { boostDescription, formatBoostLeft, tickBoost } from '@/lib/union/union-extras';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { dark, fonts, hitTarget, radius } from '@/theme/tokens';
import { BoltIcon } from './union-icons';

/**
 * «Внимание»: пока включено, анкета показывается раньше остальных
 * (`union-boost-button.tsx` сайта). Кнопка — над колодой, состояние берётся
 * с сервера: отсчёт должен пережить перезапуск приложения.
 *
 * Почему без проверки канала сборки: пока проект в бете «Внимание»
 * бесплатное (`union-boost.service.ts`), цены у него нет ни на сервере, ни
 * здесь, и призывать платить не к чему. Когда оно станет платным, эта кнопка
 * встаёт под `inAppPayments` из `config/capabilities.ts`.
 */
export function BoostButton({ unionApi }: { unionApi: UnionApi }) {
  const { colors } = useTheme();
  const [status, setStatus] = useState<UnionBoostStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    unionApi
      .boostStatus()
      .then((value) => {
        if (alive) setStatus(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [unionApi]);

  // Локальный отсчёт: дёргать сервер раз в секунду ради таймера незачем.
  const active = status?.active === true;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setStatus((current) => (current ? tickBoost(current) : current)), 1000);
    return () => clearInterval(timer);
  }, [active]);

  const activate = useCallback(async () => {
    if (busy) return;
    confirmTap();
    setBusy(true);
    setError(null);
    try {
      setStatus(await unionApi.activateBoost());
      setOpen(false);
    } catch (e) {
      setError(describeUnionError(e, 'Не удалось включить «Внимание».'));
    } finally {
      setBusy(false);
    }
  }, [busy, unionApi]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          active ? `«Внимание» включено, осталось ${formatBoostLeft(status?.secondsLeft ?? 0)}` : 'Включить «Внимание»'
        }
        onPress={() => setOpen(true)}
        android_ripple={ripple(dark.glassBorder, true)}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: active ? dark.gold : dark.scrim },
          pressedStyle(pressed),
        ]}
      >
        <BoltIcon color={active ? dark.onAccent : dark.gold} />
        {active ? (
          <Text style={[styles.left, { color: dark.onAccent }]}>{formatBoostLeft(status?.secondsLeft ?? 0)}</Text>
        ) : null}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.wrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={() => setOpen(false)}
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
          />
          <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.bg1, borderColor: colors.glassBorder }]}>
            <View style={[styles.badge, { backgroundColor: colors.bg2 }]}>
              <BoltIcon color={colors.warning} size={28} />
            </View>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
              Внимание
            </Text>
            <Text style={[styles.text, { color: colors.text1 }]}>{boostDescription(status)}</Text>
            {error ? <InlineError message={error} /> : null}
            {active ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setOpen(false)}
                android_ripple={ripple(colors.glassBorder)}
                style={({ pressed }) => [styles.action, { borderColor: colors.glassBorder, borderWidth: 1 }, pressedStyle(pressed)]}
              >
                <Text style={[styles.actionText, { color: colors.text0 }]}>Понятно</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy, disabled: busy }}
                disabled={busy}
                onPress={() => void activate()}
                android_ripple={ripple(colors.glassBorder)}
                style={({ pressed }) => [styles.action, { backgroundColor: colors.magenta }, busy ? styles.busy : pressedStyle(pressed)]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={[styles.actionText, { color: colors.onAccent }]}>Включить «Внимание»</Text>
                )}
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: hitTarget,
    minWidth: hitTarget,
    borderRadius: hitTarget / 2,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  left: { fontFamily: fonts.monoSemiBold, fontSize: 14 },
  wrap: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  sheet: { borderRadius: 24, borderWidth: 1, padding: 24, gap: 12, alignItems: 'stretch' },
  badge: { alignSelf: 'center', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.displayBold, fontSize: 20, textAlign: 'center' },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  action: {
    minHeight: hitTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  actionText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  busy: { opacity: 0.6 },
});
