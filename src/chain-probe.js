/* eslint-disable no-console, @typescript-eslint/no-require-imports */
/*
 * Bug 3 / JT-96462 verification probe.
 *
 * Bug 3 (pre-fix): connection.postAsync() called from inside an async function
 * silently dropped the request — empty-tx flush listener skip when the in-memory
 * delay==0 path produced no Xodus writes. Webhook-triggers shipped an
 * `invokeAsync` separator workaround that doubled chain depth per URL.
 *
 * JT-96462 fix claims:
 *   "*Async HTTP calls made from inside async functions are supported and
 *    reliable: Connection.postAsync / getAsync / ... invoked from an
 *    asyncFunctions function should submit the HTTP request even when the
 *    async function performs no entity writes; the configured response
 *    handler should run in the next async execution."
 *
 * This probe exercises three hops of direct postAsync chaining from inside
 * async functions, with no `invokeAsync` separator and no Xodus writes inside
 * the async function bodies. If JT-96462 holds, all four log markers must
 * appear:
 *
 *   [chain-probe] action → invokeAsync('step1')
 *   [chain-probe] step1 fired, code=<N>, posting to step2
 *   [chain-probe] step2 fired, code=<N>, posting to step3
 *   [chain-probe] step3 fired, code=<N>, chain complete
 *
 * Missing step2 or step3 = Bug 3 still present.
 *
 * POST /api/extensionEndpoints/my-app/chain-probe/run to trigger.
 */

const http = require('@jetbrains/youtrack-scripting-api/http');

const TARGET_URL = 'https://httpbin.org';
const TARGET_PATH = '/uuid';

function postNext(handlerName) {
    const conn = new http.Connection(TARGET_URL);
    conn.postAsync(TARGET_PATH, null, '', handlerName);
}

exports.httpHandler = {
    endpoints: [
        {
            scope: 'global',
            method: 'POST',
            path: 'run',
            handle: function handle(ctx) {
                console.log('[chain-probe] action → invokeAsync(\'step1\')');
                ctx.invokeAsync('step1', 0);
                ctx.response.json({status: 'scheduled', expectMarkers: ['step1', 'step2', 'step3']});
            }
        }
    ],
    asyncFunctions: {
        step1: function step1() {
            // Async fn entry — no entity writes. Schedule postAsync directly.
            console.log('[chain-probe] step1 entered, posting to step2');
            postNext('step2');
        },
        step2: function step2(ctx) {
            // Response handler from step1's postAsync. Bug 3 critical hop:
            // chained postAsync from inside an async function response handler.
            const res = ctx.response;
            const code = res && typeof res.code === 'number' ? res.code : 'no-response';
            console.log('[chain-probe] step2 fired, code=' + code + ', posting to step3');
            postNext('step3');
        },
        step3: function step3(ctx) {
            // Second chained postAsync response handler. Confirms two hops of
            // postAsync-from-async-function actually fire end-to-end.
            const res = ctx.response;
            const code = res && typeof res.code === 'number' ? res.code : 'no-response';
            console.log('[chain-probe] step3 fired, code=' + code + ', chain complete');
        }
    }
};