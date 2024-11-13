import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry, { type IAxiosRetryConfig, AxiosRetry } from 'axios-retry';
import { logData, logInfo } from './logger';

export enum RequestType {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}

export interface AxiosRetryClientRequestConfig extends AxiosRequestConfig {
  'axios-retry'?: IAxiosRetryConfig;
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
   * Whether to enable retries. Defaults to false.
   */
  enableRetry?: boolean;
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
   * Configuration for the axios-retry plugin. See [axios-retry](https://www.npmjs.com/package/axios-retry) for more details.
   * The default configuration is `{ retries: 3, retryDelay: axiosRetry.exponentialDelay }`.
   */
  retryConfig?: IAxiosRetryConfig;
}

export class AxiosRetryClient {
  axios: AxiosInstance;
  axiosConfig: AxiosRetryClientOptions['axiosConfig'];
  axiosRetry: AxiosRetry;
  baseURL: AxiosRetryClientOptions['baseURL'];
  debug: AxiosRetryClientOptions['debug'];
  debugLevel: AxiosRetryClientOptions['debugLevel'];
  enableRetry: AxiosRetryClientOptions['enableRetry'];
  name: AxiosRetryClientOptions['name'];
  retryConfig: AxiosRetryClientOptions['retryConfig'];

  constructor(config: AxiosRetryClientOptions) {
    config = {
      axiosConfig: {},
      retryConfig: {
        retries: 3,
        retryDelay: axiosRetry.exponentialDelay,
      },
      enableRetry: false,
      debug: false,
      debugLevel: 'normal',
      name: 'AxiosRetryClient',
      ...config,
    };

    this.axiosConfig = config.axiosConfig;
    this.axiosRetry = axiosRetry;
    this.baseURL = config.baseURL;
    this.debug = config.debug;
    this.debugLevel = config.debugLevel;
    this.name = config.name;
    this.retryConfig = config.retryConfig;
    this.enableRetry = config.enableRetry;

    const client = axios.create({
      ...config.axiosConfig,
      baseURL: config.baseURL,
    });

    if (config.enableRetry) {
      axiosRetry(client, config.retryConfig);
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
    const filteredArgs = await this.preRequestFilter(requestType, url, data, config);
    data = filteredArgs.data;
    config = filteredArgs.config;

    // Call beforeRequestAction hook to perform any actions before the request is sent
    await this.preRequestAction(requestType, url, data, config);

    let axiosInstance = this.axios;

    if (!!config['axios-retry'] && !this.enableRetry) {
      axiosInstance = this.createNewAxiosInstanceWithRetry(config['axios-retry']);
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
   * Creates a new axios instance with retry options. Used if `axios-retry`
   * config is provided in the request config but retry is disabled globally.
   *
   * @param retryConfig - The retry options
   * @returns The new axios instance
   */
  protected createNewAxiosInstanceWithRetry(retryConfig: IAxiosRetryConfig): AxiosInstance {
    const axiosInstance = axios.create({
      ...this.axiosConfig,
      baseURL: this.baseURL,
      // Copy over the adapter from the original instance to maintain mocks for testing, Only set adapter if it exists
      ...(this.axios.defaults.adapter && { adapter: this.axios.defaults.adapter })
    });

    retryConfig = {
      ...this.retryConfig,
      ...retryConfig,
    };

    axiosRetry(axiosInstance, retryConfig);

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
