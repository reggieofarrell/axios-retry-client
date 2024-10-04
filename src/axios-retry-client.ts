import axios from 'axios';
import type { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import { logData, logInfo } from './logger';

export enum RequestType {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}

export interface RetryOptions {
  maxRetries?: number;
  initialRetryDelay?: number;
  exponentialBackoff?: boolean;
}

export interface AxiosRetryClientRequestConfig extends AxiosRequestConfig {
  maxRetries?: RetryOptions['maxRetries'];
  initialRetryDelay?: RetryOptions['initialRetryDelay'];
  exponentialBackoff?: RetryOptions['exponentialBackoff'];
}

export interface AxiosRetryClientResponse<T> {
  request: AxiosResponse;
  data: T;
}

export interface AxiosRetryClientOptions {
  /**
   * Configuration for the underlying axios instance
   */
  axiosConfig?: Omit<AxiosRequestConfig, 'baseURL'>;
  /**
   * Base URL for the API
   */
  baseURL: string;
  /**
   * Number of maxRetries to attempt. Defaults to 0.
   * Change to a positive number to enable retries.
   */
  maxRetries?: RetryOptions['maxRetries'];
  /**
   * Retry delay in milliseconds. Default is 1000 milliseconds (1 second)
   */
  initialRetryDelay?: RetryOptions['initialRetryDelay'];
  /**
   * Whether to use exponential backoff for retry delay, defaults to true.
   */
  exponentialBackoff?: RetryOptions['exponentialBackoff'];
  /**
   * Whether to log request and response details
   */
  debug?: boolean;
  /**
   * Debug level. 'normal' will log request and response data. 'verbose' will
   * log all axios properties for the request and response
   */
  debugLevel?: 'normal' | 'verbose';
  /**
   * Name of the client. Used for logging
   */
  name?: string;
}

export class AxiosRetryClient {
  axios: AxiosInstance;
  initialRetryDelay: AxiosRetryClientOptions['initialRetryDelay'] = 1000;
  debug: AxiosRetryClientOptions['debug'];
  debugLevel: AxiosRetryClientOptions['debugLevel'];
  name: AxiosRetryClientOptions['name'];
  maxRetries: AxiosRetryClientOptions['maxRetries'];
  exponentialBackoff: AxiosRetryClientOptions['exponentialBackoff'];
  axiosConfig: AxiosRetryClientOptions['axiosConfig'];
  baseURL: AxiosRetryClientOptions['baseURL'];

  constructor(config: AxiosRetryClientOptions) {
    config = {
      axiosConfig: {},
      maxRetries: 0,
      initialRetryDelay: 1000,
      exponentialBackoff: true,
      debug: false,
      debugLevel: 'normal',
      name: 'AxiosRetryClient',
      ...config,
    };

    this.initialRetryDelay = config.initialRetryDelay;
    this.maxRetries = config.maxRetries;
    this.exponentialBackoff = config.exponentialBackoff;
    this.debug = config.debug;
    this.debugLevel = config.debugLevel;
    this.name = config.name;
    this.axiosConfig = config.axiosConfig;
    this.baseURL = config.baseURL;

    const client = axios.create({
      ...config.axiosConfig,
      baseURL: config.baseURL,
    });

    if (config.maxRetries! > 0) {
      axiosRetry(client, {
        retries: config.maxRetries!,
        retryDelay: config.exponentialBackoff ? this._exponentialBackoff : this._initialRetryDelay,
      });
    }

    this.axios = client;
  }

  private async _request<T>(
    requestType: RequestType,
    url: string,
    data?: any,
    config: AxiosRetryClientRequestConfig = {}
  ): Promise<AxiosRetryClientResponse<T>> {
    let req: AxiosResponse<T> | undefined;

    // Call beforeRequest hook to potentially modify the request parameters
    const filteredArgs = this.beforeRequestFilter(requestType, url, data, config);
    data = filteredArgs.data;
    config = filteredArgs.config;

    // Call beforeRequestAction hook to perform any actions before the request is sent
    this.beforeRequestAction(requestType, url, data, config);

    let axiosInstance = this.axios;

    if (config.maxRetries !== undefined) {
      axiosInstance = this.createNewAxiosInstanceWithRetry({
        maxRetries: config.maxRetries!,
        initialRetryDelay: config.initialRetryDelay ?? this.initialRetryDelay!,
        exponentialBackoff: config.exponentialBackoff ?? this.exponentialBackoff!,
      });
    }

    try {
      switch (requestType) {
        case RequestType.GET:
          req = await axiosInstance.get<T>(url, config);
          break;
        case RequestType.POST:
          req = await axiosInstance.post<T>(url, data, config);
          break;
        case RequestType.PUT:
          req = await axiosInstance.put<T>(url, data, config);
          break;
        case RequestType.PATCH:
          req = await axiosInstance.patch<T>(url, data, config);
          break;
        case RequestType.DELETE:
          req = await axiosInstance.delete<T>(url, config);
          break;
      }
    } catch (error) {
      this.errorHandler(error, requestType, url);
    }

    return { request: req!, data: req!.data };
  }

  /**
   * Creates a new axios instance with retry options
   * @param retryOptions - The retry options
   * @returns The new axios instance
   */
  protected createNewAxiosInstanceWithRetry(retryOptions: RetryOptions = {}): AxiosInstance {
    const axiosInstance = axios.create({
      ...this.axiosConfig,
      baseURL: this.baseURL,
    });

    if (retryOptions?.maxRetries && retryOptions.maxRetries > 0) {
      axiosRetry(axiosInstance, {
        retries: retryOptions.maxRetries,
        retryDelay: retryOptions.exponentialBackoff
          ? (retryNumber: number, _error: AxiosError) =>
              Math.pow(retryOptions.initialRetryDelay ?? this.initialRetryDelay!, retryNumber)
          : (_retryNumber: number, _error: AxiosError) =>
              retryOptions.initialRetryDelay ?? this.initialRetryDelay!,
      });
    }

    return axiosInstance;
  }

  async get<T = any>(
    url: string,
    config: AxiosRetryClientRequestConfig = {}
  ): Promise<AxiosRetryClientResponse<T>> {
    return this._request<T>(RequestType.GET, url, undefined, config);
  }

  async post<T = any>(
    url: string,
    data: any,
    config: AxiosRetryClientRequestConfig = {}
  ): Promise<AxiosRetryClientResponse<T>> {
    return this._request<T>(RequestType.POST, url, data, config);
  }

  async put<T = any>(
    url: string,
    data: any,
    config: AxiosRetryClientRequestConfig = {}
  ): Promise<AxiosRetryClientResponse<T>> {
    return this._request<T>(RequestType.PUT, url, data, config);
  }

  async patch<T = any>(
    url: string,
    data: any,
    config: AxiosRetryClientRequestConfig = {}
  ): Promise<AxiosRetryClientResponse<T>> {
    return this._request<T>(RequestType.PATCH, url, data, config);
  }

  async delete<T = any>(
    url: string,
    config: AxiosRetryClientRequestConfig = {}
  ): Promise<AxiosRetryClientResponse<T>> {
    return this._request<T>(RequestType.DELETE, url, undefined, config);
  }

  private _exponentialBackoff = (retryNumber: number) => {
    return Math.pow(this.initialRetryDelay!, retryNumber);
  };

  private _initialRetryDelay = () => this.initialRetryDelay!;

  /**
   * Define this requestType in your extending class to globally modify the
   * request data or config before the request is sent.
   *
   * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
   * @param url - The request URL
   * @param data - The request data
   * @param config - The request config
   * @returns The modified request parameters
   */
  protected beforeRequestFilter(
    //@ts-ignore
    requestType: RequestType,
    //@ts-ignore
    url: string,
    data: any,
    config: AxiosRequestConfig
  ): { data?: any; config: AxiosRequestConfig } {
    return { data, config };
  }

  /**
   * Override this method in your extending class to perform any actions before
   * the request is sent such as logging the request details. By default, this will
   * log the request details if debug is enabled.
   * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
   * @param url - The request URL
   * @param data - The request data
   * @param config - The request config
   */
  protected beforeRequestAction(
    requestType: RequestType,
    url: string,
    data: any,
    config: AxiosRequestConfig
  ): void {
    if (this.debug) {
      logData(`[${this.name}] ${requestType} ${url}`, { data, config });
    }
  }

  /**
   * Handles errors from the axios instance. Override this method for
   * custom error handling functionality specific to the API you are
   * consuming.
   * @param error - The error object
   * @param reqType - The request type
   * @param url - The request URL
   * @see https://axios-http.com/docs/handling_errors
   */
  protected errorHandler(error: any, reqType: RequestType, url: string) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      if (this.debug) {
        if (this.debugLevel === 'verbose') {
          logData(`[${this.name}] ${reqType} ${url} : error.response`, error.response);
        } else {
          logData(`[${this.name}] ${reqType} ${url} : error.response.data`, error.response.data);
        }
      }

      if (error.response.data && error.response.status && error.response.data?.message) {
        throw new ApiResponseError(
          `[${this.name}] ${reqType} ${url} : [${error.response.status}] ${error.response.data.message}`,
          error.response.status,
          error.response.data,
          error
        );
      } else if (
        error.response &&
        error.response.status &&
        error.response.data &&
        !error.response.data?.message
      ) {
        throw new ApiResponseError(
          `[${this.name}] ${reqType} ${url} : [${error.response.status}]`,
          error.response.status,
          error.response.data,
          error
        );
      } else {
        throw new Error(error);
      }
    } else {
      this.handleResponseNotReceivedOrOtherError(error, reqType, url);
    }
  }

  /**
   * Handles errors where a response is not received or other errors occur
   * @param error - The error object
   * @param reqType - The request type
   * @param url - The request URL
   */
  protected handleResponseNotReceivedOrOtherError(error: any, reqType: RequestType, url: string) {
    if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      if (this.debug) {
        if (this.debugLevel === 'verbose') {
          logData(`${this.name}] ${reqType} ${url}: error.config`, error.config);
        }
        logData(`[${this.name}] ${reqType} ${url} : error.request`, error.request);
      }

      throw new Error(`[${this.name}] ${reqType} ${url} [no response] : ${error.message}`, {
        cause: error,
      });
    } else {
      // Something happened in setting up the request that triggered an Error
      if (this.debug) {
        if (this.debugLevel === 'verbose') {
          logData(`[${this.name}] ${reqType} ${url} : error`, error);
        } else {
          logInfo(`[${this.name}] ${reqType} ${url} error.message : ${error.message}`);
        }
      }

      if (error.message) {
        throw new Error(`[${this.name}] ${reqType} ${url} : ${error.message}`, {
          cause: error,
        });
      } else {
        throw new Error(error);
      }
    }
  }
}

/**
 * Base class for API errors.
 * @extends Error
 */
export class ApiResponseError extends Error {
  /**
   * The HTTP status code.
   */
  status: number;
  /**
   * The response text.
   */
  response: object | string;
  /**
   * The cause of the error. Usually an AxiosError.
   */
  cause?: any;

  /**
   * Creates an instance of ApiError.
   * @param {string} message - The error message.
   * @param {number} status - The HTTP status code.
   * @param {object|string} response - The response.
   * @param {any} cause - The cause of the error.
   */
  constructor(message: string, status: number, response: object | string, cause?: any) {
    super(message, { cause });
    this.status = status;
    this.response = response;
  }
}
