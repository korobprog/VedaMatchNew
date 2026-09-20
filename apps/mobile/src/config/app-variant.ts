import Constants from 'expo-constants';
import { TurboModuleRegistry } from 'react-native';
import { capabilitiesFor, type AppCapabilities } from './capabilities';
import { devApiOrigin } from './dev-origin';
import { PRODUCTION_API_ORIGINS, type AppVariant } from './variant';

/**
 * Вариант, вычисленный при сборке в `app.config.ts`. В рантайме переменных
 * окружения нет: всё, что нужно приложению, заранее кладётся в `extra`.
 * В отладочной сборке адрес API берётся с машины, где запущен Metro.
 */
export function appVariant(): AppVariant {
  const variant = Constants.expoConfig?.extra?.variant as AppVariant | undefined;
  if (!variant) {
    throw new Error('В сборке нет extra.variant: приложение собрано без app.config.ts');
  }
  if (!__DEV__) return variant;
  // Адрес бандла: в новой архитектуре NativeModules.SourceCode пуст, модуль
  // читается из реестра TurboModule напрямую.
  const sourceCode = TurboModuleRegistry.get<{ getConstants(): { scriptURL: string } }>('SourceCode');
  const scriptUrl = sourceCode?.getConstants().scriptURL;
  return { ...variant, apiOrigin: devApiOrigin(scriptUrl, variant.apiOrigin, PRODUCTION_API_ORIGINS) };
}

/**
 * Возможности этой сборки (VED-207) — единственный способ спросить в рантайме
 * «можно ли здесь самообновление / оплата / ссылка на платный раздел».
 * Считается из канала таблицей `capabilities.ts`, а не хранится в `extra`
 * отдельным полем: два источника одного ответа рано или поздно разойдутся.
 */
export function appCapabilities(): AppCapabilities {
  return capabilitiesFor(appVariant());
}
