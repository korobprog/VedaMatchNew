import * as IntentLauncher from 'expo-intent-launcher';
import { contentUriOf } from './apk-downloader';

/**
 * Открывает системный установщик Android (VED-176) — единственный
 * допустимый способ поставить APK, скачанный вручную (не через
 * `Linking.openURL('file://...')`, который на Android 8+ либо не сработает,
 * либо потребует опасный `FileUriExposedException`-путь). Проверяется
 * только на телефоне (реальный `FileProvider` и системный диалог jest-expo
 * не эмулирует).
 */
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const APK_MIME_TYPE = 'application/vnd.android.package-archive';
/**
 * `expo-intent-launcher`'s `ActivityAction` enum содержит только константы
 * экранов настроек (`Settings.ACTION_*`) — самого действия установки пакета
 * там нет, `startActivityAsync` принимает и обычную строку действия intent.
 */
const ACTION_INSTALL_PACKAGE = 'android.intent.action.INSTALL_PACKAGE';

export async function openSystemInstaller(localUri: string): Promise<void> {
  const contentUri = await contentUriOf(localUri);
  await IntentLauncher.startActivityAsync(ACTION_INSTALL_PACKAGE, {
    data: contentUri,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
    type: APK_MIME_TYPE,
  });
}
