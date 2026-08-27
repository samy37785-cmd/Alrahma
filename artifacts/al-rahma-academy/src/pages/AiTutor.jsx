import { useState, useRef, useEffect } from 'react';
import { Sparkles, Plus, Trash2, Send } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { Skeleton } from '../components/ui/Skeleton';
import {
  useTutorConversations,
  useTutorConversation,
  useCreateTutorConversation,
  useDeleteTutorConversation,
} from '../hooks/useAiTutor';
import { streamTutorMessage } from '../api/aiTutorApi';
import '../styles/ai-tutor.css';
import { formatDayMonth as fmtDate } from '../utils/date';
import { useLang } from '../context/LangContext';
import { getExperienceText } from '../i18n/experience';

export default function AiTutor() {
  const { lang } = useLang();
  const copy = getExperienceText(lang).aiTutor;
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listEndRef = useRef(null);

  const { data: conversations = [], isLoading: listLoading } = useTutorConversations();
  const { data: activeConversation, isLoading: convoLoading, refetch: refetchConversation } = useTutorConversation(activeId);
  const createConversation = useCreateTutorConversation();
  const deleteConversation = useDeleteTutorConversation();

  const messages = activeConversation?.messages || [];

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText]);

  const handleNewChat = async () => {
    const convo = await createConversation.mutateAsync();
    setActiveId(convo._id);
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    await deleteConversation.mutateAsync(id);
    if (activeId === id) setActiveId(null);
  };

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sending) return;

    let conversationId = activeId;
    if (!conversationId) {
      const convo = await createConversation.mutateAsync();
      conversationId = convo._id;
      setActiveId(conversationId);
    }

    setDraft('');
    setSending(true);
    setError('');
    setStreamingText('');

    await streamTutorMessage(conversationId, content, {
      onDelta: (text) => setStreamingText((prev) => prev + text),
      onDone: () => {
        setSending(false);
        setStreamingText('');
        refetchConversation();
      },
      onError: (message) => {
        setSending(false);
        setStreamingText('');
        setError(message);
        refetchConversation();
      },
    });
  };

  return (
    <DashboardLayout>
      <div className="ds-page-hd">
        <div className="ds-page-hd__left">
          <div className="ds-page-hd__eyebrow"><Sparkles size={12} aria-hidden="true" /> {copy.eyebrow}</div>
          <h1 className="ds-page-hd__title">{copy.title}</h1>
          <p className="ds-page-hd__sub">{copy.subtitle}</p>
        </div>
      </div>

      <div className="ai-tutor">
        <aside className="ai-tutor__sidebar">
          <button type="button" className="btn btn--green btn--sm ai-tutor__new" onClick={handleNewChat}>
            <Plus size={14} aria-hidden="true" /> {copy.newChat}
          </button>
          <div className="ai-tutor__list">
            {listLoading ? (
              <>
                <Skeleton height={44} radius="var(--radius-md)" />
                <Skeleton height={44} radius="var(--radius-md)" />
              </>
            ) : conversations.length === 0 ? (
              <div className="ai-tutor__empty-list">{copy.noConversations}</div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c._id}
                  className={`ai-tutor__list-item${c._id === activeId ? ' ai-tutor__list-item--active' : ''}`}
                  onClick={() => setActiveId(c._id)}
                >
                  <div className="ai-tutor__list-item-title">{c.title}</div>
                  <div className="ai-tutor__list-item-date">{fmtDate(c.updatedAt)}</div>
                  <button
                    type="button"
                    className="ai-tutor__list-item-delete"
                    onClick={(e) => handleDelete(c._id, e)}
                    aria-label={copy.deleteConversation}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="ai-tutor__main">
          <div className="ai-tutor__thread">
            {!activeId && !sending ? (
              <div className="ai-tutor__welcome">
                <Sparkles size={28} aria-hidden="true" />
                <p>{copy.welcome}</p>
              </div>
            ) : convoLoading ? (
              <Skeleton height={80} radius="var(--radius-md)" />
            ) : (
              <>
                {messages.map((m, i) => (
                  <div key={i} className={`ai-tutor__bubble ai-tutor__bubble--${m.role}`}>
                    {m.content}
                  </div>
                ))}
                {sending && (
                  <div className="ai-tutor__bubble ai-tutor__bubble--assistant">
                    {streamingText || <span className="ai-tutor__typing">{copy.thinking}</span>}
                  </div>
                )}
                {error && <div className="ai-tutor__error">{error}</div>}
                <div ref={listEndRef} />
              </>
            )}
          </div>

          <div className="ai-tutor__composer">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={copy.placeholder}
              rows={2}
              maxLength={4000}
              disabled={sending}
            />
            <button
              type="button"
              className="btn btn--green ai-tutor__send"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              aria-label={copy.send}
            >
              <Send size={16} aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
