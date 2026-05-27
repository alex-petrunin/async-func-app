const http = require('@jetbrains/youtrack-scripting-api/http');

const STORE_KEY = 'lastAsyncResult';

exports.httpHandler = {
  endpoints: [
    {
      method: 'POST',
      path: 'trigger',
      handle: function handle(ctx) {
        ctx.globalStorage.extensionProperties[STORE_KEY] = JSON.stringify({
          status: 'pending',
          triggeredAt: Date.now()
        });

        const conn = new http.Connection('https://httpbin.org');
        conn.getAsync('/uuid', null, 'onResp');

        ctx.response.json({status: 'scheduled'});
      }
    },
    {
      method: 'GET',
      path: 'result',
      handle: function handle(ctx) {
        const raw = ctx.globalStorage.extensionProperties[STORE_KEY];
        ctx.response.json(raw ? JSON.parse(raw) : {status: 'idle'});
      }
    }
  ],
  asyncFunctions: {
    onResp: function onResp(ctx) {
      const res = ctx.response;
      const payload = {
        receivedAt: Date.now(),
        status: res.isSuccess ? 'ok' : 'error',
        code: res.code,
        body: res.body ? res.body.slice(0, 4000) : null,
        exception: res.exception || null
      };
      ctx.globalStorage.extensionProperties[STORE_KEY] = JSON.stringify(payload);
    }
  }
};