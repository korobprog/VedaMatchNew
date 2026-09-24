import Svg, { Path, Rect } from 'react-native-svg';

/**
 * Значки плеера Медиатеки (VED-331). Декоративные: смысл несут подписи
 * кнопок для скринридера, поэтому сами значки из дерева доступности убраны.
 * Сетка 24 — как у значков вкладок (`tab-icon.tsx`).
 */
const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no' as const };

export function PlayGlyph({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill={color} />
    </Svg>
  );
}

export function PauseGlyph({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Rect x={6} y={5} width={4} height={14} rx={1} fill={color} />
      <Rect x={14} y={5} width={4} height={14} rx={1} fill={color} />
    </Svg>
  );
}

/** Круговая стрелка с «10» — как в шторке Android. `forward` — по часовой. */
export function SkipGlyph({ color, forward, size = 28 }: { color: string; forward: boolean; size?: number }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      {forward ? (
        <>
          <Path d="M20 12a8 8 0 1 1-2.34-5.66" {...stroke} />
          <Path d="M20 4v4h-4" {...stroke} />
        </>
      ) : (
        <>
          <Path d="M4 12a8 8 0 1 0 2.34-5.66" {...stroke} />
          <Path d="M4 4v4h4" {...stroke} />
        </>
      )}
      <Path d="M9.5 10v5" {...stroke} strokeWidth={1.6} />
      <Path d="M12.5 10h2v5h-2z" {...stroke} strokeWidth={1.6} />
    </Svg>
  );
}

export function CloseGlyph({ color, size = 20 }: { color: string; size?: number }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path d="M6 6l12 12M18 6L6 18" {...stroke} />
    </Svg>
  );
}

export function ChevronDownGlyph({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** Нота — заглушка обложки, когда её нет ни у записи, ни у альбома. */
export function NoteGlyph({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hidden}>
      <Path
        d="M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
