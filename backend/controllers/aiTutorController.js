import mongoose from 'mongoose';
import env from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleValidationErrors } from '../utils/validationHelper.js';
import TutorConversation from '../models/TutorConversation.js';
import { getAnthropicClient, AI_TUTOR_MODEL } from '../config/anthropic.js';
import { AI_TUTOR_SYSTEM_PROMPT } from '../config/aiTutorSystemPrompt.js';
import logger from '../config/logger.js';

// How many of the most recent messages (user + assistant) are sent to the
// model per turn — bounds both context size and per-message cost as a
// conversation grows long.
const TUTOR_HISTORY_LIMIT = 20;
const TUTOR_MAX_OUTPUT_TOKENS = 1024;

function dailyMessageLimit() {
  return Number(env.AI_TUTOR_DAILY_MESSAGE_LIMIT) || 40;
}


export const listConversations = asyncHandler(async (req, res) => {
  const conversations = await TutorConversation.find({ user: req.user._id })
    .select('title updatedAt createdAt')
    .sort({ updatedAt: -1 })
    .lean();
  res.json(conversations);
});

export const createConversation = asyncHandler(async (req, res) => {
  const conversation = await TutorConversation.create({ user: req.user._id, messages: [] });
  res.status(201).json(conversation);
});

export const getConversation = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid conversation id' });
  }
  const conversation = await TutorConversation.findOne({ _id: req.params.id, user: req.user._id });
  if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
  res.json(conversation);
});

export const deleteConversation = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid conversation id' });
  }
  const deleted = await TutorConversation.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!deleted) return res.status(404).json({ message: 'Conversation not found' });
  res.json({ message: 'Conversation deleted' });
});

// POST /:id/messages — Server-Sent Events. Streams the assistant's reply
// token-by-token as `data: {"type":"delta","text":"..."}\n\n` frames, then
// `data: {"type":"done"}\n\n` on success or `data: {"type":"error", ...}` on
// failure. Errors after the stream has opened cannot become a normal JSON
// error response (headers are already committed to text/event-stream), so
// they're sent as an SSE error frame instead of via asyncHandler/next(err).
export const sendMessage = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid conversation id' });
  }

  const client = getAnthropicClient();
  if (!client) {
    return res.status(503).json({ message: 'AI Tutor is not configured. Please try again later.' });
  }

  const conversation = await TutorConversation.findOne({ _id: req.params.id, user: req.user._id });
  if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [usage] = await TutorConversation.aggregate([
    { $match: { user: req.user._id } },
    { $unwind: '$messages' },
    { $match: { 'messages.role': 'user', 'messages.createdAt': { $gte: since } } },
    { $count: 'count' },
  ]);
  if ((usage?.count ?? 0) >= dailyMessageLimit()) {
    return res.status(429).json({ message: "You've reached today's AI Tutor message limit. Please try again tomorrow, or message your assigned tutor." });
  }

  const { content } = req.body;
  conversation.messages.push({ role: 'user', content });
  if (conversation.messages.length === 1) {
    conversation.title = content.length > 60 ? `${content.slice(0, 57)}...` : content;
  }

  const history = conversation.messages
    .slice(-TUTOR_HISTORY_LIMIT)
    .map((m) => ({ role: m.role, content: m.content }));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let assistantText = '';
  try {
    const stream = client.messages.stream({
      model: AI_TUTOR_MODEL,
      max_tokens: TUTOR_MAX_OUTPUT_TOKENS,
      system: AI_TUTOR_SYSTEM_PROMPT,
      messages: history,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        assistantText += event.delta.text;
        res.write(`data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`);
      }
    }

    const finalMessage = await stream.finalMessage();

    conversation.messages.push({ role: 'assistant', content: assistantText });
    conversation.inputTokens += finalMessage.usage?.input_tokens ?? 0;
    conversation.outputTokens += finalMessage.usage?.output_tokens ?? 0;
    await conversation.save();

    res.write(`data: ${JSON.stringify({ type: 'done', title: conversation.title })}\n\n`);
  } catch (err) {
    logger.error('AI Tutor stream failed', { message: err.message, userId: String(req.user._id) });
    // Still save the user's message even if the reply failed, so it isn't lost.
    await conversation.save();
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Something went wrong. Please try again.' })}\n\n`);
  } finally {
    res.end();
  }
});
