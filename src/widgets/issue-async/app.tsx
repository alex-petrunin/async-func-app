import React, {memo, useCallback, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';

const host = await YTApp.register();

const JSON_INDENT = 2;

type Entry = {ts: string; label: string; result: unknown};

const AppComponent: React.FunctionComponent = () => {
  const [entries, setEntries] = useState<Entry[]>([]);

  const fire = useCallback(async (label: string, path: string) => {
    const ts = new Date().toISOString();
    try {
      const result = await host.fetchApp(`issue-backend/${path}`, {method: 'POST', scope: true});
      setEntries(prev => [{ts, label, result}, ...prev]);
    } catch (e) {
      setEntries(prev => [{ts, label, result: {error: String(e)}}, ...prev]);
    }
  }, []);

  const fireHttp = useCallback(() => {
    fire('issue getAsync', 'trigger-issue-http');
  }, [fire]);

  const fireInvoke = useCallback(() => {
    fire('issue invokeAsync', 'trigger-issue-invoke');
  }, [fire]);

  return (
    <div className="widget">
      <div className="toolbar">
        <Button primary onClick={fireHttp}>{'Issue: http getAsync'}</Button>
        <Button onClick={fireInvoke}>{'Issue: http invokeAsync'}</Button>
      </div>
      <p className="hint">
        {'Issue id: '}{YTApp.entity?.id ?? '(none)'} {' — Check YT server log for [async-demo] issue-scoped ... FIRED lines.'}
      </p>
      {entries.length > 0 && (
        <pre className="log">{entries.map(e => `${e.ts}  ${e.label}\n${JSON.stringify(e.result, null, JSON_INDENT)}`).join('\n\n')}</pre>
      )}
    </div>
  );
};

export const App = memo(AppComponent);