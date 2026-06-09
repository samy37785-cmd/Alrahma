// A small modal that lets the user choose which resource of a course to open.
// `course` = the course object (with a `resources` array) or null (hidden).
const ICONS = { youtube: '▶️', pdf: '📕', link: '🔗' };

export default function ResourceModal({ course, onClose }) {
  if (!course) return null;

  return (
    <div className="modal" onClick={onClose}>
      {/* stop propagation so clicking inside the card doesn't close it */}
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose} aria-label="Close">×</button>
        <h3 className="modal__title">{course.title}</h3>
        <p className="modal__sub">Choose how you’d like to start learning:</p>

        <div className="modal__options">
          {course.resources.map((r) => (
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
      </div>
    </div>
  );
}
