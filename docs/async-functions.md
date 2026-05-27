# Apps and Workflows Async Functions

Focused reference for async function invocations in app scripts (workflow rules, HTTP handlers, AI tools).

## Overview

App scripts execute synchronously within a single transaction. Async functions allow scripts to schedule named functions that execute **after** the originating transaction commits, each in its own read-write transaction. This enables:

- HTTP calls with response handlers (non-blocking outbound requests)
- Delayed execution (debounce, retry, deferred processing)
- Multi-step processing chains without blocking the main transaction

Key constraint: only **one** async call (either `ctx.invokeAsync` or an HTTP `*Async` method) is allowed per function execution. Calling `ctx.invokeAsync()` twice or mixing it with `*Async` HTTP methods in the same function throws `IllegalStateException`. Chaining is achieved by calling `ctx.invokeAsync` again from within the async function.

## JS API

### `ctx.invokeAsync(functionName, delay?, deduplicationKey?)`

Schedules a named async function for execution after the current transaction commits.

```javascript
exports.rule = entities.Issue.onChange({
  title: 'Deferred processing',
  action: function(ctx) {
    ctx.store('issueId', ctx.issue.id);
    ctx.invokeAsync('processLater', 5000); // 5-second delay
  },
  asyncFunctions: {
    processLater: function(ctx) {
      const id = ctx.load('issueId');
      // runs in its own transaction
    }
  }
});
```

Parameters:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `functionName` | `string` | yes | Name of a function declared in `asyncFunctions` on the same rule/handler |
| `delay` | `number` | no | Delay in milliseconds before execution. Default `0`. Range: `0` to `604800000` (1 week). Configurable via JVM param `jetbrains.youtrack.scripts.async.maxDelay` |
| `deduplicationKey` | `string` | no | If set, any previously scheduled (but not yet executed) async call with the same key **and** entry configuration is replaced by this one. Useful for debounce semantics |

`asyncFunctions` is a plain JS object, so duplicate function names are silently overwritten (last declaration wins). No runtime error is thrown.

### `ctx.store(key, value)` / `ctx.load(key)`

Persist and retrieve values across async chain hops. These methods are specifically for passing state between async invocations — they are not a general-purpose in-memory key-value store.

```javascript
ctx.store('count', 42);
ctx.store('user', ctx.issue.fields.Assignee); // entity references supported
// ... in the async function:
const count = ctx.load('count');   // 42
const user = ctx.load('user');     // entity wrapper
```

Supported value types:

- Primitives: `string`, `number` (stored as `Long`), `boolean`, `null`
- Entity references: any wrapped entity (e.g., `Issue`, `User`, `Project`) — stored as type + ID, re-wrapped on load

Caveats:

- **Integer normalization**: All JS integers are stored as `Long`. There is no `Int` type in stored values. Loading returns `Long` regardless of what was stored.
- **GraalVM Value coercion**: Raw GraalVM `Value` objects cannot cross thread boundaries. The `storeAsync` method coerces them to Java primitives (`null`, `String`, `Boolean`, `Long`, `Double`) or falls back to `toString()`.
- **Entity references are IDs, not snapshots**: `ctx.store('issue', ctx.issue)` stores the entity ID. When loaded in the async function, the entity reflects its **current** state, not the state at store time.
- **Store before invoke**: `ctx.store()` calls after `ctx.invokeAsync()` are still recorded (same `AsyncInvocationState`), but store everything you need before invoking for clarity.

### `ctx.response` (in async HTTP response handlers)

Available inside async functions invoked as HTTP response handlers. Mirrors the sync HTTP response API from `http.js`, but is a separate implementation in `ctx.js` due to a different underlying Java object. Changes to the sync response API should be reflected in the async response wrapper too.

| Property | Type | Description |
|---|---|---|
| `response` / `body` | `string` | Response body (truncated to 1 MB) |
| `bodyAsStream` | `InputStream` | Response body as stream |
| `code` | `number` | HTTP status code |
| `isSuccess` | `boolean` | `true` if code is 200-399 |
| `headers` | `object` | Response headers |
| `exception` | `string` | Exception message if the request failed |
| `json()` | `function` | Parses `body` as JSON |
| `$$raw` | `object` | Underlying Java response (non-enumerable) |

### HTTP Async Methods

On a `Connection` object from the `http` module:

```javascript
const http = require('@jetbrains/youtrack-scripting-api/http');
const conn = new http.Connection('https://api.example.com');
conn.addHeader('Authorization', 'Bearer token');

conn.postAsync('/webhook', null, {data: 'payload'}, 'onResponse');
```

All methods follow the same pattern as their sync counterparts but take an extra `handlerName` parameter (the async function name to call with the response):

| Method | Signature |
|---|---|
| `doAsync` | `(requestType, uri, queryParams, payload, handlerName)` |
| `getAsync` | `(uri, queryParams, handlerName)` |
| `postAsync` | `(uri, queryParams, payload, handlerName)` |
| `putAsync` | `(uri, queryParams, payload, handlerName)` |
| `patchAsync` | `(uri, queryParams, payload, handlerName)` |
| `deleteAsync` | `(uri, queryParams, handlerName)` |

These call `AsyncHttpBridge.scheduleHttpAsync()` on the Kotlin side. The HTTP request is executed **outside** any transaction, and the handler function runs in a new transaction with `ctx.response` populated.

`sslKeyName` and `timeout` from the `Connection` constructor are passed through to the async HTTP bridge. Custom SSL truststores and per-request timeouts work the same as with sync calls.

When a synchronous HTTP call fails with `SocketTimeoutException` or `ConnectTimeoutException`, `scriptLogger` logs a warning suggesting async HTTP methods as an alternative. This is a hint for script authors, not an automatic retry.

## How It Works Internally

### Execution Flow

1. **Scheduling**: JS calls `ctx.invokeAsync()` or `connection.*Async()`. The call is recorded in `AsyncInvocationState` (one per execution). No DB write yet.
2. **Persistence**: After the JS action returns, `AsyncCallScheduler.scheduleIfNeeded()` creates a `XdPersistentExecutionContext` entity with stored values serialized as attribute entities. A `PendingAsyncJob` is registered in a `ThreadLocal`. The scheduler call runs before `scriptingContextHolder.remove()` — moving it outside would break journaling and logging.
3. **Flush**: `AsyncFunctionFlushListener` fires on transaction commit, reads the `ThreadLocal`, and submits the job to `AsyncFunctionJobProcessor` (immediately or with delay).
4. **Execution**: `AsyncFunctionJob.execute()` loads the persistent context, rebuilds the scripting context, and invokes the named async function. For HTTP async, the HTTP call happens first (outside transaction), then the handler runs in a new transaction.

### In-Memory Fast Path

When an HTTP async call has `delay == 0`, stored values and call metadata are carried directly in `InMemoryPendingAsyncJob` — no Xodus entity writes. This avoids unnecessary DB overhead for immediate HTTP response handlers.

In-memory jobs do not survive server restarts. If YouTrack restarts between scheduling and execution, an in-memory job is lost.

### Restart Recovery

Delayed persistent jobs are submitted to `AsyncFunctionJobProcessor` which is in-memory. If YouTrack restarts between scheduling and execution, pending persistent jobs are recovered and rescheduled from `XdPersistentExecutionContext` entities on startup.

### Transaction Boundaries

- The originating action runs in the caller's transaction
- `AsyncCallScheduler.scheduleIfNeeded()` runs in the **same** transaction (before `scriptingContextHolder.remove()`)
- The async function runs in its own **separate** read-write transaction
- For HTTP async: the outbound HTTP call runs **outside** any transaction; the response handler runs in a new transaction. This is critical — the HTTP call must not hold a write transaction open during remote I/O. If you modify `AsyncFunctionJob`, ensure the HTTP call remains outside the transaction scope.

## Chaining

Async functions can call `ctx.invokeAsync()` again, creating a chain of execution contexts. Each hop creates a new `XdPersistentExecutionContext` linked to its predecessor via `previousContext`/`nextContext`.

### State Persistence Across Chain

Stored values accumulate across the chain. `ctx.load(key)` walks backward through `previousContext` links until a matching key is found:

```text
Context 1 (attrs: user=alice, count=1)
    ← Context 2 (attrs: count=2)
        ← Context 3 (attrs: result=done)
```

- `ctx.load('user')` from Context 3 → walks C3 → C2 → C1 → returns `"alice"`
- `ctx.load('count')` from Context 3 → walks C3 → C2 → returns `2` (shadows C1's value)

### Chain Length Limit

Maximum **10 hops** by default. Configurable via JVM param `jetbrains.youtrack.scripts.async.maxChainLength`. Exceeding this throws `IllegalStateException` at scheduling time.

### Chain Head Tracking

Every context in a chain stores a `chainHead` reference to the first context. This is used by the cleanup job to identify complete chains.

## Deduplication

The `deduplicationKey` parameter on `ctx.invokeAsync()` enables debounce behavior:

```javascript
// Only the last scheduled call with this key will execute
ctx.invokeAsync('processChange', 10000, 'process-' + ctx.issue.id);
```

When a non-empty key is provided, `AsyncCallScheduler.schedulePersistent()` deletes all existing `XdPersistentExecutionContext` entities with the same `(deduplicationKey, entryConfiguration)` pair and also removes matching `PersistentPendingAsyncJob` entries from the in-flight `ThreadLocal`.

Deduplication only works for persistent jobs (delayed calls). It has no effect on in-memory jobs (immediate HTTP async) or already-executing jobs.

## Limits and Constraints

| Constraint | Value | Enforced by |
|---|---|---|
| Async calls per function execution | 1 | `AsyncInvocationState.assertCanSchedule()` |
| Maximum chain length | 10 hops (configurable) | `AsyncInvocationState.assertCanSchedule()` |
| Maximum delay | 1 week / 604,800,000 ms (configurable) | `AsyncCallScheduler.scheduleIfNeeded()` |
| HTTP response body size | 1 MB | `ClientWrapper` response handling |
| SSRF protection | DNS-level check | `ClientFactory.buildHttpClient()` via `OutboundConnectionManager` |
| Thread pool size | `max(2, processors/8)` | `AsyncFunctionJobThreadPool` config |

JVM configuration parameters:

- `jetbrains.youtrack.scripts.async.maxDelay` — max delay in ms (default: 604800000)
- `jetbrains.youtrack.scripts.async.maxChainLength` — max chain hops (default: 10)

## Pre-Execution Safety Checks

Before invoking an async function, `AsyncFunctionJob` validates:

1. **User is not banned** — if the scheduling user was banned between scheduling and execution, the job is skipped
2. **Entry configuration is enabled** — the script must still be active
3. **Plugin configuration is activated** — the app must still be enabled and have required settings

All three produce `logger.warn` messages when triggered.

## Cleanup

`StaleAsyncContextCleanup` runs as a `LocalCronScheduling` job daily at 3 AM (with randomized seconds/minutes to avoid thundering-herd across instances).

- Deletes contexts with `scheduledAt` older than 2 days
- Iterates from chain tail inward: queries for stale contexts where `nextContext` is null (leaf nodes), deletes them, commits
- Each deletion clears `nextContext` on the predecessor via the bidirectional link, exposing it as the new leaf for the next iteration
- Safety limit: 1000 iterations per run (`MAX_CLEANUP_ITERATIONS`)
- Runs with `useTnx = false` — manages its own batched transactions

## Source File Index

All files in the `youtrack-scripts` module unless noted.

| File | Purpose |
|---|---|
| `async/AsyncInvocationState.kt` | Per-execution state: pending call, stored values, chain limits |
| `async/AsyncFunctionsContainer.kt` | Interface for objects (rules, handlers) that declare async functions |
| `async/AsyncCallScheduler.kt` | Creates persistent/in-memory context and registers pending jobs |
| `async/AsyncFunctionFlushListener.kt` | Submits jobs to processor on transaction commit |
| `async/AsyncFunctionJobProcessor.kt` | Thread pool for async job execution |
| `async/AsyncFunctionJob.kt` | Sealed hierarchy: `PersistentAsyncFunctionJob` + `InMemoryAsyncFunctionJob`. Loads context, runs HTTP call, invokes function |
| `async/AsyncFunctionContext.kt` | Scripting context for async functions (target, project, config) |
| `async/AsyncHttpBridge.kt` | JS-to-Kotlin bridge for `http.*Async` methods |
| `async/XdPersistentExecutionContext.kt` | Xodus entities for persisting execution state + attributes |
| `async/StaleAsyncContextCleanupJob.kt` | Daily cleanup of stale contexts (2-day TTL) |
| `ctx.js` | Exposes `store`/`load`/`invokeAsync`/`response` to JS |
| `apiModules/core/http.js` | `doAsync` + `getAsync`/`postAsync`/`putAsync`/`patchAsync`/`deleteAsync` |
| `visitors/ObjectVisitor.kt` | `parseAsyncFunctions()` for JS-to-Kotlin function binding |
| `model/AbstractScriptingContext.kt` | `storeAsync`/`loadAsync`/`invokeAsync` methods on the Kotlin side |

In `youtrack-workflow`:

| File | Purpose |
|---|---|
| `model/Rule.kt` | Implements `AsyncFunctionsContainer` |
| `ext/StatelessRule.kt` | Initializes `AsyncInvocationState` + calls scheduler after action |

## Pitfalls and Gotchas

1. **Telemetry tracking**: Async function executions are tracked with a `":async-<functionName>"` suffix in `ScriptTelemetry`, distinguishing them from regular script invocations.

2. **Cleanup deletes from tail inward**: The bidirectional `previousContext`/`nextContext` link ensures a context is never deleted while still referenced by a successor. If cleanup stalls, the 1000-iteration safety limit prevents infinite loops.
