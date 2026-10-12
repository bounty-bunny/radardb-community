# API rate limits

The REST API allows 600 requests per minute per workspace token. Bulk export endpoints are limited to 10 requests per minute.

When a limit is exceeded the API returns HTTP 429 with a `Retry-After` header in seconds. Clients should wait at least that long before retrying.

Webhook deliveries do not count toward the REST API limit.
