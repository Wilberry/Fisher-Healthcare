import { Card, Notice, SiteShell, StatusPill } from '@fisher/ui';

export default function Field() {
  return <SiteShell subtitle="Field operations">
    <section className="fisher-section">
      <div className="fisher-container">
        <p className="fisher-eyebrow">Field team platform · Foundation preview</p>
        <h1 className="fisher-section-title">Purpose-built for collection and handoff teams.</h1>
        <p className="fisher-lead">A mobile-first workflow for assigned visits, specimen collection, secure handoffs, and field exception reporting.</p>
        <Notice title="Field operations have not been activated" tone="warning">
          No clinical assignments, patient information, or specimen processing functions are available in this foundation build.
        </Notice>
      </div>
    </section>
    <section className="fisher-section">
      <div className="fisher-container">
        <h2 className="fisher-section-title">Planned field capabilities</h2>
        <div className="fisher-grid">
          <Card><StatusPill>Phase 3</StatusPill><h3 style={{marginTop:18}}>Assigned visits</h3><p>Access only collection tasks allocated to an authorized field professional.</p></Card>
          <Card><StatusPill>Phase 3</StatusPill><h3 style={{marginTop:18}}>Collection checklists</h3><p>Document patient verification, specimen identification, and required collection steps.</p></Card>
          <Card><StatusPill>Phase 3</StatusPill><h3 style={{marginTop:18}}>Custody and incidents</h3><p>Record attributable handoffs, transport exceptions, and field event acknowledgments.</p></Card>
        </div>
      </div>
    </section>
  </SiteShell>;
}
