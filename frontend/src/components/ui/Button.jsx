import { forwardRef } from 'react';

/**
 * Unified Button component.
 *
 * Props:
 *   variant   – 'primary' | 'accent' | 'secondary' | 'outline' | 'ghost'
 *               | 'ghost-inv' | 'danger' | 'success' | 'warning' | 'link'
 *   size      – 'xs' | 'sm' | 'md' (default) | 'lg' | 'xl'
 *   loading   – bool — replaces label with spinner; disables interactions
 *   icon      – bool — compact square button (no inline text)
 *   block     – bool — width: 100%
 *   as        – element to render ('button' default, 'a', 'span', …)
 *   href      – shorthand to render as <a>
 *   All native button/anchor attributes pass through.
 */
const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon = false,
    block = false,
    as: Tag,
    href,
    className = '',
    children,
    disabled,
    onClick,
    ...rest
  },
  ref
) {
  const Element = Tag || (href ? 'a' : 'button');
  const isDisabled = disabled || loading;

  const classes = [
    'btn',
    `btn--${variant}`,
    size !== 'md' ? `btn--${size}` : '',
    icon ? 'btn--icon' : '',
    block ? 'btn--block' : '',
    loading ? 'btn--loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = (e) => {
    if (isDisabled) { e.preventDefault(); return; }
    onClick?.(e);
  };

  const props = {
    ref,
    className: classes,
    onClick: handleClick,
    ...(Element === 'button' && { type: rest.type || 'button', disabled: isDisabled }),
    ...(Element === 'a' && { href, 'aria-disabled': isDisabled || undefined }),
    'aria-busy': loading || undefined,
    ...rest,
  };

  return (
    <Element {...props}>
      {loading && (
        <span className="btn__spinner" aria-hidden="true" />
      )}
      <span className="btn__text">{children}</span>
    </Element>
  );
});

export default Button;
