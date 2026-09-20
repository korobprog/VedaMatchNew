import { buildUploadFormPart, type ChatUploadFormPart } from '../chat-upload-part';
import { VOICE_UPLOAD_FILE_NAME, VOICE_UPLOAD_MIME_TYPE } from './voice-recording-options';

/** Часть `FormData` для голосового — форма и обоснование общие для всех
 *  вложений переписки, см. `chat-upload-part.ts: buildUploadFormPart`. */
export type VoiceUploadPart = ChatUploadFormPart;

/** Голосовое использует общий байтовый строитель со своими именем/MIME. */
export async function buildVoiceUploadPart(uri: string): Promise<VoiceUploadPart> {
  return buildUploadFormPart({ uri, name: VOICE_UPLOAD_FILE_NAME, type: VOICE_UPLOAD_MIME_TYPE });
}
