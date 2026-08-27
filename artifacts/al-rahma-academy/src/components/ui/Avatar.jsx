/**
 * Avatar component — shows an image, or falls back to initials, or a generic icon.
 *
 * <Avatar name="Mahmoud Samy" size="md" />
 * <Avatar src="/path/to/pic.jpg" name="Mahmoud" size="lg" />
 * <Avatar.Group max={3}><Avatar/><Avatar/></Avatar.Group>
 */

import { useState } from 'react';

const SIZES = { xs: 24, sm: 32, md: 40, lg: 48, xl: 56, '2xl': 72 };

/* Stable color mapping from name for consistent avatar colors */
const AVATAR_COLORS = [
  '#0b6e4f', '#084d37', '#1a5fa0', '#7a3a8a',
  '#c0392b', '#d4af37', '#2c3e50', '#158a61',
];
function nameToColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function Avatar({
  src,
  name = '',
  alt,
  size = 'md',
  className = '',
  online,
  ...props
}) {
  const [imgError, setImgError] = useState(false);
  const px = typeof size === 'number' ? size : (SIZES[size] || 40);
  const initials = getInitials(name);
  const bgColor  = nameToColor(name);
  const showImg  = src && !imgError;

  return (
    <span
      className={`avatar avatar--${size} ${online !== undefined ? 'avatar--has-status' : ''} ${className}`}
      style={{ width: px, height: px, '--avatar-color': bgColor }}
      aria-label={alt || name || 'User avatar'}
      role="img"
      {...props}
    >
      {showImg ? (
        <img
          src={src}
          alt={alt || name}
          onError={() => setImgError(true)}
          className="avatar__img"
          loading="lazy"
        />
      ) : (
        <span className="avatar__initials" aria-hidden="true">{initials}</span>
      )}
      {online !== undefined && (
        <span
          className={`avatar__status avatar__status--${online ? 'online' : 'offline'}`}
          aria-label={online ? 'Online' : 'Offline'}
        />
      )}
    </span>
  );
}

Avatar.Group = function AvatarGroup({ children, max, className = '', ...props }) {
  const all = Array.isArray(children) ? children : [children];
  const visible = max ? all.slice(0, max) : all;
  const overflow = max ? all.length - max : 0;

  return (
    <div className={`avatar-group ${className}`} {...props}>
      {visible.map((child, i) =>
        child ? (
          <span key={i} className="avatar-group__item">
            {child}
          </span>
        ) : null
      )}
      {overflow > 0 && (
        <span className="avatar avatar--md avatar-group__overflow">
          <span className="avatar__initials">+{overflow}</span>
        </span>
      )}
    </div>
  );
};

export default Avatar;
