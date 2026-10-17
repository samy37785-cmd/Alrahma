import http from './http';
import adminHttp from './adminHttp';
import { trackTrialSubmitted } from '../analytics/ga';
import { trialFormFor, campaignTags } from '../utils/trialSource';

export const subscribeNewsletter = (email) => http.post('/newsletter', { email }).then((r) => r.data);
// Admin console reads go through the MFA admin API (AR-04).
export const getSubscribers      = ()      => adminHttp.get('/v1/admin/newsletter').then((r) => r.data);
export const submitContactForm   = (data)  => http.post('/contact', data).then((r) => r.data);
// Every trial form goes through here, so each request carries which form it
// came from and the page's campaign tags without each form wiring them up.
export const submitTrial         = (data)  => http.post('/trials', {
  ...data,
  formSource: trialFormFor(data?.source),
  ...campaignTags(),
}).then((r) => {
  trackTrialSubmitted(data?.source, data?.heardFrom);
  return r.data;
});
export const getTrials           = ()      => adminHttp.get('/v1/admin/trials').then((r) => r.data);
