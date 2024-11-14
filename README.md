# Axios Retry Client

A class based api client for both the server and browser built on `axios` and `axios-retry`, written in TypeScript

## Installation

```bash
npm install @reggieofarrell/axios-retry-client
```
## `1.x` Breaking Changes
`maxRetries`, `initialRetryDelay`, `exponentialBackoff` config options have been removed in favor of just exposing the entire `axios-retry` configuration via a `retryConfig` option. A `enableRetry` option was also added which defaults to `false`.

## `2.x` Breaking Changes
`enableRetry` was removed in favor of just honoring `retryConfig.retries` which defaults to `0`. To enable retries, pass a minimum `retryConfig` of `{ retries: number }`

## Usage

### Configuration Options

The `AxiosRetryClient` accepts the following configuration options:

- `axiosConfig`: Configuration for the underlying [axios instance](https://axios-http.com/docs/instance).
- `baseURL`: Base URL for the API.
- `debug`: Whether to log request and response details.
- `debugLevel`: Debug level. 'normal' will log request and response data. 'verbose' will log all axios properties for the request and response.
- `name`: Name of the client. Used for logging.
- `retryConfig`: Configuration for `axios-retry` See https://www.npmjs.com/package/axios-retry for more details. The default config if you don't override it is `{ retries: 0, retryDelay: axiosRetry.exponentialDelay }` with an initial delay of 500ms. You can override individual properties in the `retryConfig` and they will be merged with the default.

For more details, refer to the [source code](src/axios-retry-client.ts).

### Basic Setup

```typescript
import { AxiosRetryClient } from '@reggieofarrell/axios-retry-client';

const client = new AxiosRetryClient({
  baseURL: 'https://api.example.com',
  name: 'ExampleClient',
  retryConfig: {
    retries: 2
  }
});
```

### Making Requests

#### GET Request

```typescript
const { data } = await client.get('/endpoint');
console.log(data);
```

#### POST Request

```typescript
const { data } = await client.post('/endpoint', { key: 'value' });
console.log(data);
```

#### PUT Request

```typescript
const { data } = await client.put('/endpoint', { key: 'updatedValue' });
console.log(data);
```

#### PATCH Request

```typescript
const { data } = await client.patch('/endpoint', { key: 'patchedValue' });
console.log(data);
```

#### DELETE Request

```typescript
const { data } = await client.delete('/endpoint');
console.log(data);
```

### Accessing the underly Axios request
Requests return `request` and `data` with `request` being the underlying `axios` request in case you need to dig into this.

```typescript
const { request, data } = await client.get('/endpoint');
console.log(data);
```

### Type responses
```typescript
// pass a generic if you're using typescript to get a typed response
const { data } = await client.get<SomeResponseType>('/endpoint')
```

### Custom request config
Pass an [AxiosRequestConfig](https://axios-http.com/docs/req_config) as the final argument for any of the
request methods to customize the request config for a specific request (additional headers, etc)
```typescript
const { data } = await client.get('/endpoint', {
  headers: {
    'X-Some-Header': 'value'
  },
  timeout: 5000
})
```
In addition to the [AxiosRequestConfig](https://axios-http.com/docs/req_config) options, you can also pass override options for `axios-retry` per request
```typescript
const { data } = await client.get('/endpoint', {
  'axios-retry': {
    retries: 5
  }
})
```

### Disable TLS checks (server only)
If necessary you can disable the TLS checks in case the server you are hitting is using a self-signed
certificate or has some other TLS issue
```typescript
const client = new AxiosRetryClient({
  baseURL: 'https://api.example.com',
  name: 'ExampleClient',
  axiosConfig: {
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    });
  }
});
```

### Logging / Error Handling

The client includes built-in error handling that logs detailed information based on the debug level.
For more granular control, you can extend the AxiosRetryClient class to implement your own `errorHandler` function

### Extending

AxiosRetryClient is meant to be extended for the purpose of interacting with a specific api. This way you can set common headers, create your own error handling function that is specific to the api you are consuming, etc. This is a basic example...

```typescript
import { ApiResponseError, AxiosRetryClient } from '@reggieofarrell/axios-retry-client';

const defaultHeaders = {
  Authorization: `Basic ${process.env.MY_AUTH_TOKEN}`
};

export class CustomApiClient extends AxiosRetryClient {
  constructor() {
    super({
      baseURL: 'https://api.example.com',
      name: 'Example API Client',
      retryConfig: {
        retries: 2
      }
      axiosConfig: {
        headers: {
          Authorization: `Basic ${process.env.MY_AUTH_TOKEN}`
        }
      }
    })
  }

  protected errorHandler = (error: any, reqType: RequestType, url: string) {
    /**
     * do your custom error handline logic based on the docs for
     * the API you are consuming.
     * https://axios-http.com/docs/handling_errors
     */
  }

  // optionally build out your own SDK of sorts like so...

  someEndpointGroup = {
    get: async (): Promise<SomeTypedResponse> => {
      return (await this.get('/some-endpoint-group/something'))
    }
  }

  /**
   * Note:
   *
   * If you are going to follow the pattern above of namespacing groups of endpoints,
   * make sure to use arrow functions so that 'this' is correctly bound to the class instance
   */
}

// In some other file...
import { CustomApiClient } from './CustomApiClient';
const client = new CustomApiClient();

const { data } = await client.someEndpointGroup.get();

// or simply...

const { data } = await client.get('/some-endpoint');

```
### Hooks

If you are extending AxiosRetryClient to create your own class, there are some class methods you can override to hook into the request lifecycle.

#### preRequestFilter

```typescript
/**
 * Called before the request is actually sent.
 *
 * Define this method in your extending class to globally modify the
 * request data or config before the request is sent.
 *
 * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
 * @param url - The request URL
 * @param data - The request data
 * @param config - The request config
 */
preRequestFilter(
  requestType: RequestType,
  url: string,
  data?: any,
  config: AxiosRequestConfig = {}
): { data?: any; config: AxiosRequestConfig } {
  // do something to modify `data` or `config`
  return { data, config };
}
```

#### preRequestAction

```typescript
/**
 * Called after `beforeRequestFilter` but before the request is sent.
 *
 * Define this requestType in your extending class to perform any actions before
 * the request is sent such as logging the request details.
 *
 * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
 * @param url - The request URL
 * @param data - The request data
 * @param config - The request config
 */
protected preRequestAction(
  requestType: RequestType,
  url: string,
  data?: any,
  config: AxiosRequestConfig = {}
): void {
  // do some logging, etc
}
```

## License

This project is licensed under the 0BSD License. See the [LICENSE](license.txt) file for details.

## Dependencies

This project is build on top of the following open-source libraries:

- [axios](https://github.com/axios/axios) - Promise based HTTP client for the browser and node.js (MIT License)
- [axios-retry](https://github.com/softonic/axios-retry) - Axios plugin that intercepts failed requests and retries them whenever possible (Apache License 2.0)

For full license texts, please refer to the respective project repositories.
