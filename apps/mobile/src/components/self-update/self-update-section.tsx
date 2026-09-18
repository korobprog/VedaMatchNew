import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { InlineError } from '@/components/inline-error';
import { RetryButton } from '@/components/retry-button';
import { checkFailureText } from '@/lib/self-update/check-messages';
import { isDownloadActive } from '@/lib/self-update/download-progress-state';
import { formatApkSizeMb, formatBuildDate, percentOf } from '@/lib/self-update/format';
import type { AppManifest } from '@/lib/self-update/manifest-validation';
import { useSelfUpdate } from '@/lib/self-update/use-self-update';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Секция «Проверить обновление» блока профиля вкладки «Сервисы» (VED-176).
 * Только канал `site` — родитель (`app/(tabs)/services.tsx`) вообще не
 * рендерит этот компонент на канале `store` (критерий приёмки №1: пункт не
 * «отключён», компонент не монтируется). Одна раскрывающаяся строка в
 * стиле `styles.accountLink`, без отдельного экрана навигации.
 *
 * Строка — действие «Проверить», а не раскрывашка: повторный тап заново
 * проверяет (и снимает «Не сейчас»). Тело секции видно, как только есть что
 * показать — после ручной проверки или если тихая проверка при открытии
 * вкладки нашла доступное обновление.
 */
export function SelfUpdateSection() {
  const { colors } = useTheme();
  const update = useSelfUpdate();

  const busy = update.checkState.kind === 'checking';
  const downloadBusy = isDownloadActive(update.downloadState.phase);

  const onPressRow = useCallback(() => {
    if (!downloadBusy) void update.checkForUpdate();
  }, [downloadBusy, update]);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={onPressRow}
        android_ripple={ripple(colors.glassBorder)}
        style={({ pressed }) => [
          styles.row,
          { borderColor: colors.glassBorder, backgroundColor: colors.glass },
          pressedStyle(pressed),
        ]}
      >
        <Text style={[styles.rowText, { color: colors.text0 }]}>Проверить обновление</Text>
        {busy ? <ActivityIndicator color={colors.text1} /> : <Text style={[styles.rowArrow, { color: colors.text1 }]}>›</Text>}
      </Pressable>

      <SelfUpdateBody update={update} />
    </View>
  );
}

function SelfUpdateBody({ update }: { update: ReturnType<typeof useSelfUpdate> }) {
  const { colors } = useTheme();
  const { checkState, downloadState } = update;

  if (checkState.kind === 'idle' || checkState.kind === 'checking') return null;

  if (checkState.kind === 'check-error') {
    const failure = checkFailureText(checkState.reason);
    return (
      <View style={styles.panel}>
        <InlineError message={failure.message} />
        {failure.retryable ? <RetryButton onPress={() => void update.checkForUpdate()} /> : null}
      </View>
    );
  }

  const { decision } = checkState;

  if (decision.kind === 'hidden') return null;

  if (decision.kind === 'up-to-date') {
    return (
      <View style={styles.panel}>
        <Text accessibilityLiveRegion="polite" style={[styles.info, { color: colors.text1 }]}>
          Установлена последняя версия.
        </Text>
      </View>
    );
  }

  if (decision.kind === 'dismissed') {
    return (
      <View style={styles.panel}>
        <Text accessibilityLiveRegion="polite" style={[styles.info, { color: colors.text1 }]}>
          Обновление {decision.manifest.versionName} отложено. Можно проверить ещё раз.
        </Text>
        <RetryButton label="Проверить ещё раз" onPress={() => void update.checkForUpdate()} />
      </View>
    );
  }

  // decision.kind === 'available'
  return <AvailableUpdate manifest={decision.manifest} update={update} downloadState={downloadState} />;
}

function AvailableUpdate({
  manifest,
  update,
  downloadState,
}: {
  manifest: AppManifest;
  update: ReturnType<typeof useSelfUpdate>;
  downloadState: ReturnType<typeof useSelfUpdate>['downloadState'];
}) {
  const { colors } = useTheme();

  if (downloadState.phase === 'idle' || downloadState.phase === 'cancelled') {
    return (
      <View style={[styles.panel, styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
        <Text accessibilityLiveRegion="polite" style={[styles.cardTitle, { color: colors.text0 }]}>
          Доступно обновление {manifest.versionName}
        </Text>
        <Text style={[styles.cardMeta, { color: colors.text1 }]}>
          {formatApkSizeMb(manifest.sizeBytes)} · собрано {formatBuildDate(manifest.builtAt)}
        </Text>
        {downloadState.phase === 'cancelled' ? (
          <Text style={[styles.info, { color: colors.text1 }]}>Скачивание отменено.</Text>
        ) : null}
        <View style={styles.cardButtons}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void update.beginDownload(manifest)}
            android_ripple={ripple(colors.onAccent)}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.magenta }, pressedStyle(pressed)]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>Скачать</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void update.dismiss(manifest)}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text0 }]}>Не сейчас</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (downloadState.phase === 'confirm-metered') {
    return (
      <View style={[styles.panel, styles.card, { borderColor: colors.gold, backgroundColor: colors.bg1 }]}>
        <Text style={[styles.cardTitle, { color: colors.text0 }]}>
          Скачивание по мобильному интернету, {formatApkSizeMb(manifest.sizeBytes)}. Продолжить?
        </Text>
        <View style={styles.cardButtons}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void update.confirmMeteredDownload()}
            android_ripple={ripple(colors.onAccent)}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.magenta }, pressedStyle(pressed)]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>Продолжить</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void update.cancelDownload()}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text0 }]}>Отмена</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (downloadState.phase === 'downloading' || downloadState.phase === 'verifying') {
    const verifying = downloadState.phase === 'verifying';
    const percent = verifying
      ? percentOf(downloadState.bytesVerified, downloadState.totalBytes || manifest.sizeBytes)
      : percentOf(downloadState.bytesWritten, downloadState.totalBytes);
    const label = verifying ? `Проверяем файл… ${percent} %` : `Скачано ${percent} %`;
    return (
      <View style={styles.panel}>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={verifying ? 'Проверка файла' : 'Скачивание обновления'}
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          style={[styles.progressTrack, { backgroundColor: colors.bg2 }]}
        >
          <View
            style={[
              styles.progressFill,
              { width: `${percent}%`, backgroundColor: verifying ? colors.cyan : colors.magenta },
            ]}
          />
        </View>
        <Text accessibilityLiveRegion="polite" style={[styles.info, { color: colors.text1 }]}>
          {label}
        </Text>
        <RetryButton label="Отмена" onPress={() => void update.cancelDownload()} />
      </View>
    );
  }

  if (downloadState.phase === 'ready') {
    return (
      <View style={[styles.panel, styles.card, { borderColor: colors.cyan, backgroundColor: colors.bg1 }]}>
        <Text accessibilityLiveRegion="polite" style={[styles.cardTitle, { color: colors.text0 }]}>
          Файл проверен, готов к установке.
        </Text>
        <Text style={[styles.cardMeta, { color: colors.text1 }]}>
          Система спросит разрешение установить приложение — это ожидаемо.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void update.installNow()}
          android_ripple={ripple(colors.onAccent)}
          style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.magenta }, pressedStyle(pressed)]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>Установить</Text>
        </Pressable>
      </View>
    );
  }

  if (downloadState.phase === 'installing') {
    return (
      <View style={styles.panel}>
        <View style={styles.verifyingRow}>
          <ActivityIndicator color={colors.text1} />
          <Text style={[styles.info, { color: colors.text1 }]}>Открываем системный установщик…</Text>
        </View>
      </View>
    );
  }

  // downloadState.phase === 'error'
  return (
    <View style={styles.panel}>
      <InlineError message={downloadState.errorMessage ?? 'Не удалось скачать обновление.'} />
      <RetryButton onPress={() => void update.retryDownload()} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  rowText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  rowArrow: { fontFamily: fonts.body, fontSize: 20 },
  panel: { gap: 10 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: 16, gap: 10 },
  cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 20 },
  cardMeta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  cardButtons: { flexDirection: 'row', gap: 10 },
  info: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  primaryButton: {
    minHeight: hitTarget,
    borderRadius: radius.sm,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primaryButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  secondaryButton: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  secondaryButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  verifyingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
