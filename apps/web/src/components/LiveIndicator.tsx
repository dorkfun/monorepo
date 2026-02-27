interface LiveIndicatorProps {
  live: boolean;
}

export function LiveIndicator({ live }: LiveIndicatorProps) {
  return (
    <span
      className={live ? "pulse" : ""}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "2px 8px",
        border: `1px solid ${live ? "#27c93f" : "#666"}`,
        borderRadius: "4px",
        fontSize: "12px",
        color: live ? "#27c93f" : "#666",
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: live ? "#27c93f" : "#666",
        }}
      />
      {live ? "LIVE" : "ENDED"}
    </span>
  );
}
