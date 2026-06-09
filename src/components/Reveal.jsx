import useScrollReveal from '../hooks/useScrollReveal';

/**
 * Wraps children in an element that fades/slides in on scroll.
 * `as` lets you choose the rendered tag (default div).
 */
export default function Reveal({ as: Tag = 'div', className = '', children, ...rest }) {
  const ref = useScrollReveal();
  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
}
