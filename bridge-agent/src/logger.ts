// Structured logger: writes to <userData>/bridge.log and mirrors errors to
// the console for dev runs.
import * as fs from 'fs';

let logFile = '';

export function initLogger(userDataDir: string): void {
  logFile = `${userDataDir}/bridge.log`;
}

function write(level: string, message: string, extra?: unknown): void {
  const line = `${new Date().toISOString()} [${level}] ${message}${
    extra !== undefined ? ` ${JSON.stringify(extra)}` : ''
  }\n`;
  if (logFile) {
    try {
      fs.appendFileSync(logFile, line, 'utf8');
    } catch {
      // disk full / permissions — nothing sensible to do
    }
  }
  if (level === 'ERROR') console.error(line.trim());
  else console.log(line.trim());
}

export const log = {
  info: (message: string, extra?: unknown) => write('INFO', message, extra),
  warn: (message: string, extra?: unknown) => write('WARN', message, extra),
  error: (message: string, extra?: unknown) => write('ERROR', message, extra),
};
