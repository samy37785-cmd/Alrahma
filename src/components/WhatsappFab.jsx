import { site } from '../data';

export default function WhatsappFab() {
  return (
    <a
      href={`https://wa.me/${site.whatsapp}`}
      className="whatsapp-fab"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
    >
      💬
    </a>
  );
}
