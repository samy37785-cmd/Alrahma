import { body } from 'express-validator';

export const sendMessageValidation = [
  body('content').trim().notEmpty().withMessage('Message is required').isLength({ max: 4000 }),
];
