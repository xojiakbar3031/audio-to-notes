'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Uzun yozuvlarni cheklovsiz qo'llab-quvvatlash uchun ovoz bitta katta faylga
// emas, har SEGMENT_MS millisoniyada alohida, mustaqil "segment"larga bo'lib
// yoziladi. Har bir segment tugashi bilan darhol serverga (Whisper'ga)
// jo'natiladi — shu tufayli umumiy yozuv davomiyligi amalda cheklanmaydi.
const SEGMENT_MS = 3 * 60 * 1000; // 3 daqiqa

export type RecorderStatus = 'idle' | 'recording';

interface UseRecorderOptions {
  onSegment: (blob: Blob) => void;
}

export function useRecorder({ onSegment }: UseRecorderOptions) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const segmentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restartPendingRef = useRef(false);
  const onSegmentRef = useRef(onSegment);
  const beginSegmentRef = useRef<(stream: MediaStream) => void>(() => {});

  useEffect(() => {
    onSegmentRef.current = onSegment;
  }, [onSegment]);

  const mimeType =
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

  const beginSegment = useCallback(
    (stream: MediaStream) => {
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 32000, // nutq uchun yetarli, past bitrate — uzunroq yozuvga imkon beradi
      });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        if (blob.size > 0) onSegmentRef.current(blob);

        if (restartPendingRef.current && streamRef.current) {
          restartPendingRef.current = false;
          beginSegmentRef.current(streamRef.current);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
    },
    [mimeType],
  );

  useEffect(() => {
    beginSegmentRef.current = beginSegment;
  }, [beginSegment]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setElapsedSec(0);
      setStatus('recording');
      beginSegment(stream);

      segmentTimerRef.current = setInterval(() => {
        restartPendingRef.current = true;
        recorderRef.current?.stop();
      }, SEGMENT_MS);

      elapsedTimerRef.current = setInterval(() => {
        setElapsedSec((s) => s + 1);
      }, 1000);
    } catch {
      setError('Mikrofonga ruxsat berilmadi. Brauzer sozlamalaridan ruxsat bering.');
      setStatus('idle');
    }
  }, [beginSegment]);

  const stop = useCallback(() => {
    if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    restartPendingRef.current = false;
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus('idle');
  }, []);

  return { status, elapsedSec, error, start, stop };
}
