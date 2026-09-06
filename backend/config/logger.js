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
  // Console is included even in production: Render (the deployment target —
  // see render.yaml) has no persistent disk configured, so the rotating log
  // files below don't survive a restart/redeploy and aren't otherwise
  // retrievable. Render's log viewer only captures stdout/stderr, which is
  // exactly what the Console transport writes to — without it, a crash's
  // exception/rejection detail would be written only to a file that's gone
  // moments later, leaving the platform's log stream with no diagnostic
  // information about why the process exited.
  exceptionHandlers: IS_PROD ? [new transports.Console(), rotatingFile('exceptions', 'error')] : [new transports.Console()],
  rejectionHandlers: IS_PROD ? [new transports.Console(), rotatingFile('rejections', 'error')] : [new transports.Console()],
});

export default logger;
