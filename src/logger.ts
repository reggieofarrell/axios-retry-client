import chalk from 'chalk';
import util from 'util';

chalk.level = 1;

/**
 * Default logging functions, for when a custom error
 * handler is not implemented.
 */

/**
 * Logs a warning to the console and Reactotron
 */
export const logWarning = (message: string) => {
  console.log(chalk.yellow(message));
};

/**
 * Logs info to to the console and Reactotron
 */
export const logInfo = (message: string) => {
  console.log(chalk.greenBright(message));
};

/**
 * Logs data - creates colorized console output for local development
 * and logs to Reactotron
 */
export const logData = (title = '', data: any) => {
  console.log('');
  console.log(chalk.cyanBright(`== ${title} ==`));

  if (data) {
    if (typeof data === 'object') {
      console.log(util.inspect(data, { showHidden: false, depth: null, colors: true }));
    } else {
      console.log(data);
    }
  }
};

/**
 * Logs an error to the console as well as Reactotron
 * @param {*} error
 * @param {Object} context - only used if error is a string
 */
export const logError = (error: unknown, title?: string) => {
  if (title) {
    console.log('');
    console.log(`== ${title} ==`);
  }

  if (error instanceof Error) {
    console.log(chalk.red(error.stack));

    if (error.cause) {
      console.log('');
      console.log(chalk.bold.red('== Error Cause =='));

      if (error.cause instanceof Error) {
        console.log(chalk.red(error.cause.stack));
      } else {
        console.log(chalk.red(JSON.stringify(error.cause, null, 2)));
      }
    }
  } else {
    console.error(chalk.red(error));
  }
};
