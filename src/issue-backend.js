/* eslint-disable no-console, @typescript-eslint/no-require-imports */
const http = require('@jetbrains/youtrack-scripting-api/http');

const INVOKE_DELAY_MS = 1000;

exports.httpHandler = {
  endpoints: [
    {
      scope: 'issue',
      method: 'POST',
      path: 'trigger-issue-http',
      handle: function handle(ctx) {
        console.log('[async-demo] issue-scoped getAsync hit');
        try {
          const conn = new http.Connection('https://httpbin.org');
          conn.getAsync('/uuid', null, 'onIssueResp');
          console.log('[async-demo] issue-scoped getAsync scheduled');
          ctx.response.json({status: 'scheduled'});
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          console.log('[async-demo] issue-scoped getAsync threw:', msg);
          ctx.response.json({status: 'error', error: msg});
        }
      }
    },
    {
      scope: 'issue',
      method: 'POST',
      path: 'trigger-issue-invoke',
      handle: function handle(ctx) {
        console.log('[async-demo] issue-scoped invokeAsync hit');
        try {
          ctx.invokeAsync('delayedIssueWrite', INVOKE_DELAY_MS);
          console.log('[async-demo] issue-scoped invokeAsync scheduled');
          ctx.response.json({status: 'scheduled'});
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          console.log('[async-demo] issue-scoped invokeAsync threw:', msg);
          ctx.response.json({status: 'error', error: msg});
        }
      }
    }
  ],
  asyncFunctions: {
    onIssueResp: function onIssueResp(ctx) {
      console.log('[async-demo] issue-scoped onIssueResp FIRED, code:', ctx.response && ctx.response.code);
    },
    delayedIssueWrite: function delayedIssueWrite() {
      console.log('[async-demo] issue-scoped delayedIssueWrite FIRED');
    }
  }
};