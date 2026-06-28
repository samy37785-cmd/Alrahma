import { site } from '../../data';
import { useLang } from '../../context/LangContext';
import { UI_TEXT, pick } from '../../i18n/content';

export default function WhatsappFab() {
  const { lang } = useLang();
  const ui = pick(UI_TEXT, lang);
  return (
    <a
      href={`https://wa.me/${site.whatsapp}`}
      className="whatsapp-fab"
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ui.whatsapp}
    >
      💬
    </a>
  );
}
