import { site, socials } from '../data';

export default function TopBar() {
  return (
    <div className="topbar">
      <div className="container topbar__inner">
        <div className="topbar__contact">
          <a href={`mailto:${site.email}`}>✉ {site.email}</a>
          <a href={`tel:${site.phoneHref}`}>☎ {site.phoneDisplay}</a>
        </div>
        <div className="topbar__social">
          {socials.map((s) => (
            <a key={s.label} href={s.href} aria-label={s.label} target="_blank" rel="noopener noreferrer">
              <i className={s.icon}></i>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
