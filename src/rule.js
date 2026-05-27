/* eslint-disable no-console, @typescript-eslint/no-require-imports */
const entities = require('@jetbrains/youtrack-scripting-api/entities');

const KEY_RULE = 'lastRuleResult';
const RULE_DELAY_MS = 1500;

exports.rule = entities.Issue.onChange({
  title: 'Async Demo Rule',
  guard: function guard(ctx) {
    console.log('[async-demo rule] guard for', ctx.issue.id);
    return true;
  },
  action: function action(ctx) {
    console.log('[async-demo rule] action fired for', ctx.issue.id);
    ctx.store('issueId', ctx.issue.id);
    ctx.invokeAsync('delayedRuleWrite', RULE_DELAY_MS);
    console.log('[async-demo rule] invokeAsync scheduled');
  },
  asyncFunctions: {
    delayedRuleWrite: function delayedRuleWrite(ctx) {
      const id = ctx.load('issueId');
      console.log('[async-demo rule] delayedRuleWrite fired, issueId =', id);
      ctx.globalStorage.extensionProperties[KEY_RULE] = JSON.stringify({
        status: 'ok',
        receivedAt: Date.now(),
        issueId: id,
        source: 'rule invokeAsync'
      });
      console.log('[async-demo rule] result stored');
    }
  }
});