import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShareView } from "./share-view";

/**
 * VED-357: «Пожалуйста, исключи любой дубляж текста при отображении рилса во
 * время пересылки».
 *
 * У афоризма источник («Бхагавад-гита 2.63») стоял в двух местах сразу: в теле
 * сообщения, которое собирает этот экран, и заголовком превью ссылки, который
 * ставит `buildShareMeta()` у сервиса. В WhatsApp и Telegram человек видел обе
 * копии рядом. Заголовок превью информативен и нужен — значит, лишняя копия та,
 * что в тексте.
 */
const POST = {
  text: "Гнев порождает полное заблуждение.",
  source: "Бхагавад-гита 2.63",
  link: "https://vedamatch.ru/m/reel-a",
};

/** Текст, который уедет в мессенджер: он спрятан в адресе кнопки. */
function outgoingText(label: string): string {
  const href = screen.getByRole("link", { name: label }).getAttribute("href") ?? "";
  const query = new URL(href, "https://vedamatch.ru").searchParams;
  // Telegram и ВКонтакте принимают текст отдельным полем, WhatsApp и Max —
  // одной строкой, где ссылка идёт последней.
  return query.get("text") ?? query.get("title") ?? "";
}

describe("ShareView и дубляж источника", () => {
  it("источник стоит заголовком превью — в тексте сообщения его нет", () => {
    render(
      <ShareView
        {...POST}
        sourceInPreview
        previewUrl={null}
        filePath={null}
        chatHref={null}
      />,
    );

    for (const label of ["Telegram", "WhatsApp", "Max", "ВКонтакте"]) {
      const text = outgoingText(label);
      expect(text).toContain(POST.text);
      expect(text).not.toContain(POST.source);
    }
  });

  it("но на самом экране источник виден — превью тут нет", () => {
    render(
      <ShareView
        {...POST}
        sourceInPreview
        previewUrl={null}
        filePath={null}
        chatHref={null}
      />,
    );

    expect(screen.getByText(POST.source)).toBeInTheDocument();
  });

  it("без пометки всё как было: источник идёт подписью в сообщении", () => {
    // Умолчание важно: экран портальный, и другие сервисы на него ссылаются
    // без этого параметра — их заголовок превью источник не повторяет.
    render(
      <ShareView {...POST} previewUrl={null} filePath={null} chatHref={null} />,
    );

    expect(outgoingText("Telegram")).toContain(POST.source);
  });
});
