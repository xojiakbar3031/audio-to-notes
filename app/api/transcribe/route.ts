import { NextRequest, NextResponse } from 'next/server';
import { isLang } from '@/lib/languages';

export const runtime = 'nodejs';

const MAX_BYTES = 25 * 1024 * 1024; // Groq Whisper cheklovi
const MODEL = process.env.GROQ_TRANSCRIBE_MODEL ?? 'whisper-large-v3-turbo';

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY sozlanmagan. .env.local faylida GROQ_API_KEY qiymatini kiriting.' },
      { status: 500 },
    );
  }

  const incomingForm = await req.formData();
  const file = incomingForm.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Audio fayl topilmadi' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Audio bo\'lagi juda katta' }, { status: 413 });
  }

  const groqForm = new FormData();
  groqForm.append('file', file, file.name || 'segment.webm');
  groqForm.append('model', MODEL);
  groqForm.append('response_format', 'json');
  const lang = incomingForm.get('language');
  if (isLang(lang)) groqForm.append('language', lang);

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: groqForm,
  });

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json({ error: `Groq xatosi: ${errText}` }, { status: 502 });
  }

  const data = (await response.json()) as { text?: string };
  return NextResponse.json({ text: data.text?.trim() ?? '' });
}
