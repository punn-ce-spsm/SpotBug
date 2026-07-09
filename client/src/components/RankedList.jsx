function DeltaArrow({ delta }) {
  if (!delta) return <span className="text-muted">–</span>;
  if (delta > 0) return <span style={{ color: 'var(--green)', fontWeight: 700 }}>▲ {delta}</span>;
  return <span style={{ color: 'var(--red)', fontWeight: 700 }}>▼ {Math.abs(delta)}</span>;
}

export default function RankedList({ ranking, highlightPlayerId }) {
  return (
    <div className="list">
      {ranking.map((entry) => (
        <div
          key={entry.playerId}
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            border: entry.playerId === highlightPlayerId ? '2px solid var(--purple)' : undefined,
          }}
        >
          <strong style={{ width: 28 }}>#{entry.rank}</strong>
          <span style={{ flex: 1, textAlign: 'left', fontWeight: entry.playerId === highlightPlayerId ? 700 : 400 }}>
            {entry.nickname}
          </span>
          <DeltaArrow delta={entry.delta} />
          <strong style={{ width: 60, textAlign: 'right' }}>{entry.score}</strong>
        </div>
      ))}
    </div>
  );
}
