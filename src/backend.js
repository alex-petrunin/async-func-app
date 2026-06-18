/* eslint-disable no-console, @typescript-eslint/no-require-imports */
const http = require('@jetbrains/youtrack-scripting-api/http');

const KEY_HTTP = 'lastAsyncResult';
const KEY_INVOKE = 'lastInvokeResult';
const KEY_RULE = 'lastRuleResult';
const INVOKE_DELAY_MS = 1000;
const BODY_TRUNC = 4000;

function writeResult(ctx, key, payload) {
    const serialized = JSON.stringify(payload);
    console.log(`[async-demo] write ${key}:`, serialized);
    ctx.globalStorage.extensionProperties[key] = serialized;
    console.log(`[async-demo] readback ${key}:`, ctx.globalStorage.extensionProperties[key]);
}

exports.httpHandler = {
    endpoints: [
        {
            scope: 'global',
            method: 'POST',
            path: 'trigger',
            handle: function handle(ctx) {
                console.log('[async-demo] trigger getAsync endpoint hit');
                writeResult(ctx, KEY_HTTP, {status: 'pending', triggeredAt: Date.now()});

                try {
                    const conn = new http.Connection('https://httpbin.org');
                    conn.getAsync('/uuid', null, 'onResp');
                    console.log('[async-demo] getAsync scheduled');
                    ctx.response.json({status: 'scheduled'});
                } catch (e) {
                    const msg = e && e.message ? e.message : String(e);
                    console.log('[async-demo] getAsync threw:', msg);
                    writeResult(ctx, KEY_HTTP, {
                        status: 'error',
                        receivedAt: Date.now(),
                        triggeredAt: Date.now(),
                        exception: msg,
                        source: 'http-handler getAsync (scheduling failed)'
                    });
                    ctx.response.json({status: 'error', error: msg});
                }
            }
        },
        {
            scope: 'global',
            method: 'POST',
            path: 'trigger-invoke',
            handle: function handle(ctx) {
                ctx.
                console.log('[async-demo] trigger-invoke endpoint hit');
                writeResult(ctx, KEY_INVOKE, {status: 'pending', triggeredAt: Date.now()});

                try {
                    ctx.invokeAsync('delayedWrite', INVOKE_DELAY_MS);
                    console.log('[async-demo] invokeAsync scheduled');
                    ctx.response.json({status: 'scheduled'});
                } catch (e) {
                    const msg = e && e.message ? e.message : String(e);
                    console.log('[async-demo] invokeAsync threw:', msg);
                    writeResult(ctx, KEY_INVOKE, {
                        status: 'error',
                        receivedAt: Date.now(),
                        triggeredAt: Date.now(),
                        exception: msg,
                        source: 'http-handler invokeAsync (scheduling failed)'
                    });
                    ctx.response.json({status: 'error', error: msg});
                }
            }
        },
        {
            scope: 'global',
            method: 'GET',
            path: 'result',
            handle: function handle(ctx) {
                const httpRaw = ctx.globalStorage.extensionProperties[KEY_HTTP];
                const invokeRaw = ctx.globalStorage.extensionProperties[KEY_INVOKE];
                const ruleRaw = ctx.globalStorage.extensionProperties[KEY_RULE];
                ctx.response.json({
                    http: httpRaw ? JSON.parse(httpRaw) : {status: 'idle'},
                    invoke: invokeRaw ? JSON.parse(invokeRaw) : {status: 'idle'},
                    rule: ruleRaw ? JSON.parse(ruleRaw) : {status: 'idle'}
                });
            }
        }
    ],
    asyncFunctions: {
        onResp: function onResp(ctx) {
            console.log('[async-demo] onResp fired');
            const res = ctx.response;
            writeResult(ctx, KEY_HTTP, {
                receivedAt: Date.now(),
                status: res.isSuccess ? 'ok' : 'error',
                code: res.code,
                body: res.body ? res.body.slice(0, BODY_TRUNC) : null,
                exception: res.exception || null,
                source: 'http-handler getAsync'
            });
        },
        delayedWrite: function delayedWrite(ctx) {
            console.log('[async-demo] delayedWrite fired');
            writeResult(ctx, KEY_INVOKE, {
                receivedAt: Date.now(),
                status: 'ok',
                source: 'http-handler invokeAsync'
            });
        }
    }
};