# Audio → Notes 🎙️

Turn any recording into structured notes. You can record a lecture or meeting live, or
upload an audio file. The app transcribes it with Whisper and gives you a summary, the
key points and the action items as Markdown. It supports **Uzbek, Russian and English**.

## Features

- **Unlimited live recording.** Audio is cut into independent 3-minute segments, and
  each one is transcribed while you keep talking. Recording length isn't capped, and a
  failed segment can be retried on its own.
- **File upload of any length** (MP3, M4A, WAV, WEBM up to 150 MB). The browser decodes
  the file, downmixes it to 16 kHz mono and splits it into 2-minute WAV chunks. Each
  request stays under the 4.5 MB serverless payload limit, so this works on Vercel as is.
- **Structured summaries.** An LLM writes a summary, key points and action items in the
  language you picked.
- **Markdown export.** You can copy notes or download them as `.md` (summary + full
  transcript).
- **Local history.** Past notes are kept in `localStorage`, so no database or accounts
  are needed.
- **API key stays on the server.** The browser only talks to Next.js route handlers,
  which validate input size before calling Groq.

## How it works

```
mic (MediaRecorder, 3-min segments) ─┐
                                     ├─► /api/transcribe ─► Groq Whisper large-v3-turbo
file (Web Audio → 16 kHz WAV chunks) ┘                              │
                                                                    ▼
                                       ordered transcript ─► /api/summarize ─► Llama 3.3 70B
                                                                    │
                                                                    ▼
                                              Markdown notes · history · .md export
```

## Tech stack

Next.js 16 (App Router, Route Handlers) · React 19 · TypeScript · Tailwind CSS 4 ·
Groq API (Whisper + Llama) · Web Audio API · MediaRecorder

## Run locally

```bash
npm install
cp .env.local.example .env.local   # add your free key from https://console.groq.com/keys
npm run dev
```

Open <http://localhost:3000>.

| Env var | Default |
|---|---|
| `GROQ_API_KEY` | — (required) |
| `GROQ_TRANSCRIBE_MODEL` | `whisper-large-v3-turbo` |
| `GROQ_SUMMARY_MODEL` | `llama-3.3-70b-versatile` |

## Deploy

Import the repo on Vercel and add `GROQ_API_KEY` as an environment variable. No other
setup is needed.

## License

MIT
