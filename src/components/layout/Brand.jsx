import { site } from '../../data';

export default function Brand({ light = false }) {
  return (
    <a href="#top" className={`brand${light ? ' brand--light' : ''}`}>
      <span className="brand__mark">۩</span>
      <span className="brand__text">
        <strong>{site.name}</strong>
        <small>{site.tagline}</small>
      </span>
    </a>
  );
}
