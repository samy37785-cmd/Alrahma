import http from './http';

// Student-facing (protect, regular User session)
export const listPosts        = (params) => http.get('/community/posts', { params }).then((r) => r.data);
export const getMyPosts       = ()       => http.get('/community/posts/mine').then((r) => r.data);
export const createPost       = (data)   => http.post('/community/posts', data).then((r) => r.data);
export const deletePost       = (id)     => http.delete(`/community/posts/${id}`).then((r) => r.data);
export const toggleLike       = (id)     => http.post(`/community/posts/${id}/like`).then((r) => r.data);
export const listComments     = (id)     => http.get(`/community/posts/${id}/comments`).then((r) => r.data);
export const createComment    = (id, data) => http.post(`/community/posts/${id}/comments`, data).then((r) => r.data);
export const deleteComment    = (id)     => http.delete(`/community/comments/${id}`).then((r) => r.data);
