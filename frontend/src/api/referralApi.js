import http from './http';

export const getMyReferrals = ()                   => http.get('/referrals/me').then((r) => r.data);
export const trackReferral  = (data)               => http.post('/referrals/track', data).then((r) => r.data);
export const convertReferral = (id)                => http.patch(`/referrals/${id}/convert`).then((r) => r.data);
