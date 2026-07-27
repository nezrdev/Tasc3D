import { ArrowRight } from "lucide-react";
import { tascMapsEmbedUrl, tascOfficeAddress, } from "@/data/landing-content";
import { processSteps } from "@/data/site-content";
type ProcessSectionProps = {
    mapArmed: boolean;
};
export function ProcessSection({ mapArmed }: ProcessSectionProps) {
    return (<section className="process-contact-section glass-editorial-section" id="process" aria-label="The process and contact">
      <div className="process-contact-bg" aria-hidden="true">
        <span className="process-gradient process-gradient-top"/>
        <span className="process-gradient process-gradient-bottom"/>
      </div>

      <div className="process-contact-inner">
        <div className="process-contact-header stagger-reveal-group">
          <h2>
            <span className="stagger-reveal-item">Five steps from brief</span>
            <span className="stagger-reveal-item">to final report</span>
          </h2>
          <p className="stagger-reveal-item">The Process</p>
        </div>

        <div className="process-contact-list" aria-label="Process steps">
          {processSteps.map((step, index) => (<article className="process-contact-row reveal-block" key={step.title}>
              <div className="process-contact-row-title">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
              </div>
              <p>{step.body}</p>
            </article>))}
        </div>

        <div className="process-contact-footer stagger-reveal-group" id="contact">
          <div className="process-contact-copy">
            <p className="process-contact-agency stagger-reveal-item">
              TASC is a strategic communications agency for those operating at scale: international brands, major
              corporations, and government entities.
            </p>
            <div className="process-contact-actions">
              <h2 className="stagger-reveal-item">Get in Touch</h2>
              <a className="stagger-reveal-item" href="tel:+9713670826">
                <span>Phone</span>
                <strong>+971 367 0826</strong>
                <ArrowRight aria-hidden="true" size={26} strokeWidth={1.4}/>
              </a>
              <a className="stagger-reveal-item" href="mailto:info@tascagency.com">
                <span>Email</span>
                <strong>info@tascagency.com</strong>
                <ArrowRight aria-hidden="true" size={26} strokeWidth={1.4}/>
              </a>
            </div>
          </div>

          <div className="process-map-card" aria-label="TASC office location map">
            <iframe title="TASC office location in Google Maps" src={mapArmed ? tascMapsEmbedUrl : undefined} loading="eager" referrerPolicy="no-referrer-when-downgrade" allowFullScreen/>
            <div className="process-map-overlay">
              <p className="process-map-street">King Salman Bin Abdulaziz Al Saud St Al Sufouh - Al Sufouh 2</p>
              <strong className="process-map-office">{tascOfficeAddress}</strong>
              <a className="process-map-open" href="https://www.google.com/maps/search/?api=1&query=Office%2015%2C%20Building%204%2C%20Media%20City%2C%20Dubai%2C%20UAE" target="_blank" rel="noreferrer">
                Open in Google Maps
                <ArrowRight aria-hidden="true" size={18} strokeWidth={1.5}/>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>);
}
