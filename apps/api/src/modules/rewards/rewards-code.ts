/**
 * Реферальный код. Не `userId`: тот попадает в ссылку, живёт вечно и по нему
 * можно ходить в API за чужим профилем. Код короткий, читается вслух и
 * диктуется по телефону, поэтому из алфавита выброшены пары, которые путают
 * в рукописи и в шрифтах без засечек: `0`/`O`, `1`/`I`/`L`, `5`/`S`, `8`/`B`,
 * `2`/`Z`.
 */
export const REWARDS_CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';

/**
 * Длина кода. Семь символов из 25-буквенного алфавита — это 6·10^9 вариантов:
 * коллизия на портале любого обозримого размера остаётся событием, которое
 * достаточно пережить одной повторной генерацией.
 */
export const REWARDS_CODE_LENGTH = 7;

/**
 * Код из источника случайности. Байты приходят снаружи (`randomBytes`), чтобы
 * функция оставалась чистой и проверяемой.
 *
 * Байт больше 250 отбрасывается, а не берётся по модулю: `256 % 25 = 6`,
 * и модуль сделал бы первые шесть букв алфавита чаще остальных.
 */
export function generateReferralCode(bytes: Uint8Array): string {
  const limit =
    Math.floor(256 / REWARDS_CODE_ALPHABET.length) *
    REWARDS_CODE_ALPHABET.length;
  let code = '';
  for (const byte of bytes) {
    if (byte >= limit) continue;
    code += REWARDS_CODE_ALPHABET[byte % REWARDS_CODE_ALPHABET.length];
    if (code.length === REWARDS_CODE_LENGTH) return code;
  }
  throw new Error('Недостаточно случайных байтов для реферального кода');
}

/**
 * Сколько байт запрашивать, чтобы кода хватило почти наверняка. С запасом
 * вдвое: доля отбрасываемых байт — 6/256, и вероятность не набрать длину
 * пренебрежимо мала.
 */
export const REWARDS_CODE_BYTES = REWARDS_CODE_LENGTH * 2;

/**
 * Код из пользовательского ввода (ссылка, cookie, ручной ввод) в
 * канонический вид. `null` — это не код: искать его в базе бессмысленно,
 * а запрос с мусором не должен доходить до Postgres.
 *
 * Регистр не значим, дефисы и пробелы человек добавляет сам при диктовке.
 * Символ вне алфавита — отказ, а не замена похожим: угадав неверно, мы
 * привязали бы приглашённого к чужому пригласившему.
 */
export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/[\s-]/g, '').toUpperCase();
  if (cleaned.length !== REWARDS_CODE_LENGTH) return null;
  for (const char of cleaned) {
    if (!REWARDS_CODE_ALPHABET.includes(char)) return null;
  }
  return cleaned;
}
