import http from './http';

export const getContacts     = ()         => http.get('/messages/contacts').then((r) => r.data);
export const getConversation = (userId)   => http.get(`/messages/${userId}`).then((r) => r.data);
export const sendMessage     = (data)     => http.post('/messages', data).then((r) => r.data);
export const getUnreadCount  = ()         => http.get('/messages/unread/count').then((r) => r.data);
