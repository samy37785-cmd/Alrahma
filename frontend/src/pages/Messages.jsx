import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { getContacts, getConversation, sendMessage } from '../api/client';
import '../styles/dashboard.css';

const TXT = {
  en: { bar: 'Messages', back: 'View site', contacts: 'Conversations', noContacts: 'No conversations available. Messaging is between a student and their teacher.', pick: 'Pick a conversation to start chatting.', send: 'Send', placeholder: 'Write a message…', empty: 'No messages yet — say salam 👋' },
  ar: { bar: 'الرسائل', back: 'عرض الموقع', contacts: 'المحادثات', noContacts: 'لا توجد محادثات متاحة. المراسلة بين الطالب ومعلّمه.', pick: 'اختر محادثة لتبدأ.', send: 'إرسال', placeholder: 'اكتب رسالة…', empty: 'لا توجد رسائل بعد — سلّم 👋' },
};

const fmt = (d) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Messages() {
  const { user } = useAuth();
  const { lang } = useLang();
  const L = TXT[lang === 'ar' ? 'ar' : 'en'];
  const navigate = useNavigate();

  const [contacts, setContacts] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const endRef = useRef(null);

  useEffect(() => { if (!user) navigate('/login'); }, [user, navigate]);

  const loadContacts = useCallback(() => {
    getContacts().then((c) => {
      setContacts(c);
      // Auto-open the only contact (a student always has just their teacher).
      setActiveId((cur) => cur || (c.length === 1 ? c[0]._id : null));
    }).catch(() => {});
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  const loadConversation = useCallback((id) => {
    if (!id) return;
    getConversation(id)
      .then((m) => setMessages(m))
      .catch(() => {});
  }, []);

  // Load + poll the open conversation every 8s so new replies appear.
  useEffect(() => {
    if (!activeId) return;
    loadConversation(activeId);
    const t = setInterval(() => { loadConversation(activeId); loadContacts(); }, 8000);
    return () => clearInterval(t);
  }, [activeId, loadConversation, loadContacts]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !activeId) return;
    setSending(true);
    setText('');
    try {
      const msg = await sendMessage({ to: activeId, body });
      setMessages((prev) => [...prev, msg]);
      loadContacts();
    } catch {
      setText(body); // restore on failure
    } finally {
      setSending(false);
    }
  };

  const active = contacts.find((c) => c._id === activeId);

  return (
    <div className="admin">
      <header className="admin__bar">
        <div className="container admin__bar-inner">
          <strong>💬 {L.bar}</strong>
          <Link to="/" className="btn btn--ghost btn--sm">{L.back}</Link>
        </div>
      </header>

      <main className="container admin__main">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 280px) 1fr', gap: '1rem', alignItems: 'start' }}>
          {/* Contacts */}
          <section className="admin__panel" style={{ padding: '12px' }}>
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>{L.contacts}</h2>
            {contacts.length === 0 ? (
              <p className="admin__empty">{L.noContacts}</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {contacts.map((c) => (
                  <li key={c._id}>
                    <button
                      onClick={() => setActiveId(c._id)}
                      style={{ width: '100%', textAlign: 'start', border: 'none', borderRadius: 8, cursor: 'pointer', padding: '10px 12px', background: c._id === activeId ? '#eaf5ef' : 'transparent', display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 600 }}>{c.name}</p>
                        {c.lastMessage && (
                          <p style={{ margin: '2px 0 0', fontSize: '.8rem', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.lastMessage.mine ? '↩ ' : ''}{c.lastMessage.body}
                          </p>
                        )}
                      </div>
                      {c.unread > 0 && (
                        <span style={{ background: '#0b6e4f', color: '#fff', borderRadius: 99, fontSize: '.72rem', padding: '1px 7px', fontWeight: 700 }}>{c.unread}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Conversation */}
          <section className="admin__panel" style={{ display: 'flex', flexDirection: 'column', height: '70vh', padding: '12px' }}>
            {!active ? (
              <p className="admin__empty" style={{ margin: 'auto' }}>{L.pick}</p>
            ) : (
              <>
                <h2 style={{ marginTop: 0, fontSize: '1rem', borderBottom: '1px solid #eee', paddingBottom: 8 }}>{active.name}</h2>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 4px' }}>
                  {messages.length === 0 && <p className="admin__empty" style={{ margin: 'auto' }}>{L.empty}</p>}
                  {messages.map((m) => {
                    const mine = String(m.from) === String(user?._id);
                    return (
                      <div key={m._id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                        <div style={{ background: mine ? '#0b6e4f' : '#eef2f0', color: mine ? '#fff' : '#222', borderRadius: 12, padding: '8px 12px', fontSize: '.95rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {m.body}
                        </div>
                        <p style={{ margin: '2px 4px 0', fontSize: '.7rem', color: '#aaa', textAlign: mine ? 'end' : 'start' }}>{fmt(m.createdAt)}</p>
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                </div>
                <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, marginTop: 8, borderTop: '1px solid #eee', paddingTop: 10 }}>
                  <input value={text} onChange={(e) => setText(e.target.value)} placeholder={L.placeholder} style={{ flex: 1 }} />
                  <button type="submit" className="btn btn--green" disabled={sending || !text.trim()}>{L.send}</button>
                </form>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
