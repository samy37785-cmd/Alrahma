import { useState } from 'react';
import { Users, Heart, MessageCircle, Trash2, Send } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { Skeleton } from '../components/ui/Skeleton';
import {
  useCommunityFeed,
  useMyPosts,
  useCreatePost,
  useDeletePost,
  useToggleLike,
  usePostComments,
  useCreateComment,
  useDeleteComment,
} from '../hooks/useCommunity';
import { useAuth } from '../context/AuthContext';
import '../styles/community.css';
import { formatDayMonth as fmtDate } from '../utils/date';
import { useLang } from '../context/LangContext';
import { getExperienceText } from '../i18n/experience';

function CommentThread({ postId }) {
  const { lang } = useLang();
  const copy = getExperienceText(lang).community;
  const { data: comments = [], isLoading } = usePostComments(postId);
  const createComment = useCreateComment(postId);
  const deleteComment = useDeleteComment(postId);
  const { user } = useAuth();
  const [draft, setDraft] = useState('');

  const handleSubmit = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await createComment.mutateAsync({ body });
  };

  return (
    <div className="community-comments">
      {isLoading ? (
        <Skeleton height={32} radius="var(--radius-md)" />
      ) : (
        comments.map((c) => (
          <div key={c._id} className="community-comment">
            <span className="community-comment__author">{c.author?.name || copy.student}</span>
            <span className="community-comment__body">{c.body}</span>
            {c.author?._id === user?._id && (
              <button
                type="button"
                className="community-comment__delete"
                onClick={() => deleteComment.mutate(c._id)}
                aria-label={copy.deleteComment}
              >
                <Trash2 size={12} aria-hidden="true" />
              </button>
            )}
          </div>
        ))
      )}
      {comments.length === 0 && !isLoading && (
        <div className="community-comments__empty">{copy.noComments}</div>
      )}
      <div className="community-comments__composer">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={copy.commentPlaceholder}
          maxLength={1000}
        />
        <button type="button" onClick={handleSubmit} aria-label={copy.sendComment}>
          <Send size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function PostCard({ post, onDelete, mine = false }) {
  const { lang } = useLang();
  const copy = getExperienceText(lang).community;
  const toggleLike = useToggleLike();
  const { user } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const liked = post.likes?.includes(user?._id);

  return (
    <div className="community-post">
      <div className="community-post__hd">
        <span className="community-post__author">{post.author?.name || copy.student}</span>
        <span className="community-post__date">{fmtDate(post.createdAt)}</span>
        {mine && <span className={`ds-badge ds-badge--${post.status === 'approved' ? 'green' : post.status === 'rejected' ? 'red' : 'yellow'}`}>{copy.status[post.status] || post.status}</span>}
        {post.author?._id === user?._id && (
          <button type="button" className="community-post__delete" onClick={() => onDelete(post._id)} aria-label={copy.deletePost}>
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="community-post__body">{post.body}</p>
      {post.status === 'approved' || !mine ? (
        <div className="community-post__actions">
          <button
            type="button"
            className={`community-post__action${liked ? ' community-post__action--active' : ''}`}
            onClick={() => toggleLike.mutate(post._id)}
          >
            <Heart size={14} aria-hidden="true" fill={liked ? 'currentColor' : 'none'} /> {post.likes?.length || 0}
          </button>
          <button type="button" className="community-post__action" onClick={() => setShowComments((s) => !s)}>
            <MessageCircle size={14} aria-hidden="true" /> {post.commentCount ?? 0}
          </button>
        </div>
      ) : null}
      {showComments && <CommentThread postId={post._id} />}
    </div>
  );
}

export default function Community() {
  const { lang } = useLang();
  const copy = getExperienceText(lang).community;
  const [tab, setTab] = useState('feed');
  const [draft, setDraft] = useState('');
  const { data: feed = { posts: [] }, isLoading: feedLoading } = useCommunityFeed();
  const { data: myPosts = [], isLoading: mineLoading } = useMyPosts();
  const createPost = useCreatePost();
  const deletePost = useDeletePost();

  const handlePost = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await createPost.mutateAsync({ body });
  };

  return (
    <DashboardLayout>
      <div className="ds-page-hd">
        <div className="ds-page-hd__left">
          <div className="ds-page-hd__eyebrow"><Users size={12} aria-hidden="true" /> {copy.eyebrow}</div>
          <h1 className="ds-page-hd__title">{copy.title}</h1>
          <p className="ds-page-hd__sub">{copy.subtitle}</p>
        </div>
      </div>

      <div className="community-composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={copy.postPlaceholder}
          rows={3}
          maxLength={2000}
        />
        <button type="button" className="btn btn--green btn--sm" onClick={handlePost} disabled={!draft.trim() || createPost.isPending}>
          {copy.post}
        </button>
      </div>

      <div className="ds-tabs" style={{ marginBottom: 16 }} role="tablist">
        <button type="button" className="ds-tab" role="tab" aria-selected={tab === 'feed'} onClick={() => setTab('feed')}>{copy.feed}</button>
        <button type="button" className="ds-tab" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>{copy.myPosts}</button>
      </div>

      {tab === 'feed' ? (
        feedLoading ? (
          <Skeleton height={100} radius="var(--radius-md)" />
        ) : feed.posts.length === 0 ? (
          <div className="ds-empty"><div className="ds-empty__title">{copy.noPosts}</div><div className="ds-empty__desc">{copy.firstPost}</div></div>
        ) : (
          feed.posts.map((p) => <PostCard key={p._id} post={p} onDelete={(id) => deletePost.mutate(id)} />)
        )
      ) : mineLoading ? (
        <Skeleton height={100} radius="var(--radius-md)" />
      ) : myPosts.length === 0 ? (
        <div className="ds-empty"><div className="ds-empty__title">{copy.notPosted}</div></div>
      ) : (
        myPosts.map((p) => <PostCard key={p._id} post={p} onDelete={(id) => deletePost.mutate(id)} mine />)
      )}
    </DashboardLayout>
  );
}
