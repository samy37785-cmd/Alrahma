import useScrollReveal from '../../hooks/useScrollReveal';

/**
 * Wraps children in an element that fades/slides in on scroll.
 * `as`    — rendered HTML tag (default: div)
 * `delay` — transition-delay in ms, for stagger effects
 */
export default function Reveal({ as: Tag = 'div', className = '', children, delay, style, ...rest }) {
  const ref = useScrollReveal();
  const combined = delay
    ? { transitionDelay: `${delay}ms`, ...style }
    : style;

  return (
    <Tag ref={ref} className={className} style={combined} {...rest}>
      {children}
    </Tag>
  );
}
