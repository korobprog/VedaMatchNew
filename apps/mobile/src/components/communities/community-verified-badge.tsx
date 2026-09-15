import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/theme';

/**
 * Значок подтверждённой общины — кружок `cyan` с галочкой, тот же приём, что
 * у значка «Преданный подтверждён» (`components/verified-badge.tsx`), но со
 * своей подписью: там речь о человеке, здесь — об общине, слова из значка
 * человека сюда не подходят (перенос смысла `community-badge.tsx` сайта,
 * `BadgeCheck`/«Община подтверждена»). Пара цветов (иконка `bg0` на кружке
 * `cyan`) уже проверена в `contrast.spec.ts` для значка человека — цвета те
 * же, повторно заводить пару не нужно.
 */
export function CommunityVerifiedBadge() {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel="Община подтверждена администрацией"
      style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cyan }}
    >
      <View importantForAccessibility="no">
        <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={colors.bg0} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <Path d="m9 12 2 2 4-4" />
        </Svg>
      </View>
    </View>
  );
}
