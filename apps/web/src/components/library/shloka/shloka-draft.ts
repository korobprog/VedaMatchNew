import {
  LIBRARY_SHLOKA_LIMITS,
  type CreateLibraryShlokaRequest,
  type LibraryShlokaDto,
  type LibraryShlokaImageDto,
} from "@vedamatch/shared";

/**
 * Черновик формы шлоки (VED-386) и то, как он превращается в запросы.
 *
 * Картинки нельзя отправить вместе с текстом: эндпоинту нужен id шлоки, а у
 * нового блока ачарьи — его id, которых до сохранения нет. Поэтому форма
 * копит картинки в черновике и после сохранения текста догружает новые и
 * снимает убранные. Чистая логика — здесь, под тестом.
 */

export type ImageDraft =
  | {
      kind: "existing";
      id: string;
      url: string;
      width: number | null;
      height: number | null;
      removed: boolean;
    }
  | { kind: "new"; key: string; file: File; previewUrl: string };

export interface AcharyaDraft {
  /** Ключ для React — у нового блока id ещё нет. */
  key: string;
  id: string | null;
  acharya: string;
  text: string;
  translation: string;
  wordByWord: string;
  commentary: string;
  images: ImageDraft[];
}

export interface ShlokaDraft {
  source: string;
  verse: string;
  text: string;
  translation: string;
  wordByWord: string;
  commentary: string;
  images: ImageDraft[];
  acharyas: AcharyaDraft[];
}

let keySeed = 0;
/** Ключ нового элемента черновика. Уникален в пределах вкладки. */
export function draftKey(prefix: string): string {
  keySeed += 1;
  return `${prefix}-${keySeed}`;
}

export function emptyDraft(source: string): ShlokaDraft {
  return {
    source,
    verse: "",
    text: "",
    translation: "",
    wordByWord: "",
    commentary: "",
    images: [],
    acharyas: [],
  };
}

function existing(image: LibraryShlokaImageDto): ImageDraft {
  return {
    kind: "existing",
    id: image.id,
    url: image.url,
    width: image.width,
    height: image.height,
    removed: false,
  };
}

export function draftFromShloka(shloka: LibraryShlokaDto): ShlokaDraft {
  return {
    source: shloka.source,
    verse: shloka.verse ?? "",
    text: shloka.text,
    translation: shloka.translation ?? "",
    wordByWord: shloka.wordByWord ?? "",
    commentary: shloka.commentary ?? "",
    images: shloka.images.map(existing),
    acharyas: shloka.acharyas.map((block) => ({
      key: block.id,
      id: block.id,
      acharya: block.acharya,
      text: block.text ?? "",
      translation: block.translation ?? "",
      wordByWord: block.wordByWord ?? "",
      commentary: block.commentary ?? "",
      images: block.images.map(existing),
    })),
  };
}

export function emptyAcharya(): AcharyaDraft {
  return {
    key: draftKey("acharya"),
    id: null,
    acharya: "",
    text: "",
    translation: "",
    wordByWord: "",
    commentary: "",
    images: [],
  };
}

const orNull = (value: string) => value.trim() || null;

/** Тело запроса — без рубрики: её добавляет форма создания. */
export function draftToRequest(
  draft: ShlokaDraft,
): Omit<CreateLibraryShlokaRequest, "categoryId"> {
  return {
    source: orNull(draft.source),
    verse: orNull(draft.verse),
    text: draft.text,
    translation: orNull(draft.translation),
    wordByWord: orNull(draft.wordByWord),
    commentary: orNull(draft.commentary),
    acharyas: draft.acharyas.map((block) => ({
      ...(block.id ? { id: block.id } : {}),
      acharya: block.acharya.trim(),
      text: orNull(block.text),
      translation: orNull(block.translation),
      wordByWord: orNull(block.wordByWord),
      commentary: orNull(block.commentary),
    })),
  };
}

const liveImages = (images: ImageDraft[]) =>
  images.filter((image) => image.kind === "new" || !image.removed).length;

/** Сколько картинок останется у шлоки после сохранения. */
export function imagesAfterSave(draft: ShlokaDraft): number {
  return (
    liveImages(draft.images) +
    draft.acharyas.reduce((sum, block) => sum + liveImages(block.images), 0)
  );
}

/**
 * Проверка до отправки — те же правила, что у сервера, чтобы человек не
 * ждал ответа ради очевидного. Код ошибки — серверный.
 */
export function draftError(draft: ShlokaDraft): string | null {
  if (!draft.source.trim()) return "source_required";
  if (!draft.text.trim()) return "text_required";
  if (draft.verse.trim().length > LIBRARY_SHLOKA_LIMITS.verse)
    return "verse_too_long";
  if (draft.acharyas.length > LIBRARY_SHLOKA_LIMITS.acharyas)
    return "too_many_acharyas";
  for (const block of draft.acharyas) {
    if (!block.acharya.trim()) return "acharya_name_required";
    const filled = [
      block.text,
      block.translation,
      block.wordByWord,
      block.commentary,
    ].some((value) => value.trim());
    if (!filled) return "acharya_empty";
  }
  if (imagesAfterSave(draft) > LIBRARY_SHLOKA_LIMITS.images)
    return "too_many_images";
  return null;
}

export interface ImagePlan {
  uploads: Array<{ file: File; acharyaId: string | null }>;
  removals: string[];
}

/**
 * Что сделать с картинками после сохранения текста. `savedAcharyaIds` —
 * id блоков в ответе сервера: порядок совпадает с порядком в черновике,
 * сервер ставит `position` по индексу.
 */
export function imagePlan(
  draft: ShlokaDraft,
  savedAcharyaIds: readonly string[],
): ImagePlan {
  const plan: ImagePlan = { uploads: [], removals: [] };
  const collect = (images: ImageDraft[], acharyaId: string | null) => {
    for (const image of images) {
      if (image.kind === "new") plan.uploads.push({ file: image.file, acharyaId });
      else if (image.removed) plan.removals.push(image.id);
    }
  };
  collect(draft.images, null);
  draft.acharyas.forEach((block, index) => {
    const acharyaId = savedAcharyaIds[index];
    // Блока в ответе нет — его картинки грузить некуда.
    if (acharyaId) collect(block.images, acharyaId);
  });
  return plan;
}

/** Черновик изменён — сравниваем то, что уйдёт на сервер, и картинки. */
export function draftSignature(draft: ShlokaDraft): string {
  const images = (list: ImageDraft[]) =>
    list.map((image) =>
      image.kind === "new" ? `new:${image.key}` : `${image.id}:${image.removed}`,
    );
  return JSON.stringify({
    request: draftToRequest(draft),
    images: images(draft.images),
    acharyaImages: draft.acharyas.map((block) => images(block.images)),
  });
}
