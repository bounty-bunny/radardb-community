# Webhooks

## Delivery
Quillstack sends webhook events as HTTP POST requests with a JSON body. Every request includes an `X-Quillstack-Signature` header computed with HMAC-SHA256 over the raw body.

## Retries
A delivery is considered failed if your endpoint does not respond with a 2xx status within 10 seconds. Failed deliveries are retried up to 8 times with exponential backoff over roughly 24 hours.

## Disabling endpoints
An endpoint that fails every delivery for 3 consecutive days is disabled automatically, and workspace owners receive an email.
