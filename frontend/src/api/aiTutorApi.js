import http from './http';
import { getCsrfToken } from './csrf';

export const listTutorConversations  = ()     => http.get('/ai-tutor/conversations').then((r) => r.data);
export const createTutorConversation = ()     => http.post('/ai-tutor/conversations').then((r) => r.data);
export const getTutorConversation    = (id)   => http.get(`/ai-tutor/conversations/${id}`).then((r) => r.data);
export const deleteTutorConversation = (id)   => http.delete(`/ai-tutor/conversations/${id}`).then((r) => r.data);

// Streaming (SSE-shaped) response — not a plain axios call. Reads the
// response body as a stream and invokes onDelta/onDone/onError as frames
// arrive. Uses fetch directly since axios doesn't expose a readable-stream
// body in the browser.
export async function streamTutorMessage(conversationId, content, { onDelta, onDone, onError }) {
  const baseURL = http.defaults.baseURL || '/api';
  let response;
  try {
    response = await fetch(`${baseURL}/ai-tutor/conversations/${conversationId}/messages`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken(),
      },
      body: JSON.stringify({ content }),
    });
  } catch {
    onError?.('Network error. Please check your connection and try again.');
    return;
  }

  if (!response.ok || !response.body) {
    let message = 'Something went wrong. Please try again.';
    try { message = (await response.json())?.message || message; } catch { /* noop */ }
    onError?.(message);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      let payload;
      try { payload = JSON.parse(line.slice(6)); } catch { continue; }

      if (payload.type === 'delta') onDelta?.(payload.text);
      else if (payload.type === 'done') onDone?.(payload);
      else if (payload.type === 'error') onError?.(payload.message);
    }
  }
}
