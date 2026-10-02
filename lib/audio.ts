// Yuklangan audio faylni brauzerning o'zida 16 kHz mono WAV bo'laklarga bo'ladi.
// Har bir bo'lak (~3.8 MB) serverless funksiyalarning so'rov hajmi cheklovidan
// (Vercel: 4.5 MB) kichik bo'ladi, shuning uchun istalgan uzunlikdagi fayl ishlaydi.

const TARGET_RATE = 16000;
const CHUNK_SEC = 120;
export const MAX_UPLOAD_MB = 150;

export interface SplitResult {
  chunks: Blob[];
  durationSec: number;
}

export async function splitAudioFile(file: File): Promise<SplitResult> {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`Fayl juda katta (${MAX_UPLOAD_MB} MB dan oshmasin).`);
  }

  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("Bu formatdagi audio o'qilmadi. MP3, M4A, WAV yoki WEBM yuklang.");
  } finally {
    void ctx.close();
  }

  // Bir kanalga birlashtirib, 16 kHz ga o'tkazamiz (Whisper shu chastotada ishlaydi)
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_RATE), TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const pcm = (await offline.startRendering()).getChannelData(0);

  const perChunk = CHUNK_SEC * TARGET_RATE;
  const chunks: Blob[] = [];
  for (let i = 0; i < pcm.length; i += perChunk) {
    chunks.push(encodeWav(pcm.subarray(i, i + perChunk), TARGET_RATE));
  }
  return { chunks, durationSec: Math.round(decoded.duration) };
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk hajmi
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bit depth
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
