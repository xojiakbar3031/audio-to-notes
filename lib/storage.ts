export interface SavedNote {
  id: string;
  createdAt: string; // ISO sana
  durationSec: number;
  transcript: string;
  summary: string;
  language?: string;
  source?: 'mic' | 'file';
  fileName?: string;
}

const STORAGE_KEY = 'audio-to-notes-history';

export function getSavedNotes(): SavedNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveNote(note: SavedNote): void {
  if (typeof window === 'undefined') return;
  const notes = getSavedNotes();
  notes.unshift(note);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export function deleteNote(id: string): void {
  if (typeof window === 'undefined') return;
  const notes = getSavedNotes().filter((n) => n.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function downloadMarkdown(note: SavedNote): void {
  const date = new Date(note.createdAt);
  const body = `# ${note.fileName ?? 'Konspekt'} — ${date.toLocaleString('uz-UZ')}

${note.summary}

---

## Transkript

${note.transcript}
`;
  const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `konspekt-${date.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
