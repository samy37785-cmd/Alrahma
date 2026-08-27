import http from './http';

export const subscribeNewsletter = (email) => http.post('/newsletter', { email }).then((r) => r.data);
export const getSubscribers      = ()      => http.get('/newsletter').then((r) => r.data);
export const submitContactForm   = (data)  => http.post('/contact', data).then((r) => r.data);
export const submitTrial         = (data)  => http.post('/trials', data).then((r) => r.data);
export const getTrials           = ()      => http.get('/trials').then((r) => r.data);
