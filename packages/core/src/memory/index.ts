/** Rules for memory input shared by the API and the web form (ADR 0014). */

export const MAX_NOTE_CHARACTERS = 4_000;

/** Why a member's note can't be saved, or undefined when it can. */
export function memoryNoteError(text: string) {
  const note = text.trim();

  if (!note) return "Write a note first";

  if (note.length > MAX_NOTE_CHARACTERS) {
    return `Keep a note under ${MAX_NOTE_CHARACTERS.toLocaleString("en")} characters`;
  }

  return undefined;
}
