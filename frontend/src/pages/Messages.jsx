import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { getContacts, getConversation, sendMessage } from '../api/messageApi';
import DashboardLayout from '../components/layout/DashboardLayout';
import '../styles/dashboard-shell.css';
import '../styles/components.css';

const TXT = {
  en: {
    bar: 'Messages', back: 'View site', contacts: 'Conversations',
    noContacts: 'No conversations available. Messaging is between a student and their teacher.',
    pick: 'Pick a conversation to start chatting.',
    send: 'Send', placeholder: 'Write a message…', empty: 'No messages yet — say salam 👋',
  },
  ar: {
    bar: 'الرسائل', back: 'عرض الموقع', contacts: 'المحادثات',
    noContacts: 'لا توجد محادثات متاحة. المراسلة بين الطالب ومعلّمه.',
    pick: 'اختر محادثة لتبدأ.',
    send: 'إرسال', placeholder: 'اكتب رسالة…', empty: 'لا توجد رسائل بعد — سلّم 👋',
  },
};

const fmt = (d) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Messages() {
  const { user } = useAuth();
  const { lang } = useLang();
  const L = TXT[lang === 'ar' ? 'ar' : 'en'];
  const queryClient = useQueryClient();

  const [activeId, setActiveId] = useState(null);
  const [text, setText] = useState('');
  const endRef = useRef(null);

  // No local "redirect if not logged in" effect here — this route is always
  // wrapped in <ProtectedRoute> (App.jsx), which already owns that decision
  // and (unlike a local check) correctly waits for server confirmation when
  // there's no cached profile instead of assuming !user means logged out.
  const { data: contacts = [] } = useQuery({
    queryKey: ['messages', 'contacts'],
    queryFn: getContacts,
    refetchInterval: 8000,
    staleTime: 0,
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!activeId && contacts.length === 1) setActiveId(contacts[0]._id);
  }, [contacts, activeId]);

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', 'conversation', activeId],
    queryFn: () => getConversation(activeId),
    enabled: Boolean(activeId),
    refetchInterval: 8000,
    staleTime: 0,
  });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMutation = useMutation({
    mutationFn: sendMessage,
    onMutate: async (newMsg) => {
      await queryClient.cancelQueries({ queryKey: ['messages', 'conversation', activeId] });
      const previous = queryClient.getQueryData(['messages', 'conversation', activeId]);
      const optimistic = { _id: `tmp-${Date.now()}`, from: user?._id, body: newMsg.body, createdAt: new Date().toISOString() };
      queryClient.setQueryData(['messages', 'conversation', activeId], (old = []) => [...old, optimistic]);
      return { previous };
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['messages', 'conversation', activeId], (old = []) => [
        ...old.filter((m) => !String(m._id).startsWith('tmp-')),
        result,
      ]);
      queryClient.invalidateQueries({ queryKey: ['messages', 'contacts'] });
    },
    onError: (err, vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(['messages', 'conversation', activeId], ctx.previous);
      }
      setText(vars.body);
    },
  });

  const handleSend = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !activeId) return;
    setText('');
    sendMutation.mutate({ to: activeId, body });
  };

  const active = contacts.find((c) => c._id === activeId);

  return (
    <DashboardLayout>
      {/* Page header */}
      <div className="ds-page-hd">
        <div>
          <div className="ds-page-hd__eyebrow"><span>💬</span> {L.bar}</div>
          <h1 className="ds-page-hd__title">{L.bar}</h1>
        </div>
      </div>

      <div className="msg-grid">
        {/* Contacts panel */}
        <section className="ds-card" style={{ padding: 12 }} aria-label={L.contacts}>
          <h2 style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {L.contacts}
          </h2>
          {contacts.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{L.noContacts}</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }} role="listbox" aria-label={L.contacts}>
              {contacts.map((c) => (
                <li key={c._id} role="option" aria-selected={c._id === activeId}>
                  <button
                    className="msg-contact-btn"
                    aria-pressed={c._id === activeId}
                    onClick={() => setActiveId(c._id)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: '0.855rem', color: 'var(--text-primary)' }}>{c.name}</p>
                      {c.lastMessage && (
                        <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.lastMessage.mine ? '↩ ' : ''}{c.lastMessage.body}
                        </p>
                      )}
                    </div>
                    {c.unread > 0 && (
                      <span className="msg-unread" aria-label={`${c.unread} unread`}>{c.unread}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Conversation panel */}
        <section
          className="ds-card msg-grid__conversation"
          style={{ display: 'flex', flexDirection: 'column', height: '70vh', padding: 12 }}
          aria-label={active ? `Conversation with ${active.name}` : L.pick}
          aria-live="polite"
        >
          {!active ? (
            <p style={{ margin: 'auto', color: 'var(--text-secondary)', fontSize: '0.855rem' }}>{L.pick}</p>
          ) : (
            <>
              <h2 style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: 8 }}>
                {active.name}
              </h2>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 4px' }}>
                {messages.length === 0 && (
                  <p style={{ margin: 'auto', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{L.empty}</p>
                )}
                {messages.map((m) => {
                  const mine = String(m.from) === String(user?._id);
                  return (
                    <div key={m._id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                      <div className={mine ? 'msg-bubble--mine' : 'msg-bubble--other'} style={{ borderRadius: 12, padding: '8px 12px', fontSize: '0.95rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {m.body}
                      </div>
                      <p style={{ margin: '2px 4px 0', fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: mine ? 'end' : 'start' }}>
                        {fmt(m.createdAt)}
                      </p>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, marginTop: 8, borderTop: '1px solid var(--border-default)', paddingTop: 10 }}>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={L.placeholder}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
                  enterKeyHint="send"
                />
                <button
                  type="submit"
                  className="btn btn--green"
                  style={{ borderRadius: 8, flexShrink: 0 }}
                  disabled={sendMutation.isPending || !text.trim()}
                >
                  {L.send}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
