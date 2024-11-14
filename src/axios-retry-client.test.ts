// @ts-expect-error - jest doesn't understand the types
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { AxiosRetryClient, RequestType, ApiResponseError } from './axios-retry-client';
import MockAdapter from 'axios-mock-adapter';

jest.mock('./logger', () => ({
  logData: jest.fn(),
  logInfo: jest.fn(),
}));

describe('AxiosRetryClient', () => {
  let client: AxiosRetryClient;
  let mockAxios: MockAdapter;

  beforeEach(() => {
    client = new AxiosRetryClient({
      baseURL: 'https://api.example.com',
      debug: true,
    });
    mockAxios = new MockAdapter(client.axios);
  });

  afterEach(() => {
    mockAxios.reset();
  });

  describe('Constructor Options', () => {
    test('uses default options when not provided', () => {
      const client = new AxiosRetryClient({
        baseURL: 'https://api.example.com',
      });

      expect(client.debug).toBe(false);
      expect(client.debugLevel).toBe('normal');
      expect(client.name).toBe('AxiosRetryClient');
      expect(client.retryConfig).toEqual({
        retries: 0,
        retryDelay: expect.any(Function),
      });
    });

    test('overrides default options with provided values', () => {
      const client = new AxiosRetryClient({
        baseURL: 'https://api.example.com',
        debug: true,
        debugLevel: 'verbose',
        name: 'CustomClient',
        retryConfig: {
          retries: 5,
        },
      });

      expect(client.debug).toBe(true);
      expect(client.debugLevel).toBe('verbose');
      expect(client.name).toBe('CustomClient');
      expect(client.retryConfig).toEqual({
        retries: 5,
        retryDelay: axiosRetry.exponentialDelay,
      });
    });
  });

  describe('HTTP Methods', () => {
    const testData = { message: 'success' };
    const testUrl = '/test';

    test('GET request', async () => {
      mockAxios.onGet(testUrl).reply(200, testData);

      const response = await client.get(testUrl);

      expect(response.data).toEqual(testData);
      expect(response.request.status).toBe(200);
    });

    test('POST request', async () => {
      const payload = { name: 'test' };
      mockAxios.onPost(testUrl, payload).reply(201, testData);

      const response = await client.post(testUrl, payload);

      expect(response.data).toEqual(testData);
      expect(response.request.status).toBe(201);
    });

    test('PUT request', async () => {
      const payload = { name: 'test' };
      mockAxios.onPut(testUrl, payload).reply(200, testData);

      const response = await client.put(testUrl, payload);

      expect(response.data).toEqual(testData);
      expect(response.request.status).toBe(200);
    });

    test('PATCH request', async () => {
      const payload = { name: 'test' };
      mockAxios.onPatch('/test', payload).reply(200, { updated: true });

      const response = await client.patch('/test', payload);
      expect(response.data).toEqual({ updated: true });
    });

    test('DELETE request', async () => {
      mockAxios.onDelete('/test').reply(204);

      const response = await client.delete('/test');
      expect(response.request.status).toBe(204);
    });

    test('handles query parameters correctly', async () => {
      mockAxios.onGet('/test', { params: { foo: 'bar' } }).reply(200, { success: true });

      const response = await client.get('/test', {
        params: { foo: 'bar' }
      });
      expect(response.data).toEqual({ success: true });
    });

    test('handles request headers', async () => {
      mockAxios.onGet('/test').reply(function(config) {
        // Check if the header matches exactly
        if (config.headers?.['X-Custom-Header'] === 'test-value') {
          return [200, { success: true }];
        }
        return [400, { error: 'Header mismatch' }];
      });

      const response = await client.get('/test', {
        headers: { 'X-Custom-Header': 'test-value' }
      });
      expect(response.data).toEqual({ success: true });
    });
  });

  describe('Error Handling', () => {
    test('handles API error with message', async () => {
      const errorResponse = {
        message: 'Not Found',
        status: 404
      };

      mockAxios.onGet('/error').reply(404, errorResponse);

      await expect(client.get('/error')).rejects.toThrow(ApiResponseError);
      await expect(client.get('/error')).rejects.toMatchObject({
        status: 404,
        response: errorResponse
      });
    });

    test('handles network error', async () => {
      mockAxios.onGet('/network-error').networkError();

      await expect(client.get('/network-error')).rejects.toThrow(Error);
    });

    test('handles 500 server error', async () => {
      mockAxios.onGet('/server-error').reply(500, {
        message: 'Internal Server Error'
      });

      await expect(client.get('/server-error')).rejects.toThrow(ApiResponseError);
    });

    test('handles timeout error', async () => {
      mockAxios.onGet('/timeout').timeout();

      await expect(client.get('/timeout')).rejects.toThrow();
    });

    test('handles error without response data', async () => {
      mockAxios.onGet('/error').reply(403);

      await expect(client.get('/error')).rejects.toThrow();
    });

    test('handles error with non-standard response format', async () => {
      mockAxios.onGet('/error').reply(400, {
        errors: ['Invalid input'],  // Different format than message
      });

      await expect(client.get('/error')).rejects.toThrow(ApiResponseError);
    });
  });

  describe('Retry Functionality', () => {
    test('retries on failure when enabled', async () => {
      const retryClient = new AxiosRetryClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 2,
          retryDelay: () => 100,
        },
      });

      const mockRetryAxios = new MockAdapter(retryClient.axios);
      let attemptCount = 0;

      mockRetryAxios.onGet('/retry').reply(() => {
        attemptCount++;
        return attemptCount < 2 ? [500, {}] : [200, { success: true }];
      });

      const response = await retryClient.get('/retry');
      expect(response.data).toEqual({ success: true });
      expect(attemptCount).toBe(2);
    });

    test('respects per-request retry config', async () => {
      let attemptCount = 0;
      mockAxios.onGet('/retry-per-request').reply(() => {
        attemptCount++;
        return attemptCount < 3 ? [500, {}] : [200, { success: true }];
      });

      const response = await client.get('/retry-per-request', {
        'axios-retry': {
          retries: 3,
          retryDelay: () => 100,
        }
      });

      expect(response.data).toEqual({ success: true });
      expect(attemptCount).toBe(3);
    });

    test('does not retry on non-retryable status codes', async () => {
      const retryClient = new AxiosRetryClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 3,
        },
      });

      const mockRetryAxios = new MockAdapter(retryClient.axios);
      let attemptCount = 0;

      mockRetryAxios.onGet('/no-retry').reply(() => {
        attemptCount++;
        return [400, { error: 'Bad Request' }];
      });

      await expect(retryClient.get('/no-retry')).rejects.toThrow();
      expect(attemptCount).toBe(1);
    });
  });

  describe('Request Modification', () => {
    test('allows request modification through preRequestFilter', async () => {
      class CustomClient extends AxiosRetryClient {
        protected async preRequestFilter(
          _requestType: RequestType,
          _url: string,
          data: any,
          config: any
        ) {
          return {
            data: { ...data, modified: true },
            config: { ...config, headers: { 'X-Custom': 'test' } },
          };
        }
      }

      const customClient = new CustomClient({
        baseURL: 'https://api.example.com',
      });
      const mockCustomAxios = new MockAdapter(customClient.axios);

      mockCustomAxios.onPost('/modified').reply((config) => {
        expect(config.data).toContain('modified":true');
        expect(config.headers!['X-Custom']).toBe('test');
        return [200, { success: true }];
      });

      await customClient.post('/modified', { original: true });
    });
  });

  describe('Debug Logging', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('logs verbose request details when debugLevel is verbose', async () => {
      const verboseClient = new AxiosRetryClient({
        baseURL: 'https://api.example.com',
        debug: true,
        debugLevel: 'verbose',
      });
      const mockVerboseAxios = new MockAdapter(verboseClient.axios);

      mockVerboseAxios.onGet('/test').reply(200, { success: true });

      await verboseClient.get('/test');

      expect(require('./logger').logData).toHaveBeenCalledWith(
        expect.stringContaining('GET /test'),
        expect.objectContaining({ config: expect.any(Object) })
      );
    });

    test('logs normal request details when debugLevel is normal', async () => {
      const normalClient = new AxiosRetryClient({
        baseURL: 'https://api.example.com',
        debug: true,
        debugLevel: 'normal',
      });
      const mockNormalAxios = new MockAdapter(normalClient.axios);

      mockNormalAxios.onPost('/test', { data: 'test' }).reply(200, { success: true });

      await normalClient.post('/test', { data: 'test' });

      expect(require('./logger').logData).toHaveBeenCalledWith(
        expect.stringContaining('POST /test'),
        expect.objectContaining({ data: { data: 'test' } })
      );
    });
  });
});
