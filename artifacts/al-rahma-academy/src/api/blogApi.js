import http from './http';

export const getBlogPosts = (params) => http.get('/blog', { params }).then((r) => r.data);
export const getBlogPost  = (slug)   => http.get(`/blog/${slug}`).then((r) => r.data);
