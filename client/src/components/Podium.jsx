const PLACE_COLORS = ['var(--yellow)', '#c0c0c0', '#cd7f32'];
const PLACE_HEIGHTS = [120, 90, 70];
const ORDER = [1, 0, 2]; // display 2nd, 1st, 3rd like a real podium

export default function Podium({ ranking }) {
  const top3 = ranking.slice(0, 3);
  if (top3.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8, width: '100%' }}>
      {ORDER.filter((i) => top3[i]).map((i) => {
        const entry = top3[i];
        return (
          <div key={entry.playerId} style={{ flex: 1, textAlign: 'center', maxWidth: 140 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{entry.nickname}</div>
            <div className="text-muted">{entry.score} pts</div>
            <div
              style={{
                marginTop: 8,
                height: PLACE_HEIGHTS[i],
                background: PLACE_COLORS[i],
                borderRadius: '10px 10px 0 0',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: 8,
                fontWeight: 900,
                fontSize: 22,
                color: '#3a2600',
              }}
            >
              {i + 1}
            </div>
          </div>
        );
      })}
    </div>
  );
}
