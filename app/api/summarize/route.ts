import { NextRequest, NextResponse } from 'next/server';
import { LANGUAGES, isLang } from '@/lib/languages';

export const runtime = 'nodejs';

const MAX_CHARS = 120_000; // ~2-3 soatlik nutq
const MODEL = process.env.GROQ_SUMMARY_MODEL ?? 'llama-3.3-70b-versatile';

function systemPrompt(langKey: keyof typeof LANGUAGES) {
  const lang = LANGUAGES[langKey];
  const [h1, h2, h3] = lang.headings;
  return `You turn speech-to-text transcripts of recordings (lectures, meetings, voice notes) into short, clear notes.
The transcript is machine-generated and may contain recognition errors — infer the intended meaning from context.
Write the notes in ${lang.name}, using exactly this Markdown structure:

## ${h1}
(2-4 sentences covering the overall content)

## ${h2}
- ...

## ${h3}
- ... (if there are no explicit tasks, write "${lang.noTasks}")

Reply with this structure only, no preamble.`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY sozlanmagan.' }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { transcript?: string; language?: string };
  const transcript = body.transcript?.trim();
  if (!transcript) {
    return NextResponse.json({ error: "Matn bo'sh" }, { status: 400 });
  }
  if (transcript.length > MAX_CHARS) {
    return NextResponse.json({ error: 'Matn juda uzun' }, { status: 413 });
  }
  const language = isLang(body.language) ? body.language : 'uz';

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt(language) },
        { role: 'user', content: transcript },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json({ error: `Groq xatosi: ${errText}` }, { status: 502 });
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const summary = data.choices?.[0]?.message?.content?.trim() ?? '';
  return NextResponse.json({ summary });
}
