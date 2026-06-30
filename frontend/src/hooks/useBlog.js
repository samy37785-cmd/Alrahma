import { useQuery } from '@tanstack/react-query';
import { getBlogPosts, getBlogPost } from '../api/blogApi';

export const BLOG_KEYS = {
  all:  ['blog'],
  list: (params) => ['blog', 'list', params ?? {}],
  post: (slug)   => ['blog', 'post', slug],
};

export function useBlogPosts(params) {
  return useQuery({
    queryKey: BLOG_KEYS.list(params),
    queryFn:  () => getBlogPosts(params),
    staleTime: 1000 * 60 * 10,
    gcTime:    1000 * 60 * 30, // keep in memory 30 min so revisits skip the fetch
  });
}

export function useBlogPost(slug) {
  return useQuery({
    queryKey: BLOG_KEYS.post(slug),
    queryFn:  () => getBlogPost(slug),
    enabled:  Boolean(slug),
    staleTime: 1000 * 60 * 10,
    gcTime:    1000 * 60 * 30,
  });
}
