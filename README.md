# Axios Retry Client

A generic REST API client based on axios with retry functionality.

## Installation

```bash
npm install @reggieofarrell/axios-retry-client
```

## Usage

### Configuration Options

The `AxiosRetryClient` accepts the following configuration options:

- `axiosConfig`: Configuration for the underlying axios instance.
- `baseURL`: Base URL for the API.
- `maxRetries`: Number of max retries to attempt.
- `initialRetryDelay`: Retry delay in seconds. Default is 1 second.
- `exponentialBackoff`: Whether to use exponential backoff for retry delay.
- `debug`: Whether to log request and response details.
- `debugLevel`: Debug level. 'normal' will log request and response data. 'verbose' will log all axios properties for the request and response.
- `name`: Name of the client. Used for logging.

For more details, refer to the [source code](src/axios-retry-client.ts).

### Basic Setup

```typescript
import { AxiosRetryClient } from '@reggieofarrell/axios-retry-client';

const client = new AxiosRetryClient({
  baseURL: 'https://api.example.com',
  maxRetries: 3,
  initialRetryDelay: 1000, // 1 second
  exponentialBackoff: true,
  debug: true,
  debugLevel: 'normal',
  name: 'ExampleClient',
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

### Disables TSL checks (server only)

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
```

## License

This project is licensed under the 0BSD License. See the [LICENSE](license.txt) file for details.
