import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';

const host = await YTApp.register();

type SingleResult = {
  status: 'idle' | 'pending' | 'ok' | 'error';
  triggeredAt?: number;
  receivedAt?: number;
  code?: number;
  body?: string | null;
  exception?: string | null;
  source?: string;
  issueId?: string;
};

type AllResults = {
  http: SingleResult;
  invoke: SingleResult;
  rule: SingleResult;
};

const POLL_MS = 700;
const POLL_TIMEOUT_MS = 15000;
const JSON_INDENT = 2;

function prettify(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, JSON_INDENT);
  } catch {
    return s;
  }
}

function StatusLine({data}: {data: SingleResult}) {
  return (
    <div className="status">
      <span className={`pill pill-${data.status}`}>{data.status}</span>
      {data.code != null && <span className="meta">{`HTTP ${data.code}`}</span>}
      {data.receivedAt != null && data.triggeredAt != null && (
        <span className="meta">{`+${data.receivedAt - data.triggeredAt} ms`}</span>
      )}
      {data.source && <span className="meta">{data.source}</span>}
      {data.issueId && <span className="meta">{`issue ${data.issueId}`}</span>}
    </div>
  );
}

function Panel({title, data}: {title: string; data: SingleResult}) {
  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <StatusLine data={data}/>
      {data.exception && <pre className="err">{data.exception}</pre>}
      {data.body && <pre className="body">{prettify(data.body)}</pre>}
    </div>
  );
}

const AppComponent: React.FunctionComponent = () => {
  const [results, setResults] = useState<AllResults>({
    http: {status: 'idle'},
    invoke: {status: 'idle'},
    rule: {status: 'idle'}
  });
  const [polling, setPolling] = useState(false);
  const pollStartRef = useRef<number>(0);

  useEffect(() => {
    if (!polling) {
      return undefined;
    }
    let cancelled = false;

    const tick = async () => {
      if (cancelled) {
        return;
      }
      try {
        const r = await host.fetchApp('backend/result', {}) as AllResults;
        if (cancelled) {
          return;
        }
        setResults(r);
        if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
          setPolling(false);
          return;
        }
      } catch {
        setPolling(false);
        return;
      }
      window.setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [polling]);

  const triggerHttp = useCallback(async () => {
    pollStartRef.current = Date.now();
    await host.fetchApp('backend/trigger', {method: 'POST'});
    setPolling(true);
  }, []);

  const triggerInvoke = useCallback(async () => {
    pollStartRef.current = Date.now();
    await host.fetchApp('backend/trigger-invoke', {method: 'POST'});
    setPolling(true);
  }, []);

  const refresh = useCallback(() => {
    pollStartRef.current = Date.now();
    setPolling(true);
  }, []);

  return (
    <div className="widget">
      <div className="toolbar">
        <Button primary onClick={triggerHttp}>{'Test: http getAsync'}</Button>
        <Button onClick={triggerInvoke}>{'Test: http invokeAsync'}</Button>
        <Button onClick={refresh}>{'Refresh (rule)'}</Button>
      </div>
      <Panel title="HTTP handler → getAsync(onResp)" data={results.http}/>
      <Panel title="HTTP handler → invokeAsync(delayedWrite)" data={results.invoke}/>
      <Panel title="Workflow rule → invokeAsync(delayedRuleWrite)" data={results.rule}/>
      <p className="hint">
        {'Rule panel updates after editing any issue in a project where this app is enabled. Refresh polls latest.'}
      </p>
    </div>
  );
};

export const App = memo(AppComponent);