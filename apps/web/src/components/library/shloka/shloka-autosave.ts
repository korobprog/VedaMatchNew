import { draftKey, type AcharyaDraft, type ShlokaDraft } from "./shloka-draft";

/**
 * Черновик формы шлоки в браузере (VED-466): «Когда уходишь в другое окно из
 * редактуры Шлоки, а потом возвращаешься, все заполненные поля исчезают».
 *
 * Хранится только текст. Выбранные картинки — это файлы в памяти вкладки, в
 * хранилище их не положить; при возврате их придётся выбрать заново, а уже
 * сохранённые картинки шлоки приходят с сервера как были.
 */

const PREFIX = "vedamatch:shloka-draft:";

/** Черновики старше недели не поднимаем: это уже не «вышел и вернулся». */
export const AUTOSAVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AutosaveTarget =
  | { kind: "create"; categoryId: string }
  | { kind: "edit"; shlokaId: string };

export function autosaveKey(target: AutosaveTarget): string {
  return target.kind === "create"
    ? `${PREFIX}new:${target.categoryId}`
    : `${PREFIX}edit:${target.shlokaId}`;
}

type SavedAcharya = Omit<AcharyaDraft, "key" | "images">;

interface SavedDraft {
  savedAt: number;
  source: string;
  verse: string;
  text: string;
  translation: string;
  wordByWord: string;
  commentary: string;
  acharyas: SavedAcharya[];
}

export function serializeDraft(draft: ShlokaDraft, now: number): string {
  const saved: SavedDraft = {
    savedAt: now,
    source: draft.source,
    verse: draft.verse,
    text: draft.text,
    translation: draft.translation,
    wordByWord: draft.wordByWord,
    commentary: draft.commentary,
    acharyas: draft.acharyas.map((block) => ({
      id: block.id,
      acharya: block.acharya,
      text: block.text,
      translation: block.translation,
      wordByWord: block.wordByWord,
      commentary: block.commentary,
    })),
  };
  return JSON.stringify(saved);
}

const str = (value: unknown): string =>
  typeof value === "string" ? value : "";

/**
 * Сохранённый текст поверх исходного черновика. `null` — восстанавливать
 * нечего: записи нет, она битая или устарела.
 *
 * Картинки берутся из исходного черновика: у шлоки — как есть, у блока
 * ачарьи — по его id, у нового блока их нет.
 */
export function restoreDraft(
  base: ShlokaDraft,
  raw: string | null,
  now: number,
): ShlokaDraft | null {
  if (!raw) return null;
  let saved: Partial<SavedDraft>;
  try {
    saved = JSON.parse(raw) as Partial<SavedDraft>;
  } catch {
    return null;
  }
  if (!saved || typeof saved !== "object") return null;
  if (
    typeof saved.savedAt !== "number" ||
    now - saved.savedAt > AUTOSAVE_TTL_MS
  )
    return null;
  const baseImages = new Map(
    base.acharyas
      .filter((block) => block.id)
      .map((block) => [block.id as string, block.images]),
  );
  const acharyas = Array.isArray(saved.acharyas) ? saved.acharyas : [];
  return {
    ...base,
    source: str(saved.source),
    verse: str(saved.verse),
    text: str(saved.text),
    translation: str(saved.translation),
    wordByWord: str(saved.wordByWord),
    commentary: str(saved.commentary),
    acharyas: acharyas.map((block) => {
      const id = typeof block?.id === "string" && block.id ? block.id : null;
      return {
        key: draftKey("acharya"),
        id,
        acharya: str(block?.acharya),
        text: str(block?.text),
        translation: str(block?.translation),
        wordByWord: str(block?.wordByWord),
        commentary: str(block?.commentary),
        images: (id && baseImages.get(id)) || [],
      };
    }),
  };
}
