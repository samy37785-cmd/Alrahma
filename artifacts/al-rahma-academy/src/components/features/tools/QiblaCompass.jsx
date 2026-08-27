export default function QiblaCompass({ bearing, deviceHeading }) {
  const needleAngle = deviceHeading !== null ? bearing - deviceHeading : bearing;
  const ringAngle   = deviceHeading !== null ? -deviceHeading : 0;

  return (
    <div
      className="it__compass-wrap"
      role="img"
      aria-label={`Qibla direction: ${Math.round(bearing)} degrees from North`}
    >
      <div className="it__compass" aria-hidden="true" style={{ transform: `rotate(${ringAngle}deg)` }}>
        {[['N','0'],['E','90'],['S','180'],['W','270']].map(([lbl, deg]) => (
          <span key={lbl} className="it__compass-card"
            style={{ transform: `rotate(${deg}deg) translateY(-80px) rotate(-${deg}deg)` }}>
            {lbl}
          </span>
        ))}
        {Array.from({ length: 36 }, (_, i) => (
          <div key={i} className="it__compass-tick"
            style={{ transform: `rotate(${i * 10}deg) translateY(-90px)`, height: i % 3 === 0 ? '12px' : '6px' }} />
        ))}
        <div className="it__compass-needle" style={{ transform: `rotate(${needleAngle}deg)` }}>
          <div className="it__compass-needle-up" />
          <div className="it__compass-needle-dn" />
        </div>
        <div className="it__compass-center">🕋</div>
      </div>
    </div>
  );
}
