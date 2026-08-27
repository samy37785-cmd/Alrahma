import { Link } from "react-router-dom";
import { ChevronDownIcon } from "../ui/Icons";


export const ICON_SIZE = 15;

// Module-level — never remounts on Header re-renders; receives closures as explicit props
export function NavDropdown({ state, label, items, hubTo, wide, isActive, closeAll, viewAllLabel, allLabel }) {
  return (
    <div className={`nav__dropdown${state.open ? " nav__dropdown--expanded" : ""}`} ref={state.ref}>
      <button
        className={`nav__dropdown-trigger${state.open ? " nav__dropdown-trigger--open" : ""}${isActive(hubTo) ? " nav__active" : ""}`}
        onClick={() => state.setOpen((v) => !v)}
        aria-expanded={state.open}
        aria-haspopup="menu"
      >
        {label}
        <ChevronDownIcon
          size={11}
          className={`nav__dropdown-chevron${state.open ? " nav__dropdown-chevron--open" : ""}`}
        />
      </button>

      {/* Desktop mega-menu */}
      {state.open && (
        <ul
          className={`nav__dropdown-menu nav__dropdown-menu--mega${wide ? " nav__dropdown-menu--wide" : ""}`}
          role="menu"
        >
          {items.map((item) => (
            <li key={item.to + item.label} role="none">
              <Link
                to={item.to}
                className={isActive(item.to) ? "nav__dropdown-item nav__dropdown-item--active" : "nav__dropdown-item"}
                onClick={closeAll}
                role="menuitem"
              >
                <span className="nav__dropdown-item-icon" aria-hidden="true">
                  <item.Icon size={ICON_SIZE} />
                </span>
                {item.label}
              </Link>
            </li>
          ))}
          <li className="nav__megamenu-footer" role="none">
            <Link to={hubTo} onClick={closeAll} role="menuitem">{viewAllLabel} {label} →</Link>
          </li>
        </ul>
      )}

      {/* Mobile accordion — aria-hidden keeps screen readers on the desktop version only */}
      <ul className="nav__dropdown-mobile" aria-hidden="true">
        {items.map((item) => (
          <li key={item.to + item.label}>
            <Link to={item.to} className="nav__dropdown-item" onClick={closeAll} tabIndex={-1}>
              <span className="nav__dropdown-item-icon" aria-hidden="true">
                <item.Icon size={ICON_SIZE} />
              </span>
              {item.label}
            </Link>
          </li>
        ))}
        <li>
          <Link to={hubTo} className="nav__dropdown-item" onClick={closeAll} tabIndex={-1}
            style={{ fontWeight: 700, color: "var(--text-brand-strong)" }}>
            {allLabel} {label} →
          </Link>
        </li>
      </ul>
    </div>
  );
}
