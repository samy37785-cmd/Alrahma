import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR   = path.join(__dirname, '..', 'logs');
const IS_PROD   = process.env.NODE_ENV === 'production';
const IS_TEST   = process.env.NODE_ENV === 'test';

const { combine, timestamp, errors, json, colorize, printf } = format;

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const extras = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} [${level}] ${message}${extras}${stack ? `\n${stack}` : ''}`;
  }),
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json(),
);

const rotatingFile = (filename, level) =>
  new DailyRotateFile({
    dirname:     LOG_DIR,
    filename:    `${filename}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize:     '20m',
    maxFiles:    '14d',
    level,
  });

const logger = createLogger({
  level:       process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'debug'),
  silent:      IS_TEST,
  exitOnError: false,
  format:      IS_PROD ? prodFormat : devFormat,
  transports: [
    new transports.Console(),
    ...(IS_PROD
      ? [rotatingFile('app', 'info'), rotatingFile('error', 'error')]
      : []),
  ],
  exceptionHandlers: IS_PROD ? [rotatingFile('exceptions', 'error')] : [new transports.Console()],
  rejectionHandlers: IS_PROD ? [rotatingFile('rejections', 'error')] : [new transports.Console()],
});

export default logger;
