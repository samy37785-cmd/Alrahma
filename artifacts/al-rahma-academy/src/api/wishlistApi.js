import http from './http';

export const getWishlist        = ()          => http.get('/wishlist').then((r) => r.data);
export const addToWishlist      = (courseId)  => http.post('/wishlist', { courseId }).then((r) => r.data);
export const removeFromWishlist = (courseId)  => http.delete(`/wishlist/${courseId}`).then((r) => r.data);
export const clearWishlist      = ()          => http.delete('/wishlist/clear').then((r) => r.data);
