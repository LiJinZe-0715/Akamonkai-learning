export interface SpeechLine { text: string; role?: string; lessonId?: string; }
/** Recognize explicit dialogue labels, including inline A/B turns in course material. */
export function dialogueLines(text: string, lessonId: string): SpeechLine[] {
  const labels = [...text.matchAll(/(?:^|\s)([A-ZＡ-Ｚ]|我|私|わたし|僕|me)\s*[：:]/gi)];
  if (!labels.length) return [{ text, lessonId }];
  const lines: SpeechLine[] = [];
  const prefix = text.slice(0, labels[0].index).trim();
  if (prefix) lines.push({ text: prefix, lessonId });
  labels.forEach((label, index) => {
    const body = text.slice(label.index! + label[0].length, labels[index + 1]?.index ?? text.length).trim();
    if (body) lines.push({ text: body, role: label[1].normalize("NFKC"), lessonId });
  });
  return lines;
}
