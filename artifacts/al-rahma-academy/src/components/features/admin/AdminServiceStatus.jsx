import { useQuery } from '@tanstack/react-query';
import { Activity, Database, GitBranch, Globe, RefreshCw, Server } from 'lucide-react';
import { getServiceStatus } from '../../../api/adminApi';
import { BUILD_COMMIT } from '../../../utils/buildInfo';

// The Overview tab's Service status card. It checks only when the admin
// presses the button, and each answer is a snapshot of that moment. Facts
// come from GET /v1/admin/stats/service-status (the server's own commit, a
// database ping, main on GitHub's public API) and from the commit this
// website was built from. Anything missing or failed reads "Unknown" with
// the reason, never "no deploy needed".

const short = (sha) => sha.slice(0, 7);
const clock = (iso) => new Date(iso).toLocaleTimeString('en-GB');
const dateTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const UNKNOWN_REASON = {
  server_commit_unknown: 'the server did not report which commit it runs',
  github_unreachable: 'GitHub could not be reached',
  github_timeout: 'GitHub did not answer in time',
  github_rate_limited: "GitHub's limit for requests without a key was reached; try again in a while",
  github_bad_answer: "GitHub's answer could not be read",
  server_commit_not_found: "GitHub does not know the server's commit",
  server_commit_not_on_main: 'the server runs a commit that is not part of main',
  compare_incomplete: "GitHub's list of changed files may be cut short",
};
const reasonText = (reason) => UNKNOWN_REASON[reason]
  ?? (/^github_http_\d+$/.test(reason || '') ? `GitHub answered with an error (HTTP ${reason.slice(12)})` : 'no reason given');

function Row({ Icon, label, value, note, testId }) {
  return (
    <div data-testid={testId} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span className="ds-card__title-icon" style={{ flexShrink: 0 }}><Icon size={14} aria-hidden="true" /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.855rem', color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{value}</div>
        {note && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>{note}</div>}
      </div>
    </div>
  );
}

const Unknown = ({ reason }) => <><strong>Unknown</strong>: {reasonText(reason)}.</>;

function websiteValue(main) {
  if (!BUILD_COMMIT) return <><strong>Unknown</strong>: this build does not say which commit it was made from.</>;
  const built = `Built from ${short(BUILD_COMMIT)}`;
  if (main.status !== 'ok') return <>{built}. Compared with main: <Unknown reason={main.reason} /></>;
  if (main.commit.startsWith(BUILD_COMMIT) || BUILD_COMMIT.startsWith(main.commit)) return <>{built}, the latest commit on main.</>;
  return <>{built}; main is at {short(main.commit)}. Vercel may still be deploying, or its deploy failed: check Vercel.</>;
}

function deployValue(deploy) {
  const behind = deploy.commitsBehind != null ? ` in the ${deploy.commitsBehind} commit${deploy.commitsBehind === 1 ? '' : 's'} since the one it runs` : '';
  switch (deploy.verdict) {
    case 'up_to_date':
      return <>Up to date: the server runs the latest commit on main.</>;
    case 'likely_needed': {
      const more = deploy.serverFileCount - deploy.serverFiles.length;
      return (
        <>
          <strong>Probably needs a Manual Deploy</strong>: {deploy.serverFileCount} server file{deploy.serverFileCount === 1 ? '' : 's'} changed{behind}.
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: '0.75rem' }}>
            {deploy.serverFiles.map((f) => <li key={f} dir="ltr"><code>{f}</code></li>)}
            {more > 0 && <li>and {more} more</li>}
          </ul>
        </>
      );
    }
    case 'no_server_changes':
      return <>No server file changed{behind}, so a deploy is probably not needed. This is not proof.</>;
    default:
      return <Unknown reason={deploy.reason} />;
  }
}

function databaseValue(db) {
  if (db.status === 'ok') return <>Answered a ping in {db.latencyMs} ms at {clock(db.checkedAt)}.</>;
  return <><strong>Did not answer</strong> ({db.reason === 'not_connected' ? 'not connected' : 'the ping failed'}) at {clock(db.checkedAt)}.</>;
}

function requestError(error) {
  const status = error?.response?.status;
  if (status === 403) return 'No permission to view this (it needs the audit:read permission).';
  if (status === 503) return 'The server answered 503: it could not reach the database.';
  return status ? `Could not check (HTTP ${status}).` : 'Could not check: no answer from the server.';
}

export default function AdminServiceStatus() {
  // Not fetched on load: only when the admin presses the button, and the
  // console's Refresh does not re-run it.
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'service-status'],
    queryFn: () => getServiceStatus(),
    enabled: false,
    retry: false,
    gcTime: 0,
  });

  return (
    <section className="ds-card" aria-labelledby="service-status-title" style={{ marginTop: 18 }}>
      <div className="ds-card__hd">
        <span className="ds-card__title" id="service-status-title">
          <span className="ds-card__title-icon"><Activity size={14} aria-hidden="true" /></span> Service status
        </span>
        <button
          type="button" className="btn btn--outline btn--sm" onClick={() => refetch()} disabled={isFetching}
          style={{ borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={13} aria-hidden="true" /> {isFetching ? 'Checking…' : data ? 'Check again' : 'Check now'}
        </button>
      </div>
      <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!data && !error && !isFetching && (
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Checks the website and server versions, the database and GitHub when you press Check now.
          </p>
        )}
        {error && !isFetching && <p role="alert" style={{ margin: 0, fontSize: '0.82rem' }}>{requestError(error)}</p>}
        {/* After a failed check, the previous answer is not left on screen. */}
        {data && !error && (
          <>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }} data-testid="service-checked-at">
              Checked at {clock(data.checkedAt)}. Each line is a snapshot of that moment.
            </div>
            <Row
              testId="service-website" Icon={Globe} label="Website (Vercel)" value={websiteValue(data.main)}
              note="From the commit Vercel built this page from."
            />
            <Row
              testId="service-server" Icon={Server} label="Server (Render)"
              value={data.server.commit ? <>Runs {short(data.server.commit)}.</> : <Unknown reason="server_commit_unknown" />}
              note="The commit Render reports, the same as /api/healthz. It shows the program is running, not that the database is connected."
            />
            <Row
              testId="service-database" Icon={Database} label="Database (MongoDB)" value={databaseValue(data.database)}
              note="A ping from the server at the time of this check only."
            />
            <Row
              testId="service-main" Icon={GitBranch} label="Latest on main (GitHub)"
              value={data.main.status === 'ok'
                ? <>{short(data.main.commit)}{data.main.committedAt ? `, committed ${dateTime(data.main.committedAt)}` : ''}.</>
                : <Unknown reason={data.main.reason} />}
              note="From GitHub's public API, without a key. Answers are kept for up to 5 minutes."
            />
            <Row
              testId="service-deploy" Icon={Server} label="Does the server need a deploy?" value={deployValue(data.serverDeploy)}
              note="Compares the server's commit with main and looks for changed files under backend/ (its tests excluded, as they never run on Render). Changes made on Render itself, such as environment variables, are not visible here."
            />
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Not shown here: failed builds, deploy logs, a deploy in progress, or settings on Vercel or Render. Those need the platforms&apos; dashboards.
            </div>
          </>
        )}
      </div>
    </section>
  );
}
