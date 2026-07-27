import { howWeWorkStoryCopy } from "@/data/landing-content";
export function HowWeWorkSection() {
    return (<section className="how-work-motion-section glass-editorial-section" id="work" aria-label="How We Work">
      <div className="how-work-motion-glow" aria-hidden="true"/>
      <div className="how-work-motion-inner">
        <div className="how-work-motion-left">
          <div className="how-work-motion-title">
            <p className="how-work-motion-kicker">How We Work</p>
            <h2>
              <span>Engineered for outcomes,</span>
              <span>not announcements</span>
            </h2>
          </div>
          <p className="how-work-motion-support">
            Fully documented process.
            <br />
            Rigorous compliance
          </p>
        </div>

        <div className="how-work-motion-right" aria-live="polite">
          <div className="how-work-number-row" aria-hidden="true">
            {howWeWorkStoryCopy.map((item, index) => (<span className={`how-work-step-number how-work-step-number-${index + 1}`} key={item.number}>
                {item.number}
              </span>))}
          </div>
          <span className="how-work-rule how-work-rule-top" aria-hidden="true"/>
          <div className="how-work-copy-stack">
            {howWeWorkStoryCopy.map((item, index) => (<article className={`how-work-step-copy how-work-step-copy-${index + 1}`} key={item.number}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>))}
          </div>
          <span className="how-work-rule how-work-rule-bottom" aria-hidden="true"/>
        </div>
      </div>
    </section>);
}
