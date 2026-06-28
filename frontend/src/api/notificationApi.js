import http from './http';

export const getMyNotifications = (params) => http.get('/notifications', { params }).then((r) => r.data);
export const getUnreadNotifs    = ()        => http.get('/notifications/unread').then((r) => r.data);
export const markNotifRead      = (id)      => http.patch(`/notifications/${id}/read`).then((r) => r.data);
export const markAllNotifsRead  = ()        => http.patch('/notifications/read-all').then((r) => r.data);
export const deleteNotif        = (id)      => http.delete(`/notifications/${id}`).then((r) => r.data);
