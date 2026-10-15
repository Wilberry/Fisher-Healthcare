import { Card, Notice, SiteShell, StatusPill } from '@fisher/ui';

const steps = [
  { number: '01', title: 'Explore supported tests', description: 'Review available diagnostic services and laboratory-approved preparation guidance.' },
  { number: '02', title: 'Choose your collection', description: 'Select a location, service option, and confirmed time window once bookings launch.' },
  { number: '03', title: 'Meet your collection professional', description: 'A trained team member collects and identifies specimens for transport to a partner laboratory.' },
  { number: '04', title: 'Receive released results securely', description: 'Access authorized results through the patient portal and an approved secure email process.' }
];

export default function Home() {
  return <SiteShell subtitle="Diagnostics brought closer" navigation={[
    { href: '#how-it-works', label: 'How it works' },
    { href: '#services', label: 'Our services' },
    { href: '#about', label: 'About us' }
  ]}>
    <section className="fisher-hero" aria-labelledby="hero-title">
      <div className="fisher-container fisher-hero-grid">
        <div>
          <p className="fisher-eyebrow">Lagos · Home and workplace sample collection</p>
          <h1 id="hero-title">Sample collection, <span>without the hospital wait.</span></h1>
          <p className="fisher-lead">Professional specimen collection, coordinated laboratory testing, and secure access to results—designed around your schedule.</p>
          <div className="fisher-hero-links">
            <a className="fisher-button fisher-button--primary" href="#how-it-works">Explore how it works</a>
            <a className="fisher-button fisher-button--secondary" href="#services">View collection options</a>
          </div>
        </div>
        <Card className="fisher-hero-card" aria-label="Service preparation status">
          <StatusPill tone="caution">Preparing for launch</StatusPill>
          <h2>Convenient diagnostics, coordinated with care.</h2>
          <p>Fisher Healthcare is preparing to offer home and workplace sample collection through professional teams and partner laboratories.</p>
          <ul className="fisher-check-list">
            <li>Patient-focused appointment experience</li>
            <li>Responsible specimen handling</li>
            <li>Secure results and communications</li>
          </ul>
          <p className="fisher-hero-card-note">The Lagos pilot is not yet accepting bookings.</p>
        </Card>
      </div>
    </section>

    <section className="fisher-section" id="how-it-works">
      <div className="fisher-container">
        <p className="fisher-eyebrow">A simpler care journey</p>
        <h2 className="fisher-section-title">How Fisher Healthcare will work</h2>
        <p className="fisher-lead">One coordinated experience, from appointment planning to secure delivery of laboratory-validated results.</p>
        <div className="fisher-grid fisher-steps">
          {steps.map(step => <Card key={step.number}>
            <span className="fisher-step-number">{step.number}</span>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </Card>)}
        </div>
      </div>
    </section>

    <section className="fisher-section fisher-services" id="services">
      <div className="fisher-container">
        <p className="fisher-eyebrow">Planned collection services</p>
        <h2 className="fisher-section-title">Flexible options for everyday needs</h2>
        <div className="fisher-grid fisher-two-col">
          <Card>
            <StatusPill>Regular collection</StatusPill>
            <h3>Planned around reliable collection windows</h3>
            <p>Area-based scheduling is designed to make routine specimen collection convenient and efficient. Availability and timing will be shown before a booking is confirmed.</p>
          </Card>
          <Card tone="soft">
            <StatusPill tone="positive">Premium collection</StatusPill>
            <h3>Priority when time matters</h3>
            <p>Priority same-day collection will be offered where available, subject to location, cutoffs, professional availability, and laboratory capacity.</p>
          </Card>
        </div>
        <Notice title="Service activation in progress">
          Pricing, supported tests, collection zones, and appointment availability will be published after operational and laboratory validation. There are no active online bookings at this stage.
        </Notice>
      </div>
    </section>

    <section className="fisher-section" id="about">
      <div className="fisher-container fisher-about">
        <div>
          <p className="fisher-eyebrow">Built for people and their families</p>
          <h2 className="fisher-section-title">A more connected diagnostic experience.</h2>
        </div>
        <p className="fisher-lead">Fisher Healthcare aims to remove unnecessary friction between patients, sample collection, and partner laboratories. Our planned platform will support authorized family bookings while keeping each patient's clinical result access private and independently protected.</p>
      </div>
    </section>
  </SiteShell>;
}
