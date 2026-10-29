'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Group { id: string; name: string; tags: Array<{ id: string; name: string }> }

/** Your own tags on this trade (Reports → Your tags), toggled in place. */
export function TradeTags({ tradeId }: { tradeId: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [on, setOn] = useState<string[]>([]);
  useEffect(() => {
    void fetch('/api/tags').then((r) => r.json()).then((d) => setGroups(d.groups ?? [])).catch(() => setGroups([]));
    void fetch(`/api/trades/${tradeId}/tags`).then((r) => r.json()).then((d) => setOn(d.tagIds ?? [])).catch(() => {});
  }, [tradeId]);
  const toggle = async (id: string) => {
    const next = on.includes(id) ? on.filter((x) => x !== id) : [...on, id];
    setOn(next);
    const r = await fetch(`/api/trades/${tradeId}/tags`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagIds: next }) });
    if (r.ok) setOn((await r.json()).tagIds ?? next);
  };
  if (!groups) return null;
  if (!groups.some((g) => g.tags.length)) {
    return <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No tags of your own yet. <Link href="/reports?tab=tags" className="underline">Make a group →</Link></p>;
  }
  return (
    <div className="space-y-2" data-trade-tags>
      {groups.filter((g) => g.tags.length).map((g) => (
        <div key={g.id}>
          <div className="mb-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{g.name}</div>
          <div className="flex flex-wrap gap-1.5">
            {g.tags.map((t) => {
              const sel = on.includes(t.id);
              return (
                <button key={t.id} type="button" onClick={() => toggle(t.id)} aria-pressed={sel} data-trade-tag={t.name}
                  className="rounded-full border px-2.5 py-0.5 text-[11.5px]"
                  style={sel ? { background: 'rgb(var(--accent))', borderColor: 'rgb(var(--accent))', color: 'var(--bg-raised)' } : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
