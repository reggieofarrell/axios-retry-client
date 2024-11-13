import { logWarning, logInfo, logData, logError } from './logger';

describe('logger', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('logWarning', () => {
    it('should log message with yellow color in Node.js', () => {
      logWarning('test warning');
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[33mtest warning\x1b[0m');
    });
  });

  describe('logInfo', () => {
    it('should log message with green color in Node.js', () => {
      logInfo('test info');
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[32mtest info\x1b[0m');
    });
  });

  describe('logData', () => {
    it('should log title and string data', () => {
      logData('Test Title', 'test data');
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '\x1b[36m== Test Title ==\x1b[0m');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, 'test data');
    });

    it('should log title and object data', () => {
      const testObj = { foo: 'bar' };
      logData('Test Object', testObj);
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '\x1b[36m== Test Object ==\x1b[0m');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, JSON.stringify(testObj, null, 2));
    });

    it('should handle circular references in object data', () => {
      const circularObj: any = { foo: 'bar' };
      circularObj.self = circularObj;

      logData('Circular Object', circularObj);
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, JSON.stringify({
        foo: 'bar',
        self: '[Circular]'
      }, null, 2));
    });
  });

  describe('logError', () => {
    it('should log Error object with stack trace', () => {
      const error = new Error('test error');
      logError(error);
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m' + error.stack + '\x1b[0m');
    });

    it('should log Error with title when provided', () => {
      const error = new Error('test error');
      logError(error, 'Test Error');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '== Test Error ==');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, '\x1b[31m' + error.stack + '\x1b[0m');
    });

    it('should log Error with cause', () => {
      const cause = new Error('cause error');
      const error = new Error('test error', { cause });

      logError(error);
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m' + error.stack + '\x1b[0m');
      expect(consoleLogSpy).toHaveBeenCalledWith('');
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m== Error Cause ==\x1b[0m');
      expect(consoleLogSpy).toHaveBeenCalledWith('\x1b[31m' + cause.stack + '\x1b[0m');
    });

    it('should log non-Error objects', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      logError('string error');
      expect(consoleErrorSpy).toHaveBeenCalledWith('\x1b[31mstring error\x1b[0m');
      consoleErrorSpy.mockRestore();
    });
  });
});
