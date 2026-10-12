import http from './http';
import { trackTrialSubmitted } from '../analytics/ga';

export const subscribeNewsletter = (email) => http.post('/newsletter', { email }).then((r) => r.data);
export const getSubscribers      = ()      => http.get('/newsletter').then((r) => r.data);
export const submitContactForm   = (data)  => http.post('/contact', data).then((r) => r.data);
export const submitTrial         = (data)  => http.post('/trials', data).then((r) => {
  trackTrialSubmitted(data?.source);
  return r.data;
});
export const getTrials           = ()      => http.get('/trials').then((r) => r.data);
