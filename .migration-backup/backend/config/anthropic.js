import Anthropic from '@anthropic-ai/sdk';

// Lazily constructed so the app doesn't crash at boot if ANTHROPIC_API_KEY
// isn't set yet — the AI Tutor routes check for this and fail cleanly
// per-request instead (see aiTutorController.js).
let client = null;

export function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const AI_TUTOR_MODEL = 'claude-opus-4-8';
