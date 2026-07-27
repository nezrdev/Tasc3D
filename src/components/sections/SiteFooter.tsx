import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { footerNavigation, tascStreetAddress } from "@/data/landing-content";
type SiteFooterProps = {
    onNavigate: (href: string) => void;
};
export function SiteFooter({ onNavigate }: SiteFooterProps) {
    return (<footer className="site-footer" aria-label="TASC footer">
      <div className="site-footer-inner">
        <div className="footer-top stagger-reveal-group">
          <div className="footer-brand-block">
            <Image className="stagger-reveal-item" src="/media/tasc-logo-20260710.svg" alt="TASC" width={1271} height={280}/>
            <a className="stagger-reveal-item" href="mailto:info@tascagency.com">
              info@tascagency.com
            </a>
            <p className="stagger-reveal-item">{tascStreetAddress}</p>
          </div>

          <nav className="footer-menu" aria-label="Footer navigation">
            {footerNavigation.map((item) => (<a className="stagger-reveal-item" href={item.href} key={`${item.label}-${item.href}`} onClick={(event) => {
                event.preventDefault();
                onNavigate(item.href);
            }}>
                {item.label}
              </a>))}
          </nav>

          <div className="footer-contact-links">
            <a className="stagger-reveal-item" href="#services" onClick={(event) => {
            event.preventDefault();
            onNavigate("#services");
        }}>
              Back to Services
              <ArrowRight aria-hidden="true" size={28} strokeWidth={1.3}/>
            </a>
            <a className="stagger-reveal-item" href="tel:+9713670826">
              +971 367 0826
              <ArrowRight aria-hidden="true" size={28} strokeWidth={1.3}/>
            </a>
          </div>
        </div>

        <div className="footer-bottom stagger-reveal-group">
          <p className="stagger-reveal-item">© 2026, Tasci Strategic Communications Agency Fz Llc</p>
          <div className="footer-legal-links">
            <a className="stagger-reveal-item" href="/privacy-policy">
              Privacy Policy
            </a>
            <a className="stagger-reveal-item" href="/cookie-policy">
              Cookie Policy
            </a>
          </div>
        </div>
      </div>
    </footer>);
}
