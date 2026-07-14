// A small modal that lets the user choose which resource of a course to open.
// `course` = the course object (with a `resources` array) or null (hidden).
import { useLang } from '../../context/LangContext';
import { UI_TEXT, pick } from '../../i18n/content';
import Modal from './Modal';

const ICONS = { youtube: '▶️', pdf: '📕', link: '🔗' };

export default function ResourceModal({ course, onClose }) {
  const { lang } = useLang();
  const ui = pick(UI_TEXT, lang);

  return (
    <Modal
      open={!!course}
      onClose={onClose}
      title={course?.title}
      subtitle={ui.chooseResource}
      size="sm"
      closeLabel={ui.close}
    >
      <div className="modal__options">
        {course?.resources.map((r) => (
          <a
            key={r.url}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="modal__option"
            onClick={onClose}
          >
            <span className="modal__icon">{ICONS[r.type] || ICONS.link}</span>
            <span>{r.label}</span>
            <span className="modal__arrow">→</span>
          </a>
        ))}
      </div>
    </Modal>
  );
}
