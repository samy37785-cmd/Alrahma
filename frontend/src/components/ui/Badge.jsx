/**
 * Badge / Tag / StatusDot
 *
 * <Badge>Default</Badge>
 * <Badge variant="success">Active</Badge>
 * <Badge variant="warning" dot>Pending</Badge>
 * <Badge size="sm">small</Badge>
 * <StatusDot variant="success" />   (just the colored dot)
 */

const VARIANTS = {
  default: 'badge--default',
  primary: 'badge--primary',
  success: 'badge--success',
  warning: 'badge--warning',
  danger:  'badge--danger',
  info:    'badge--info',
  accent:  'badge--accent',
  muted:   'badge--muted',
};

export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  outline = false,
  pill = true,
  className = '',
  children,
  ...props
}) {
  const classes = [
    'badge',
    VARIANTS[variant] || VARIANTS.default,
    size !== 'md' ? `badge--${size}` : '',
    outline ? 'badge--outline' : '',
    pill ? '' : 'badge--square',
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} {...props}>
      {dot && <StatusDot variant={variant} />}
      {children}
    </span>
  );
}

export function StatusDot({ variant = 'default', className = '', ...props }) {
  return (
    <span
      className={`status-dot status-dot--${variant} ${className}`}
      aria-hidden="true"
      {...props}
    />
  );
}

/* Convenience aliases */
function BadgeSuccess(p) { return <Badge variant="success" {...p} />; }
function BadgeWarning(p) { return <Badge variant="warning" {...p} />; }
function BadgeDanger(p)  { return <Badge variant="danger"  {...p} />; }
function BadgeInfo(p)    { return <Badge variant="info"    {...p} />; }
Badge.Success = BadgeSuccess;
Badge.Warning = BadgeWarning;
Badge.Danger  = BadgeDanger;
Badge.Info    = BadgeInfo;

export default Badge;
