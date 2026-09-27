import { useQuery } from '@tanstack/react-query';
import { getBlogPosts, getBlogPost } from '../api/blogApi';

export const BLOG_KEYS = {
  all:  ['blog'],
  list: (params) => ['blog', 'list', params ?? {}],
  post: (locale, slug) => ['blog', 'post', locale, slug],
};

// `params.locale` is required by the backend (400 otherwise, no silent
// fallback — see api/blogApi.js's comment). `enabled` guards against ever
// firing a request without one, rather than trusting every call site to
// remember it.
export function useBlogPosts(params) {
  return useQuery({
    queryKey: BLOG_KEYS.list(params),
    queryFn:  () => getBlogPosts(params),
    select:   (res) => res.posts,
    enabled:  Boolean(params?.locale),
    staleTime: 1000 * 60 * 10,
    gcTime:    1000 * 60 * 30, // keep in memory 30 min so revisits skip the fetch
  });
}

export function useBlogPost(slug, locale) {
  return useQuery({
    queryKey: BLOG_KEYS.post(locale, slug),
    queryFn:  () => getBlogPost(slug, locale),
    select:   (res) => res.post,
    enabled:  Boolean(slug) && Boolean(locale),
    staleTime: 1000 * 60 * 10,
    gcTime:    1000 * 60 * 30,
  });
}
