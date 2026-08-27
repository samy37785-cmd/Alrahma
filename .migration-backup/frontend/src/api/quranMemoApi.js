import http from './http';

export const getMemoStats   = ()     => http.get('/quran-memo').then((r) => r.data);
export const updateMemoGoal = (data) => http.put('/quran-memo/goal', data).then((r) => r.data);
export const logPractice    = (data) => http.post('/quran-memo/log', data).then((r) => r.data);
