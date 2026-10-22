// Rule 4: tokens are shown raw because this is education. They are mock-issued by a local stub, and labelled as such.
export default function TokenPanel({ tokens, mock = false }) {
  if (!tokens?.length) return null;
  return (
    <section aria-label="Tokens used in this run">
      <h2>Tokens <span className="status">mock-issued</span></h2>
      <p className="claims">{mock ? "Issued by this app's built-in mock issuer: unsigned, not PingFederate. They mean something only to this app." : "Issued by a local stub issuer, not PingFederate. They only work against the local demo."}</p>
      {tokens.map((t, i) => (
        <details key={i} className="token">
          <summary>{t.claims?.act ? <code>act={t.claims.act}</code> : <code>sub={t.claims?.sub}, no act</code>}{t.scope ? <> <code>scope={t.scope}</code></> : null}</summary>
          <pre aria-label="Decoded claims">{JSON.stringify(t.claims, null, 2)}</pre>
          <pre aria-label="Raw token" className="raw">{t.jwt}</pre>
        </details>
      ))}
    </section>
  );
}
