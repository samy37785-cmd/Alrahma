import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listPosts,
  getMyPosts,
  createPost,
  deletePost,
  toggleLike,
  listComments,
  createComment,
  deleteComment,
} from '../api/communityApi';

const FEED_KEY = ['community', 'feed'];
const MINE_KEY = ['community', 'mine'];

export function useCommunityFeed(params) {
  return useQuery({ queryKey: [...FEED_KEY, params], queryFn: () => listPosts(params) });
}

export function useMyPosts() {
  return useQuery({ queryKey: MINE_KEY, queryFn: getMyPosts });
}

function invalidateFeed(qc) {
  qc.invalidateQueries({ queryKey: FEED_KEY });
  qc.invalidateQueries({ queryKey: MINE_KEY });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: createPost, onSuccess: () => invalidateFeed(qc) });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: deletePost, onSuccess: () => invalidateFeed(qc) });
}

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleLike,
    onSuccess: () => qc.invalidateQueries({ queryKey: FEED_KEY }),
  });
}

export function usePostComments(postId) {
  return useQuery({
    queryKey: ['community', 'comments', postId],
    queryFn: () => listComments(postId),
    enabled: !!postId,
  });
}

export function useCreateComment(postId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => createComment(postId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community', 'comments', postId] }),
  });
}

export function useDeleteComment(postId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteComment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community', 'comments', postId] }),
  });
}
