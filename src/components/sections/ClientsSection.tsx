import { GlassCta } from "@/components/GlassCta";
import { getFigmaClientKeyParagraphs, getFigmaClientMoments, journeyCtaLabel, } from "@/data/landing-content";
import { clientProfiles } from "@/data/site-content";
type ClientsSectionProps = {
    onNavigate: (href: string) => void;
};
export function ClientsSection({ onNavigate }: ClientsSectionProps) {
    return (<section className="figma-clients-section glass-editorial-section" aria-label="TASC client profiles">
      <div className="figma-clients-inner" id="clients">
        <div className="figma-clients-heading">
          <p className="figma-clients-kicker">Clients</p>
          <h2>
            <span>Two different worlds we work with.</span>
            <span>One standard of execution</span>
          </h2>
          <GlassCta className="figma-cta-primary figma-clients-cta" href="#brief" onClick={(event) => {
            event.preventDefault();
            onNavigate("#brief");
        }}>
            <span>{journeyCtaLabel}</span>
            <span className="figma-cta-arrow" aria-hidden="true">
              -&gt;
            </span>
          </GlassCta>
        </div>

        <div className="figma-client-card-stage">
          {clientProfiles.map((profile, index) => (<article className={`figma-client-card ${index === 0 ? "figma-client-card-brand" : "figma-client-card-public"}`} key={profile.title}>
              <h3>{profile.title}</h3>
              <div className="figma-client-title-divider" aria-hidden="true"/>
              <div className="figma-client-copy-block">
                <p className="figma-client-label">The Key to Results</p>
                <div className="figma-client-key-text">
                  {getFigmaClientKeyParagraphs(profile).map((paragraph) => (<p key={paragraph}>{paragraph}</p>))}
                </div>
              </div>
              <div className="figma-client-divider" aria-hidden="true"/>
              <div className="figma-client-copy-block">
                <p className="figma-client-label">The Right Moment</p>
                <ul className="figma-client-moment-list">
                  {getFigmaClientMoments(profile).map((moment) => (<li key={moment}>
                      <span className="figma-check" aria-hidden="true"/>
                      <span>{moment}</span>
                    </li>))}
                </ul>
              </div>
            </article>))}
          <a className="figma-clients-scroll-note" href="#services" onClick={(event) => {
            event.preventDefault();
            onNavigate("#services");
        }}>
            Keep scrolling to view the services
          </a>
        </div>
        <span className="clients-card-light-bridge" aria-hidden="true"/>
      </div>
      <div className="clients-services-curtain-space" aria-hidden="true"/>
    </section>);
}
