/**
 * Simple color function that uses console color codes for Node.js
 * and falls back to plain text for browsers.
 */
const color =
  (colorCode: string) =>
  (text: string): string => {
    // @ts-expect-error - globalThis is not defined in the global scope
    if (typeof globalThis.window === 'undefined') {
      return `\x1b[${colorCode}m${text}\x1b[0m`;
    }
    return text;
  };

const yellow = color('33');
const green = color('32');
const cyan = color('36');
const red = color('31');

/**
 * Default logging functions, for when a custom error
 * handler is not implemented.
 */

/**
 * Logs a warning to the console
 */
export const logWarning = (message: string) => {
  console.log(yellow(message));
};

/**
 * Logs info to the console
 */
export const logInfo = (message: string) => {
  console.log(green(message));
};

/**
 * Safely stringifies an object to avoid circular references
 *
 * @param obj - The object to stringify
 * @param indent - The indentation level
 * @returns The stringified object
 */
const safeStringify = (obj: any, indent = 2): string => {
  const cache = new Set();
  return JSON.stringify(
    obj,
    (_, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) {
          return '[Circular]';
        }
        cache.add(value);
      }
      return value;
    },
    indent
  );
};

/**
 * Logs data - creates colorized console output for local development
 */
export const logData = (title = '', data: any) => {
  console.log('');
  console.log(cyan(`== ${title} ==`));

  if (data) {
    if (typeof data === 'object') {
      console.log(safeStringify(data));
    } else {
      console.log(data);
    }
  }
};

/**
 * Logs an error to the console
 * @param {*} error
 * @param {string} title - optional title for the error
 */
export const logError = (error: unknown, title?: string) => {
  if (title) {
    console.log('');
    console.log(`== ${title} ==`);
  }

  if (error instanceof Error) {
    console.log(red(error.stack || error.message));

    if (error.cause) {
      console.log('');
      console.log(red('== Error Cause =='));

      if (error.cause instanceof Error) {
        console.log(red(error.cause.stack || error.cause.message));
      } else {
        console.log(red(safeStringify(error.cause)));
      }
    }
  } else {
    console.error(red(String(error)));
  }
};
