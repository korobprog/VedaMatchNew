export type AstroCompatibilityStatus = 'pending' | 'accepted' | 'declined';

/** Один из восьми критериев гуна-милана. Порядок — по традиционному весу, 1..8. */
export type GunaMilanKootaKey =
  | 'temperament'
  | 'vashya'
  | 'tara'
  | 'yoni'
  | 'grahaMaitri'
  | 'gana'
  | 'bhakoot'
  | 'nadi';

export interface GunaMilanKoota {
  key: GunaMilanKootaKey;
  title: string;
  /** Набранные очки. */
  points: number;
  /** Максимум для этого критерия. */
  maxPoints: number;
  /** Короткое человекочитаемое объяснение конкретно этого результата. */
  note: string;
}

export interface GunaMilanScore {
  kootas: GunaMilanKoota[];
  totalPoints: number;
  /** Сумма maxPoints — 36 по традиции. */
  maxPoints: number;
  /** points/maxPoints, для прогресс-бара в интерфейсе. */
  percent: number;
}

/**
 * Только имя и аватар — то, что и так видно в Union. Знак и накшатра Луны
 * собеседника сюда сознательно не входят: именно это согласие и защищает,
 * раскрывать часть чужой карты до принятия запроса нельзя.
 */
export interface AstroCompatibilitySummary {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface AstroCompatibilityRequestDto {
  id: string;
  status: AstroCompatibilityStatus;
  createdAt: string;
  respondedAt: string | null;
  /** Собеседник: тот, кто не текущий пользователь. */
  counterpart: AstroCompatibilitySummary;
  /** true — текущий пользователь отправил запрос; false — получил. */
  isRequester: boolean;
  /** Заполнено только когда status === 'accepted'. */
  score: GunaMilanScore | null;
}

export interface CreateAstroCompatibilityRequest {
  targetUserId: string;
}

export interface RespondAstroCompatibilityRequest {
  accept: boolean;
}

export interface AstroCompatibilityReadingDto {
  text: string | null;
  available: boolean;
  blockedBy: 'quota_exhausted' | 'ai_unavailable' | null;
}
