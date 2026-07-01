import http from './http';

export const getReadingProgress = ()     => http.get('/quran-progress').then((r) => r.data);
export const updatePosition     = (data) => http.put('/quran-progress/position', data).then((r) => r.data);
export const updateReadingGoal  = (data) => http.put('/quran-progress/goal', data).then((r) => r.data);
export const logReading         = (data) => http.post('/quran-progress/log', data).then((r) => r.data);
