# API.UNDOC.001 — New endpoint missing from OpenAPI spec

- **Severity (default):** MEDIUM
- **Category:** API contract
- **Source:** OpenAPI diff + new-route file heuristic
- **Citation:** [OpenAPI Specification 3.1 — paths](https://spec.openapis.org/oas/v3.1.0#paths-object)

## Why

A handler exists in `src/routes/` or `src/controllers/` but the spec doesn't mention
the route. Consumers can't discover or contract-test the endpoint.

## Fix

Add a `paths:` entry in `openapi.yaml`:

```yaml
paths:
  /v1/orders:
    post:
      summary: Create an order
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Order'
      responses:
        '201':
          description: Created
```

Re-run the reviewer; the finding should clear.

## Suppress

For internal-only / preview endpoints:

```ts
// ai-review-ignore: API.UNDOC.001 — internal preview, not consumed by clients yet
```
