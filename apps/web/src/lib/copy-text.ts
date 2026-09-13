/**
 * Копирование текста в буфер обмена — одно на весь портал.
 *
 * `navigator.clipboard.writeText` отказывает чаще, чем кажется: во встроенных
 * браузерах приложений (Telegram, VK, Яндекс), в окнах без разрешения на
 * запись, на старых телефонах его нет вовсе. Раньше каждая кнопка
 * «Скопировать» в таком случае молчала. Теперь при отказе копируем старым
 * способом — через скрытое поле и `execCommand("copy")`: он устарел, но
 * работает там, где новый закрыт.
 *
 * Никогда не бросает: `true` — скопировано, `false` — не вышло ни так, ни так,
 * и кнопке пора сказать об этом человеку.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Отказ — не конец: ниже старый способ.
  }
  return copyWithSelection(text);
}

/**
 * Старый способ: текст кладётся в невидимое поле, выделяется и копируется
 * как выделение. Фокус возвращается туда, где был, — иначе после нажатия
 * «Скопировать» клавиатура теряла бы место на странице.
 */
function copyWithSelection(text: string): boolean {
  if (typeof document === "undefined") return false;
  if (typeof document.execCommand !== "function") return false;

  const previousFocus = document.activeElement as HTMLElement | null;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  // Вне потока и невидимо, но не `display: none` — такое поле не выделить.
  // 16px — чтобы iOS не увеличивал страницу, фокусируя поле.
  Object.assign(field.style, {
    position: "fixed",
    top: "0",
    left: "0",
    opacity: "0",
    fontSize: "16px",
    pointerEvents: "none",
  });
  document.body.appendChild(field);

  let copied = false;
  try {
    field.focus();
    field.select();
    field.setSelectionRange(0, text.length);
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    field.remove();
    previousFocus?.focus?.();
  }
  return copied;
}
