/* eslint-disable no-console, @typescript-eslint/no-require-imports */
const http = require('@jetbrains/youtrack-scripting-api/http');

const INVOKE_DELAY_MS = 1000;

exports.httpHandler = {
  endpoints: [
    {
      scope: 'article',
      method: 'POST',
      path: 'trigger-article-http',
      handle: function handle(ctx) {
        console.log('[async-demo] article-scoped getAsync hit');
        try {
          const conn = new http.Connection('https://httpbin.org');
          conn.getAsync('/uuid', null, 'onArticleResp');
          console.log('[async-demo] article-scoped getAsync scheduled');
          ctx.response.json({status: 'scheduled'});
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          console.log('[async-demo] article-scoped getAsync threw:', msg);
          ctx.response.json({status: 'error', error: msg});
        }
      }
    },
    {
      scope: 'article',
      method: 'POST',
      path: 'trigger-article-invoke',
      handle: function handle(ctx) {
        console.log('[async-demo] article-scoped invokeAsync hit');
        try {
          ctx.invokeAsync('delayedArticleWrite', INVOKE_DELAY_MS);
          console.log('[async-demo] article-scoped invokeAsync scheduled');
          ctx.response.json({status: 'scheduled'});
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          console.log('[async-demo] article-scoped invokeAsync threw:', msg);
          ctx.response.json({status: 'error', error: msg});
        }
      }
    }
  ],
  asyncFunctions: {
    onArticleResp: function onArticleResp(ctx) {
      console.log('[async-demo] article-scoped onArticleResp FIRED, code:', ctx.response && ctx.response.code);
    },
    delayedArticleWrite: function delayedArticleWrite() {
      console.log('[async-demo] article-scoped delayedArticleWrite FIRED');
    }
  }
};