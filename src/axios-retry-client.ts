import axios from 'axios';
import type { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry, { type IAxiosRetryConfig, AxiosRetry } from 'axios-retry';
import { logData } from './logger';

export enum RequestType {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}

type BackoffOptions = 'exponential' | 'linear' | 'none';

export interface AxiosRetryClientRetryConfig extends IAxiosRetryConfig {
  delayFactor?: number;
  backoff?: BackoffOptions;
}

export interface AxiosRetryClientRequestConfig extends AxiosRequestConfig {
  retryConfig?: AxiosRetryClientRetryConfig;
}

export interface AxiosRetryClientResponse<T> {
  request: AxiosResponse;
  data: T;
}

export interface AxiosRetryClientOptions extends IAxiosRetryConfig {
  /**
   * Configuration for the underlying axios instance
   */
  axiosConfig?: Omit<AxiosRequestConfig, 'baseURL'>;
  /**
   * Base URL for the API
   */
  baseURL: string;
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
  /**
   * Our extended configuration for the axios-retry plugin. See [axios-retry](https://www.npmjs.com/package/axios-retry) for more details.
   * The default configuration is `{ retries: 3, retryDelay: axiosRetry.exponentialDelay } with a 500ms initial retry delay`.
   */
  retryConfig?: AxiosRetryClientRetryConfig;
}

export class AxiosRetryClient {
  axios: AxiosInstance;
  axiosConfig: AxiosRetryClientOptions['axiosConfig'];
  axiosRetry: AxiosRetry;
  baseURL: AxiosRetryClientOptions['baseURL'];
  debug: AxiosRetryClientOptions['debug'];
  debugLevel: AxiosRetryClientOptions['debugLevel'];
  name: AxiosRetryClientOptions['name'];
  retryConfig: AxiosRetryClientRetryConfig;

  constructor(config: AxiosRetryClientOptions) {
    const backoff = config.retryConfig?.backoff || 'exponential';
    const delayFactor = config.retryConfig?.delayFactor || 500;
    const name = config.name || 'AxiosRetryClient';

    const defaultRetryConfig: AxiosRetryClientRetryConfig = {
      retries: 0,
      retryDelay: (retryCount: number, error: AxiosError<unknown, any>) =>
        this.getRetryDelay(retryCount, error, backoff, delayFactor),
      onRetry: (retryCount, error, requestConfig) => {
        if (this.debug) {
          console.log(`[${name}] Retry #${retryCount} for ${requestConfig.baseURL}${requestConfig.url} due to error: ${error.message}`);
        }
      },
      delayFactor,
      backoff,
    };

    const retryConfig: AxiosRetryClientRetryConfig = config.retryConfig
      ? {
          ...defaultRetryConfig,
          ...config.retryConfig,
        }
      : defaultRetryConfig;

    delete config.retryConfig;

    config = {
      axiosConfig: {},
      retryConfig,
      debug: false,
      debugLevel: 'normal',
      name,
      ...config,
    };

    this.axiosConfig = config.axiosConfig;
    this.axiosRetry = axiosRetry;
    this.baseURL = config.baseURL;
    this.debug = config.debug;
    this.debugLevel = config.debugLevel;
    this.name = config.name;
    this.retryConfig = config.retryConfig!;

    const client = axios.create({
      ...config.axiosConfig,
      baseURL: config.baseURL,
    });

    axiosRetry(client, config.retryConfig);

    this.axios = client;
  }

  private getRetryDelay(
    retryCount: number,
    error: AxiosError<unknown, any>,
    backoff: string,
    delayFactor: number
  ): number {
    if (backoff === 'exponential') {
      return axiosRetry.exponentialDelay(retryCount, error, delayFactor);
    } else if (backoff === 'linear') {
      return axiosRetry.linearDelay(delayFactor)(retryCount, error);
    } else {
      return delayFactor;
    }
  }

  private async _request<T>(
    requestType: RequestType,
    url: string,
    data?: any,
    config: AxiosRetryClientRequestConfig = {}
  ): Promise<AxiosRetryClientResponse<T>> {
    let req: AxiosResponse<T> | undefined;

    if (config.retryConfig) {
      let retryConfig: IAxiosRetryConfig;

      if (config.retryConfig.backoff || config.retryConfig.delayFactor) {
        retryConfig = {
          ...this.retryConfig,
          retryDelay: (retryCount: number, error: AxiosError<unknown, any>) =>
            this.getRetryDelay(
              retryCount,
              error,
              config.retryConfig?.backoff || this.retryConfig.backoff!,
              config.retryConfig?.delayFactor || this.retryConfig.delayFactor!
            ),
          ...config.retryConfig,
        };
      } else {
        retryConfig = {
          ...this.retryConfig,
          ...config.retryConfig,
        };
      }

      config['axios-retry'] = retryConfig;
    }

    // Call beforeRequest hook to potentially modify the request parameters
    const filteredArgs = await this.preRequestFilter(requestType, url, data, config);
    data = filteredArgs.data ?? data;
    config = filteredArgs.config ?? config;

    // Call beforeRequestAction hook to perform any actions before the request is sent
    await this.preRequestAction(requestType, url, data, config);

    try {
      switch (requestType) {
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
      this.errorHandler(error, requestType, url);
    }

    return { request: req!, data: req!.data };
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

  /**
   * Override this method in your extending class to modify the request data or
   * config before the request is sent.
   *
   * @deprecated Use preRequestFilter instead. This will be removed in a future version.
   * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
   * @param url - The request URL
   * @param data - The request data
   * @param config - The request config
   * @returns The modified request parameters
   */
  protected async beforeRequestFilter(
    requestType: RequestType,
    url: string,
    data: any,
    config: AxiosRequestConfig
  ) {
    return this.preRequestFilter(requestType, url, data, config);
  }

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
  protected async preRequestFilter(
    // @ts-expect-error - not used here, but may be used in a subclass
    requestType: RequestType,
    // @ts-expect-error - not used here, but may be used in a subclass
    url: string,
    data: any,
    config: AxiosRequestConfig
  ): Promise<{ data: any; config: AxiosRequestConfig }> {
    return { data, config };
  }

  /**
   * Override this method in your extending class to perform any actions before
   * the request is sent such as logging the request details. By default, this will
   * log the request details if debug is enabled.
   *
   * @deprecated Use preRequestAction instead. This will be removed in a future version.
   * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
   * @param url - The request URL
   * @param data - The request data
   * @param config - The request config
   */
  protected async beforeRequestAction(
    requestType: RequestType,
    url: string,
    data: any,
    config: AxiosRequestConfig
  ): Promise<void> {
    return this.preRequestAction(requestType, url, data, config);
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
  protected async preRequestAction(
    requestType: RequestType,
    url: string,
    data: any,
    config: AxiosRequestConfig
  ): Promise<void> {
    if (this.debug) {
      if (this.debugLevel === 'verbose') {
        logData(`[${this.name}] ${requestType} ${url}`, { data, config });
      } else {
        logData(`[${this.name}] ${requestType} ${url}`, { data });
      }
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
          error.toString ? error.toString() : error
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
          error.toString ? error.toString() : error
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
          console.log(`[${this.name}] ${reqType} ${url} error.message : ${error.message}`);
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
