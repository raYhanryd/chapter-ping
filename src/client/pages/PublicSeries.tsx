import { Link, useParams } from "react-router-dom";
import { LoadingRows } from "../components/ui";
import { formatRelative } from "../lib/format";
import { usePublicSeries } from "../lib/queries";

function ShareHead({ seriesId }: { seriesId?: string }) {
  return (
    <header className="site-head">
      <Link className="wordmark" to="/">
        Chapter Ping
      </Link>
      <Link
        className="quiet-link"
        to={seriesId ? `/login?next=${encodeURIComponent(`/dashboard?add=${seriesId}`)}` : "/login"}
      >
        Sign in
      </Link>
    </header>
  );
}

export function PublicSeries() {
  const { id = "" } = useParams();
  const query = usePublicSeries(id);

  if (query.isPending) {
    return (
      <div className="share-shell">
        <ShareHead />
        <main className="share" aria-busy="true">
          <LoadingRows rows={2} columns={2} />
        </main>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="share-shell">
        <ShareHead />
        <main className="share share-missing">
          <h1>That series is not here</h1>
          <p className="share-lede">The link may be old, or the series is no longer tracked.</p>
          <Link className="btn btn-primary" to="/">
            See how Chapter Ping works
          </Link>
        </main>
      </div>
    );
  }

  const { series } = query.data;
  const latest = series.latestChapter;

  return (
    <div className="share-shell">
      <ShareHead seriesId={series.id} />

      <main className="share">
        <article className="share-series">
          <img
            className="share-cover"
            src={series.coverUrl}
            alt={`Cover of ${series.title}`}
            width={280}
            height={420}
          />

          <div className="share-copy">
            <h1 className="share-title">{series.title}</h1>

            {latest ? (
              <>
                <p className="share-chapter">{latest.label} is out.</p>
                <p className="share-meta">
                  {latest.publishedAt ? `Updated ${formatRelative(latest.publishedAt)}. ` : null}
                  <a href={latest.url ?? series.siteUrl} target="_blank" rel="noreferrer">
                    Read it on weebcentral
                  </a>
                </p>
              </>
            ) : (
              <p className="share-chapter">No chapter has been recorded yet.</p>
            )}

            <p className="share-lede">
              Chapter Ping watches this series and posts each new chapter to Discord, with the number
              and a link. Set it up once and stop refreshing.
            </p>

            <div className="share-actions">
              <Link
                className="btn btn-primary"
                to={`/login?next=${encodeURIComponent(`/dashboard?add=${series.id}`)}`}
              >
                Continue with Discord
              </Link>
              <a className="quiet-link" href={series.siteUrl} target="_blank" rel="noreferrer">
                Open on weebcentral
              </a>
            </div>

            <p className="share-note">Free launch, first 100 accounts. Five series per account.</p>
          </div>
        </article>
      </main>
    </div>
  );
}
