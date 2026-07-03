const MOCK_LEADERS = [
  { rank: 1, name: 'Ahmad K.', flag: '🇩🇪', juz: 18, surahs: 62, badge: '🥇' },
  { rank: 2, name: 'Fatima R.', flag: '🇬🇧', juz: 15, surahs: 54, badge: '🥈' },
  { rank: 3, name: 'Yusuf M.', flag: '🇫🇷', juz: 12, surahs: 47, badge: '🥉' },
  { rank: 4, name: 'Aisha S.', flag: '🇳🇱', juz: 9, surahs: 38, badge: '' },
  { rank: 5, name: 'Omar B.', flag: '🇮🇹', juz: 7, surahs: 29, badge: '' },
];

export default function HifzLeaderboard({ myRank = null }) {
  return (
    <div className="hifz-lb">
      <div className="hifz-lb__header">
        <span className="hifz-lb__icon" aria-hidden="true">🏆</span>
        <div>
          <h3 className="hifz-lb__title">Hifz Leaderboard</h3>
          <p className="hifz-lb__sub">Top memorizers this month</p>
        </div>
        {myRank && (
          <span className="hifz-lb__my-rank" aria-label={`Your rank: ${myRank}`}>
            Your rank: #{myRank}
          </span>
        )}
      </div>

      <ol className="hifz-lb__list" aria-label="Hifz leaderboard">
        {MOCK_LEADERS.map((l) => (
          <li key={l.rank} className={`hifz-lb__item${l.rank <= 3 ? ' hifz-lb__item--top' : ''}`}>
            <span className="hifz-lb__rank" aria-hidden="true">
              {l.badge || `#${l.rank}`}
            </span>
            <span className="hifz-lb__name">
              {l.flag} {l.name}
            </span>
            <div className="hifz-lb__progress-wrap">
              <div className="hifz-lb__bar">
                <div
                  className="hifz-lb__bar-fill"
                  style={{ width: `${Math.round((l.juz / 30) * 100)}%` }}
                  aria-label={`${l.juz} of 30 juz memorized`}
                />
              </div>
              <span className="hifz-lb__juz">{l.juz}/30 juz</span>
            </div>
          </li>
        ))}
      </ol>

      <p className="hifz-lb__note">
        Rankings update weekly · Privacy settings available in your profile
      </p>
    </div>
  );
}
