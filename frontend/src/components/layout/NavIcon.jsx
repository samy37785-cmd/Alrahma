/* Icon renderer — keeps icon size consistent across all nav items */
export default function NavIcon({ icon: Icon, size = 16 }) {
  return <Icon size={size} aria-hidden="true" />;
}
