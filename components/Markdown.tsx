import { Fragment, type ReactNode } from 'react';

// Konspekt uchun yetarli bo'lgan kichik Markdown renderer:
// ## sarlavha, - ro'yxat, **qalin** va oddiy paragraf. Tashqi kutubxona va
// dangerouslySetInnerHTML ishlatilmaydi, shuning uchun XSS xavfi yo'q.

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-slate-100">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={blocks.length} className="ml-1 flex flex-col gap-1.5">
        {list.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
            <span>{inline(item)}</span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const raw of source.split('\n')) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/) ?? line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flushList();
    if (!line) continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      blocks.push(
        <h3 key={blocks.length} className="mt-2 text-sm font-semibold uppercase tracking-wide text-indigo-300 first:mt-0">
          {heading[1]}
        </h3>,
      );
    } else {
      blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flushList();

  return <div className="flex flex-col gap-3 text-sm leading-relaxed text-slate-300">{blocks}</div>;
}
