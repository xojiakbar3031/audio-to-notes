'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Markdown } from '@/components/Markdown';
import { useRecorder } from '@/hooks/useRecorder';
import { splitAudioFile, MAX_UPLOAD_MB } from '@/lib/audio';
import { LANGUAGES, type Lang } from '@/lib/languages';
import {
  deleteNote,
  downloadMarkdown,
  formatDuration,
  getSavedNotes,
  saveNote,
  type SavedNote,
} from '@/lib/storage';

interface Segment {
  id: number;
  status: 'yuklanmoqda' | 'tayyor' | 'xato';
  text: string;
}

type Phase = 'idle' | 'processing' | 'done';

export default function Home() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [summary, setSummary] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [language, setLanguage] = useState<Lang>('uz');
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [lastNote, setLastNote] = useState<SavedNote | null>(null);

  const segmentCounter = useRef(0);
  const segmentsRef = useRef<Segment[]>([]);
  const blobsRef = useRef(new Map<number, { blob: Blob; name: string }>());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // localStorage faqat brauzerda mavjud — SSR bilan mos kelmasligini oldini olish uchun
    // mount bo'lgach o'qiymiz (server va birinchi klient render bo'sh ro'yxat bilan mos keladi).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotes(getSavedNotes());
  }, []);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  const updateSegment = (id: number, patch: Partial<Segment>) =>
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const transcribe = useCallback(
    async (id: number) => {
      const entry = blobsRef.current.get(id);
      if (!entry) return;
      updateSegment(id, { status: 'yuklanmoqda' });

      const formData = new FormData();
      formData.append('file', entry.blob, entry.name);
      formData.append('language', language);
      try {
        const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Xatolik');
        updateSegment(id, { status: 'tayyor', text: data.text as string });
      } catch {
        updateSegment(id, { status: 'xato' });
      }
    },
    [language],
  );

  const addSegment = useCallback((blob: Blob, name: string) => {
    const id = segmentCounter.current++;
    blobsRef.current.set(id, { blob, name });
    setSegments((prev) => [...prev, { id, status: 'yuklanmoqda', text: '' }]);
    return id;
  }, []);

  const handleSegment = useCallback(
    (blob: Blob) => {
      void transcribe(addSegment(blob, 'segment.webm'));
    },
    [addSegment, transcribe],
  );

  const { status, elapsedSec, error, start, stop } = useRecorder({ onSegment: handleSegment });

  const reset = () => {
    setSegments([]);
    setSummary('');
    setLastNote(null);
    setUploadError(null);
    segmentCounter.current = 0;
    blobsRef.current.clear();
  };

  const summarize = async (durationSec: number, source: SavedNote['source'], fileName?: string) => {
    setProgress('Xulosa tuzilmoqda…');

    // Yozib olingan segmentlarning transkripsiyasi tugashini kutamiz (eng ko'pi ~60s)
    for (let i = 0; i < 120; i++) {
      if (segmentsRef.current.every((s) => s.status !== 'yuklanmoqda')) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    const transcript = segmentsRef.current
      .filter((s) => s.status === 'tayyor')
      .map((s) => s.text)
      .join(' ')
      .trim();

    if (!transcript) {
      setSummary("Matn aniqlanmadi. Iltimos, qayta urinib ko'ring.");
      setPhase('done');
      return;
    }

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Xatolik');

      const note: SavedNote = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        durationSec,
        transcript,
        summary: data.summary as string,
        language,
        source,
        fileName,
      };
      setSummary(note.summary);
      setLastNote(note);
      saveNote(note);
      setNotes(getSavedNotes());
    } catch {
      setSummary("Xulosa tuzishda xatolik yuz berdi. Internetni tekshirib, qayta urinib ko'ring.");
    } finally {
      setPhase('done');
    }
  };

  const yangiYozuv = () => {
    reset();
    setPhase('idle');
    void start();
  };

  const yozuvniYakunlash = async () => {
    const duration = elapsedSec;
    stop();
    setPhase('processing');
    await summarize(duration, 'mic');
  };

  const faylniQaytaIshlash = async (file: File) => {
    reset();
    setPhase('processing');
    try {
      setProgress('Audio tayyorlanmoqda…');
      const { chunks, durationSec } = await splitAudioFile(file);
      // Ketma-ket yuboramiz: tartib saqlanadi va API limitiga urilmaydi
      for (let i = 0; i < chunks.length; i++) {
        setProgress(`Matnga o'girilmoqda… ${i + 1} / ${chunks.length}`);
        await transcribe(addSegment(chunks[i], `chunk-${i}.wav`));
      }
      await summarize(durationSec, 'file', file.name);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Faylni o\'qib bo\'lmadi');
      setPhase('idle');
    }
  };

  const transcriptMatni = segments
    .filter((s) => s.status === 'tayyor')
    .map((s) => s.text)
    .join(' ');
  const busy = status === 'recording' || phase === 'processing';

  const nusxaOlish = async (matn: string) => {
    try {
      await navigator.clipboard.writeText(matn);
    } catch {
      /* clipboard mavjud bo'lmasa jim o'tkazamiz */
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-10">
        <header className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">🎙️ Audio → Konspekt</h1>
          <p className="mt-1 text-sm text-slate-400">
            Gaplashing yoki audio fayl yuklang — ilova matnga o&apos;girib, konspekt tuzib beradi.
          </p>
        </header>

        {/* Boshqaruv bloki */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-center shadow-xl shadow-black/20">
          <div className="mb-5 flex justify-center gap-1 rounded-xl bg-slate-950/60 p-1 text-xs sm:mx-auto sm:w-fit">
            {(Object.keys(LANGUAGES) as Lang[]).map((key) => (
              <button
                key={key}
                disabled={busy}
                onClick={() => setLanguage(key)}
                className={`flex-1 rounded-lg px-3 py-1.5 font-medium transition disabled:opacity-50 sm:flex-none ${
                  language === key ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {LANGUAGES[key].label}
              </button>
            ))}
          </div>

          <div className="font-mono text-5xl font-bold tabular-nums text-indigo-300">
            {formatDuration(elapsedSec)}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {status === 'recording'
              ? 'Yozib olinmoqda… davomiylik cheklanmagan'
              : phase === 'processing'
                ? progress
                : 'Yozishga tayyor'}
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {status === 'recording' ? (
              <button
                onClick={yozuvniYakunlash}
                className="flex items-center gap-2 rounded-2xl bg-rose-500 px-6 py-3 font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:bg-rose-400 active:scale-95"
              >
                <span className="h-3 w-3 rounded-sm bg-white" /> Yakunlash
              </button>
            ) : (
              <>
                <button
                  onClick={yangiYozuv}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-2xl bg-indigo-500 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400 active:scale-95 disabled:opacity-50"
                >
                  <span className="h-3 w-3 rounded-full bg-white" /> Yozishni boshlash
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="rounded-2xl border border-slate-700 px-6 py-3 font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 active:scale-95 disabled:opacity-50"
                >
                  ⤒ Fayl yuklash
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,video/webm,video/mp4"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void faylniQaytaIshlash(file);
                  }}
                />
              </>
            )}
          </div>
          <p className="mt-3 text-[11px] text-slate-600">MP3, M4A, WAV, WEBM · {MAX_UPLOAD_MB} MB gacha</p>

          {(error || uploadError) && <p className="mt-4 text-sm text-rose-400">{error ?? uploadError}</p>}

          {segments.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {segments.map((s, i) =>
                s.status === 'xato' ? (
                  <button
                    key={s.id}
                    onClick={() => void transcribe(s.id)}
                    title="Qayta urinish"
                    className="rounded-full bg-rose-500/20 px-2 text-[10px] leading-4 text-rose-300 hover:bg-rose-500/30"
                  >
                    ↻ {i + 1}
                  </button>
                ) : (
                  <span
                    key={s.id}
                    title={s.status}
                    className={`h-2.5 w-2.5 rounded-full ${
                      s.status === 'tayyor' ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'
                    }`}
                    aria-label={`Segment ${i + 1}: ${s.status}`}
                  />
                ),
              )}
            </div>
          )}
        </section>

        {/* Jonli transkript */}
        {segments.length > 0 && phase !== 'done' && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-400">Jonli matn</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
              {transcriptMatni || 'Kuting...'}
            </p>
          </section>
        )}

        {/* Yakuniy natija */}
        {phase === 'done' && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-400">Konspekt</h2>
              {lastNote && (
                <div className="flex gap-2">
                  <button
                    onClick={() => nusxaOlish(lastNote.summary)}
                    className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
                  >
                    Nusxa olish
                  </button>
                  <button
                    onClick={() => downloadMarkdown(lastNote)}
                    className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
                  >
                    .md yuklash
                  </button>
                </div>
              )}
            </div>
            <Markdown source={summary} />
            {lastNote && (
              <details className="mt-5 border-t border-slate-800 pt-4">
                <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-300">
                  To&apos;liq transkript
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-400">
                  {lastNote.transcript}
                </p>
              </details>
            )}
          </section>
        )}

        {/* Tarix */}
        {notes.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-400">Oldingi yozuvlar</h2>
            <div className="flex flex-col gap-3">
              {notes.map((n) => (
                <details
                  key={n.id}
                  className="group rounded-2xl border border-slate-800 bg-slate-900/40 p-4 open:bg-slate-900/70"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
                    <span className="truncate text-slate-300">
                      {n.source === 'file' ? '📄 ' : '🎙️ '}
                      {n.fileName ? `${n.fileName} · ` : ''}
                      {new Date(n.createdAt).toLocaleString('uz-UZ')} · {formatDuration(n.durationSec)}
                    </span>
                    <span className="flex shrink-0 gap-3 text-xs">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          downloadMarkdown(n);
                        }}
                        className="text-slate-400 hover:text-slate-200"
                      >
                        .md
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          deleteNote(n.id);
                          setNotes(getSavedNotes());
                        }}
                        className="text-rose-400 hover:text-rose-300"
                      >
                        O&apos;chirish
                      </button>
                    </span>
                  </summary>
                  <div className="mt-4">
                    <Markdown source={n.summary} />
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
