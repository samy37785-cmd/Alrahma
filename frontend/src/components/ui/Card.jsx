/**
 * Card component system.
 *
 * <Card>                          basic surface
 * <Card hoverable clickable>      with hover elevation + pointer cursor
 * <Card.Header>                   top section (title + optional action)
 * <Card.Body>                     main content area
 * <Card.Footer>                   bottom section (muted background)
 * <Card.Title>                    heading within header
 * <Card.Description>              secondary text
 * <Card.Divider>                  horizontal rule
 */

/* ── Root card ── */
export function Card({
  hoverable = false,
  clickable = false,
  selected = false,
  loading = false,
  accent,           /* 'primary' | 'success' | 'warning' | 'danger' */
  className = '',
  children,
  ...props
}) {
  const classes = [
    'card',
    hoverable ? 'card--hoverable' : '',
    clickable ? 'card--clickable' : '',
    selected  ? 'card--selected'  : '',
    loading   ? 'card--loading'   : '',
    accent    ? `card--accent-${accent}` : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

/* ── Sub-components ── */
Card.Header = function CardHeader({ className = '', children, action, ...props }) {
  return (
    <div className={`card__header ${className}`} {...props}>
      <div className="card__header-content">{children}</div>
      {action && <div className="card__header-action">{action}</div>}
    </div>
  );
};

Card.Title = function CardTitle({ className = '', as: Tag = 'h3', children, ...props }) {
  return <Tag className={`card__title ${className}`} {...props}>{children}</Tag>;
};

Card.Description = function CardDescription({ className = '', children, ...props }) {
  return <p className={`card__description ${className}`} {...props}>{children}</p>;
};

Card.Body = function CardBody({ className = '', children, ...props }) {
  return <div className={`card__body ${className}`} {...props}>{children}</div>;
};

Card.Footer = function CardFooter({ className = '', children, ...props }) {
  return <div className={`card__footer ${className}`} {...props}>{children}</div>;
};

Card.Divider = function CardDivider({ className = '', ...props }) {
  return <hr className={`card__divider ${className}`} {...props} />;
};

export default Card;
