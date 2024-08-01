import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import { logData, logInfo } from './logger';

export enum RequestType {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
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
   * Number of maxRetries to attempt
   */
  maxRetries?: number;
  /**
   * Retry delay in milliseconds. Default is 1000 milliseconds (1 second)
   */
  initialRetryDelay?: number;
  /**
   * Whether to use exponential backoff for retry delay
   */
  exponentialBackoff?: boolean;
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
    this.debug = config.debug;
    this.debugLevel = config.debugLevel;
    this.name = config.name;

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
    method: RequestType,
    url: string,
    data?: any,
    config: AxiosRequestConfig = {}
  ): Promise<AxiosRetryClientResponse<T>> {
    let req: AxiosResponse<T> | undefined;

    try {
      switch (method) {
        case RequestType.GET:
          req = await this.axios.get<T>(url, config);
          break;
        case RequestType.POST:
          req = await this.axios.post<T>(url, data, config);
          break;
        case RequestType.PUT:
          req = await this.axios.put<T>(url, data, config);
          break;
        case RequestType.PATCH:
          req = await this.axios.patch<T>(url, data, config);
          break;
        case RequestType.DELETE:
          req = await this.axios.delete<T>(url, config);
          break;
      }
    } catch (error) {
      this.errorHandler(error, method, url);
    }

    return { request: req!, data: req!.data };
  }

  async get<T = any>(
    url: string,
    config: AxiosRequestConfig = {}
  ): Promise<AxiosRetryClientResponse<T>> {
    return this._request<T>(RequestType.GET, url, undefined, config);
  }

  async post<T = any>(
    url: string,
    data: any,
    config: AxiosRequestConfig = {}
  ): Promise<AxiosRetryClientResponse<T>> {
    return this._request<T>(RequestType.POST, url, data, config);
  }

  async put<T = any>(
    url: string,
    data: any,
    config: AxiosRequestConfig = {}
  ): Promise<AxiosRetryClientResponse<T>> {
    return this._request<T>(RequestType.PUT, url, data, config);
  }

  async patch<T = any>(
    url: string,
    data: any,
    config: AxiosRequestConfig = {}
  ): Promise<AxiosRetryClientResponse<T>> {
    return this._request<T>(RequestType.PATCH, url, data, config);
  }

  async delete<T = any>(
    url: string,
    config: AxiosRequestConfig = {}
  ): Promise<AxiosRetryClientResponse<T>> {
    return this._request<T>(RequestType.DELETE, url, undefined, config);
  }

  private _exponentialBackoff = (retryNumber: number) => {
    return Math.pow(this.initialRetryDelay!, retryNumber);
  };

  private _initialRetryDelay = () => this.initialRetryDelay!;

  /**
   * Handles errors from the axios instance. Override this method for
   * custom error handling functionality specific to the API you are
   * consuming.
   * @param error - The error object
   * @param reqType - The request type
   * @param url - The request URL
   * @see https://axios-http.com/docs/handling_errors
   */
  protected errorHandler = (error: any, reqType: RequestType, url: string) => {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      if (this.debug && this.debugLevel === 'verbose') {
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
    } else if (error.request) {
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
  };
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
