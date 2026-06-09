/* eslint-disable no-console, @typescript-eslint/no-require-imports, no-magic-numbers */
/*
 * Follow-up probes after JT-96372 / JT-96373 / JT-96462.
 *
 * Covers items that the rule + chain-probe tests do not exercise:
 *
 *  1. HTTP verb parity — only `postAsync` and `getAsync` were verified.
 *     Probe `putAsync` / `patchAsync` / `deleteAsync` for the same shape.
 *
 *  2. Connection constructor passthrough — verify `sslKeyName` and `timeout`
 *     can be supplied without throwing and that the async request still
 *     completes (sslKeyName=null + timeout=8000ms is enough to confirm
 *     wiring; full SSL-keystore verification is out of scope).
 *
 *  3. Recovery on restart — schedule a long-delayed invokeAsync, restart
 *     YouTrack, watch youtrack.log for the `Recovered N pending async jobs
 *     after restart` line + the eventual function execution.
 *
 * Endpoints (all global scope, POST):
 *
 *   /api/extensionEndpoints/my-app/verb-probe/get        → getAsync
 *   /api/extensionEndpoints/my-app/verb-probe/post       → postAsync
 *   /api/extensionEndpoints/my-app/verb-probe/put        → putAsync
 *   /api/extensionEndpoints/my-app/verb-probe/patch      → patchAsync
 *   /api/extensionEndpoints/my-app/verb-probe/delete     → deleteAsync
 *   /api/extensionEndpoints/my-app/verb-probe/with-ssl   → postAsync with sslKeyName + timeout passthrough
 *   /api/extensionEndpoints/my-app/verb-probe/delayed    → invokeAsync with 5 min delay (for restart-recovery test)
 *
 * Each response-handler logs `[verb-probe] <verb> response code=<N>`. The
 * `delayed` endpoint's handler logs `[verb-probe] delayed FIRED` so the
 * recovery test can grep for it post-restart.
 */

const http = require('@jetbrains/youtrack-scripting-api/http');

const TARGET = 'https://httpbin.org';
const LONG_DELAY_MS = 5 * 60 * 1000; // 5 minutes — leaves room for stop+start

function logResp(verb, ctx) {
    const res = ctx.response;
    const code = res && typeof res.code === 'number' ? res.code : 'no-response';
    const exc = res && res.exception ? res.exception : null;
    console.log('[verb-probe] ' + verb + ' response code=' + code + (exc ? ' exception=' + exc : ''));
}

exports.httpHandler = {
    endpoints: [
        {
            scope: 'global', method: 'POST', path: 'get',
            handle: function handleGet(ctx) {
                const conn = new http.Connection(TARGET);
                conn.getAsync('/get', null, 'onGet');
                console.log('[verb-probe] getAsync scheduled');
                ctx.response.json({status: 'scheduled', verb: 'GET'});
            }
        },
        {
            // Hypothesis probe: same as `/get` but with a Xodus write inside
            // the sync handler. If this fires `onGet` but `/get` does not,
            // Bug 3 still affects the sync-action entry path (in-memory
            // delay==0 job dropped when the surrounding tx has no writes).
            scope: 'global', method: 'POST', path: 'get-with-write',
            handle: function handleGetWithWrite(ctx) {
                ctx.globalStorage.extensionProperties.lastAsyncResult = JSON.stringify({
                    status: 'pending',
                    triggeredAt: Date.now(),
                    source: 'verb-probe get-with-write'
                });
                const conn = new http.Connection(TARGET);
                conn.getAsync('/get', null, 'onGet');
                console.log('[verb-probe] getAsync (with Xodus write) scheduled');
                ctx.response.json({status: 'scheduled', verb: 'GET', withWrite: true});
            }
        },
        {
            scope: 'global', method: 'POST', path: 'post',
            handle: function handlePost(ctx) {
                const conn = new http.Connection(TARGET);
                conn.postAsync('/post', null, '{"probe":"post"}', 'onPost');
                console.log('[verb-probe] postAsync scheduled');
                ctx.response.json({status: 'scheduled', verb: 'POST'});
            }
        },
        {
            scope: 'global', method: 'POST', path: 'put',
            handle: function handlePut(ctx) {
                const conn = new http.Connection(TARGET);
                conn.putAsync('/put', null, '{"probe":"put"}', 'onPut');
                console.log('[verb-probe] putAsync scheduled');
                ctx.response.json({status: 'scheduled', verb: 'PUT'});
            }
        },
        {
            scope: 'global', method: 'POST', path: 'patch',
            handle: function handlePatch(ctx) {
                const conn = new http.Connection(TARGET);
                conn.patchAsync('/patch', null, '{"probe":"patch"}', 'onPatch');
                console.log('[verb-probe] patchAsync scheduled');
                ctx.response.json({status: 'scheduled', verb: 'PATCH'});
            }
        },
        {
            scope: 'global', method: 'POST', path: 'delete',
            handle: function handleDelete(ctx) {
                const conn = new http.Connection(TARGET);
                conn.deleteAsync('/delete', null, 'onDelete');
                console.log('[verb-probe] deleteAsync scheduled');
                ctx.response.json({status: 'scheduled', verb: 'DELETE'});
            }
        },
        {
            scope: 'global', method: 'POST', path: 'with-ssl',
            handle: function handleWithSsl(ctx) {
                // sslKeyName=null + timeout=8000ms — verifies constructor accepts both,
                // request still completes. Full SSL-keystore verification out of scope.
                const conn = new http.Connection(TARGET, null, 8000);
                conn.postAsync('/post', null, '{"probe":"sslTimeout"}', 'onSslTimeout');
                console.log('[verb-probe] postAsync(with sslKeyName=null, timeout=8000) scheduled');
                ctx.response.json({status: 'scheduled', sslKeyName: null, timeout: 8000});
            }
        },
        {
            scope: 'global', method: 'POST', path: 'delayed',
            handle: function handleDelayed(ctx) {
                ctx.invokeAsync('delayedFire', LONG_DELAY_MS);
                console.log('[verb-probe] delayed invokeAsync scheduled, delayMs=' + LONG_DELAY_MS);
                ctx.response.json({status: 'scheduled', delayMs: LONG_DELAY_MS});
            }
        }
    ],
    asyncFunctions: {
        onGet: function onGet(ctx) { logResp('GET', ctx); },
        onPost: function onPost(ctx) { logResp('POST', ctx); },
        onPut: function onPut(ctx) { logResp('PUT', ctx); },
        onPatch: function onPatch(ctx) { logResp('PATCH', ctx); },
        onDelete: function onDelete(ctx) { logResp('DELETE', ctx); },
        onSslTimeout: function onSslTimeout(ctx) { logResp('POST-ssl-timeout', ctx); },
        delayedFire: function delayedFire() {
            console.log('[verb-probe] delayed FIRED');
        }
    }
};