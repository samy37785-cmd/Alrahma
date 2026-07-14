import { body } from 'express-validator';

export const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isString().notEmpty().withMessage('Password required'),
];

export const mfaTokenValidation = [
  body('token')
    .isString()
    .matches(/^\d{6}$/)
    .withMessage('TOTP token must be exactly 6 digits'),
];
