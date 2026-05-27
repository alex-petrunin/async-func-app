import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';

const host = await YTApp.register();

type ResultPayload = {
  status: 'idle' | 'pending' | 'ok' | 'error';
  triggeredAt?: number;
  receivedAt?: number;
  code?: number;
  body?: string | null;
  exception?: string | null;
};

const POLL_MS = 700;
const POLL_TIMEOUT_MS = 15000;

const AppComponent: React.FunctionComponent = () => {
  const [result, setResult] = useState<ResultPayload>({status: 'idle'});
  const [polling, setPolling] = useState(false);
  const pollStartRef = useRef<number>(0);
  const triggerTimeRef = useRef<number>(0);

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
        const r = await host.fetchApp('backend/result', {}) as ResultPayload;
        if (cancelled) {
          return;
        }
        setResult(r);
        const done = (r.status === 'ok' || r.status === 'error')
          && r.receivedAt
          && r.receivedAt >= triggerTimeRef.current;
        if (done) {
          setPolling(false);
          return;
        }
        if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
          setResult({status: 'error', exception: 'Poll timeout — async handler did not deliver in time'});
          setPolling(false);
          return;
        }
      } catch (e) {
        setResult({status: 'error', exception: String(e)});
        setPolling(false);
        return;
      }
      window.setTimeout(tick, POLL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [polling]);

  const trigger = useCallback(async () => {
    triggerTimeRef.current = Date.now();
    pollStartRef.current = Date.now();
    setResult({status: 'pending', triggeredAt: triggerTimeRef.current});
    try {
      await host.fetchApp('backend/trigger', {method: 'POST'});
      setPolling(true);
    } catch (e) {
      setResult({status: 'error', exception: String(e)});
    }
  }, []);

  return (
    <div className="widget">
      <Button primary loader={polling} disabled={polling} onClick={trigger}>
        {'Trigger getAsync'}
      </Button>
      <div className="status">
        <StatusPill status={result.status}/>
        {result.code != null && <span className="meta">{`HTTP ${result.code}`}</span>}
        {result.receivedAt && (
          <span className="meta">{`+${result.receivedAt - (result.triggeredAt ?? result.receivedAt)} ms`}</span>
        )}
      </div>
      {result.exception && <pre className="err">{result.exception}</pre>}
      {result.body && <pre className="body">{prettify(result.body)}</pre>}
    </div>
  );
};

const StatusPill: React.FC<{status: ResultPayload['status']}> = ({status}) => (
  <span className={`pill pill-${status}`}>{status}</span>
);

function prettify(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

export const App = memo(AppComponent);