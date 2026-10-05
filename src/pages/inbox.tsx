import { useState } from 'react';
import { ExternalLink, Mail, MessageCircle, Paperclip, Sparkles, Users } from 'lucide-react';
import { AppButton, Badge, EmptyState, SectionTitle, Tabs } from '@/components/shared/ui';
import { formatIrishDateTime } from '@/lib/utils';
import { attachmentUrl } from '@/lib/reports';
import { appStore, useAppState } from '@/stores/appStore';

const ICONS: Record<string, typeof Mail> = {
  patient_app: MessageCircle,
  healthmail: Mail,
  sile_draft: Sparkles,
  internal: Users,
  healthlink: Mail,
  upload: Paperclip,
};

export default function InboxPage() {
  const { inbox } = useAppState();
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');
  const [opening, setOpening] = useState('');
  const filtered = inbox.filter((item) => {
    if (search && !`${item.subject} ${item.body}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === 'Patient' && item.channel !== 'patient_app') return false;
    if (tab === 'Healthmail' && item.channel !== 'healthmail') return false;
    if (tab === 'Síle drafts' && item.channel !== 'sile_draft') return false;
    if (tab === 'Internal' && item.channel !== 'internal') return false;
    if (tab === 'Uploads' && item.channel !== 'upload') return false;
    return true;
  });

  async function openAttachment(item: (typeof inbox)[number]) {
    if (!item.attachmentPath) return;
    setOpening(item.id);
    const url = await attachmentUrl(item.attachmentPath);
    setOpening('');
    if (url) window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="fade-in">
      <SectionTitle title="Inbox" description="One queue for Healthmail, the patient app, Síle drafts, uploads and internal notes." />
      <Tabs items={['All', 'Patient', 'Healthmail', 'Síle drafts', 'Uploads', 'Internal']} value={tab} onChange={setTab} />
      <input className="mb-3 h-9 w-full max-w-sm rounded-lg border border-slate-200 px-3 text-xs" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="surface divide-y overflow-hidden rounded-xl">
        {filtered.map((item) => {
          const Icon = ICONS[item.channel] ?? Mail;
          return (
            <div key={item.id} className="flex items-center gap-3 px-4 py-4">
              <span className="icon-box icon-blue">
                <Icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">{item.fromName} — {item.subject}</span>
                  {!item.read && <Badge tone="amber">Unread</Badge>}
                  <Badge tone="slate">{item.channel}</Badge>
                </div>
                <p className="truncate text-[11px] text-slate-500">{item.body}</p>
                <span className="text-[10px] text-slate-400">{formatIrishDateTime(item.receivedAt)}</span>
              </div>
              {item.attachmentPath && (
                <AppButton
                  size="sm"
                  icon={ExternalLink}
                  disabled={opening === item.id}
                  onClick={() => void openAttachment(item)}
                >
                  {opening === item.id ? 'Opening…' : 'View file'}
                </AppButton>
              )}
              <AppButton size="sm" onClick={() => appStore.markInboxRead(item.id)}>
                {item.read ? 'Opened' : 'Handle'}
              </AppButton>
            </div>
          );
        })}
      </div>
      {!filtered.length && <EmptyState title="Inbox is clear" detail="Nothing in this view." />}
    </div>
  );
}
