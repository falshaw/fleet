/** Soft blurred colour blobs that sit behind the glass panels. */
export function AppBackground() {
  return (
    <div className="app-bg" aria-hidden>
      <i
        style={{
          width: 620,
          height: 620,
          left: -160,
          top: -180,
          background: "var(--blob1)",
        }}
      />
      <i
        style={{
          width: 520,
          height: 520,
          right: -120,
          top: 120,
          background: "var(--blob2)",
        }}
      />
      <i
        style={{
          width: 640,
          height: 640,
          left: "30%",
          bottom: -320,
          background: "var(--blob3)",
        }}
      />
    </div>
  );
}

/** The Fleet logo mark: two stacked server units on the gradient tile. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="logo-tile"
      style={{ width: size, height: size, borderRadius: size / 3 }}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        width={size / 2}
        height={size / 2}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="4" width="18" height="6" rx="2" />
        <rect x="3" y="14" width="18" height="6" rx="2" />
        <path d="M7 7h.01M7 17h.01" />
      </svg>
    </span>
  );
}

/** "Fle" + accent "et" word mark. */
export function WordMark() {
  return (
    <span>
      Fle<span className="text-accent">et</span>
    </span>
  );
}
