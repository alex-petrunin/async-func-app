/* eslint-disable no-console, @typescript-eslint/no-require-imports */
const http = require('@jetbrains/youtrack-scripting-api/http');

const INVOKE_DELAY_MS = 1000;

exports.httpHandler = {
  endpoints: [
    {
      scope: 'project',
      method: 'POST',
      path: 'trigger-project-http',
      handle: function handle(ctx) {
        console.log('[async-demo] project-scoped getAsync hit');
        try {
          const conn = new http.Connection('https://httpbin.org');
          conn.getAsync('/uuid', null, 'onProjectResp');
          console.log('[async-demo] project-scoped getAsync scheduled');
          ctx.response.json({status: 'scheduled'});
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          console.log('[async-demo] project-scoped getAsync threw:', msg);
          ctx.response.json({status: 'error', error: msg});
        }
      }
    },
    {
      scope: 'project',
      method: 'POST',
      path: 'trigger-project-invoke',
      handle: function handle(ctx) {
        console.log('[async-demo] project-scoped invokeAsync hit');
        try {
          ctx.invokeAsync('delayedProjectWrite', INVOKE_DELAY_MS);
          console.log('[async-demo] project-scoped invokeAsync scheduled');
          ctx.response.json({status: 'scheduled'});
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          console.log('[async-demo] project-scoped invokeAsync threw:', msg);
          ctx.response.json({status: 'error', error: msg});
        }
      }
    }
  ],
  asyncFunctions: {
    onProjectResp: function onProjectResp(ctx) {
      console.log('[async-demo] project-scoped onProjectResp FIRED, code:', ctx.response && ctx.response.code);
    },
    delayedProjectWrite: function delayedProjectWrite() {
      console.log('[async-demo] project-scoped delayedProjectWrite FIRED');
    }
  }
};