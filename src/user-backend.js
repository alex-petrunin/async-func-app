/* eslint-disable no-console, @typescript-eslint/no-require-imports */
const http = require('@jetbrains/youtrack-scripting-api/http');

const INVOKE_DELAY_MS = 1000;

exports.httpHandler = {
  endpoints: [
    {
      scope: 'user',
      method: 'POST',
      path: 'trigger-user-http',
      handle: function handle(ctx) {
        console.log('[async-demo] user-scoped getAsync hit');
        try {
          const conn = new http.Connection('https://httpbin.org');
          conn.getAsync('/uuid', null, 'onUserResp');
          console.log('[async-demo] user-scoped getAsync scheduled');
          ctx.response.json({status: 'scheduled'});
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          console.log('[async-demo] user-scoped getAsync threw:', msg);
          ctx.response.json({status: 'error', error: msg});
        }
      }
    },
    {
      scope: 'user',
      method: 'POST',
      path: 'trigger-user-invoke',
      handle: function handle(ctx) {
        console.log('[async-demo] user-scoped invokeAsync hit');
        try {
          ctx.invokeAsync('delayedUserWrite', INVOKE_DELAY_MS);
          console.log('[async-demo] user-scoped invokeAsync scheduled');
          ctx.response.json({status: 'scheduled'});
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          console.log('[async-demo] user-scoped invokeAsync threw:', msg);
          ctx.response.json({status: 'error', error: msg});
        }
      }
    }
  ],
  asyncFunctions: {
    onUserResp: function onUserResp(ctx) {
      console.log('[async-demo] user-scoped onUserResp FIRED, code:', ctx.response && ctx.response.code);
    },
    delayedUserWrite: function delayedUserWrite() {
      console.log('[async-demo] user-scoped delayedUserWrite FIRED');
    }
  }
};