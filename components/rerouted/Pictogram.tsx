// Filled pictograms drawn for the sign system: white on a black inset square, one weight.

export type PictoName = "depart" | "arrive" | "bed" | "card" | "closed" | "clock" | "refund" | "reroute" | "agent" | "lock" | "check" | "search" | "flag" | "home";

const PLANE =
  "M12 1.8c.9 0 1.5 1 1.5 2.2v5.1l7.7 4.5v2.2l-7.7-2.3v4.6l2.3 1.7v1.6L12 20.3l-3.8 1.1v-1.6l2.3-1.7V13.5L2.8 15.8v-2.2l7.7-4.5V4c0-1.2.6-2.2 1.5-2.2z";

function Glyph({ name }: { name: PictoName }) {
  switch (name) {
    case "depart":
      return (
        <>
          <path d={PLANE} transform="translate(12 11) rotate(60) scale(.78) translate(-12 -12)" />
          <rect x="3" y="20" width="18" height="2" />
        </>
      );
    case "arrive":
      return (
        <>
          <path d={PLANE} transform="translate(12 10.5) rotate(120) scale(.78) translate(-12 -12)" />
          <rect x="3" y="20" width="18" height="2" />
        </>
      );
    case "bed":
      return (
        <>
          <path d="M2.5 5h2.2v8.2h16.8V20h-2.2v-2.6H4.7V20H2.5z" />
          <circle cx="8.3" cy="10" r="2.3" />
          <path d="M11.6 7.6h5.8a4 4 0 0 1 4 4v.6h-9.8z" />
        </>
      );
    case "card":
      return (
        <path
          fillRule="evenodd"
          d="M2 5.5h20v13H2zm2 2v2h16v-2zm0 5v4h16v-4zm1.5 1h5v1.6h-5z"
        />
      );
    case "closed":
      return <path fillRule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-6 8.4v3.2h12v-3.2z" />;
    case "clock":
      return <path fillRule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6zM11 6.5h2v5l3.6 2.1-1 1.7-4.6-2.7z" />;
    case "refund":
      return <path d="M12 3a9 9 0 1 1-8.7 11.3l2.1-.6A6.8 6.8 0 1 0 6.9 7.5L9.5 10H2.8V3.3l2.6 2.6A9 9 0 0 1 12 3zm-1 4.5h2v1.1c1.3.3 2.2 1.1 2.4 2.3h-2c-.1-.4-.6-.7-1.4-.7-.9 0-1.3.3-1.3.7 0 .5.6.7 1.8 1 1.8.4 3 1 3 2.6 0 1.2-.9 2-2.5 2.3v1.1h-2v-1.1c-1.5-.3-2.4-1.2-2.5-2.5h2c.1.5.6.9 1.6.9s1.4-.3 1.4-.8-.5-.7-1.8-1C9.9 12.8 8.9 12.1 8.9 10.7c0-1 .8-1.9 2.1-2.2z" />;
    case "reroute":
      return (
        <>
          <path d="M5 21V10.5A5.5 5.5 0 0 1 10.5 5H15V2l5 4.3-5 4.3V7.3h-4.5a3.2 3.2 0 0 0-3.2 3.2V21z" />
        </>
      );
    case "lock":
      return <path fillRule="evenodd" d="M12 2.5a5 5 0 0 1 5 5V10h1.5A1.5 1.5 0 0 1 20 11.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20.5v-9A1.5 1.5 0 0 1 5.5 10H7V7.5a5 5 0 0 1 5-5zm0 2.2a2.8 2.8 0 0 0-2.8 2.8V10h5.6V7.5A2.8 2.8 0 0 0 12 4.7zM11 14v4h2v-4z" />;
    case "home":
      return <path d="M12 3 2.5 11.5h2.8V21h5.2v-6h3v6h5.2v-9.5h2.8z" />;
    case "flag":
      return <path d="M5 2h2v20H5zM8 3h11l-2.5 4.5L19 12H8z" />;
    case "check":
      return <path d="M9.4 15.6 5.2 11.4 3 13.6l6.4 6.4L21 8.4l-2.2-2.2z" />;
    case "search":
      return <path fillRule="evenodd" d="M10 2.5a7.5 7.5 0 0 1 5.96 12.05l5.25 5.24-1.42 1.42-5.24-5.25A7.5 7.5 0 1 1 10 2.5zm0 2.2a5.3 5.3 0 1 0 0 10.6 5.3 5.3 0 0 0 0-10.6z" />;
    case "agent":
      return <path fillRule="evenodd" d="M7 6h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3zm2 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM11 2h2v4h-2z" />;
  }
}

export function Pictogram({ name, size = 48, className = "", label }: { name: PictoName; size?: number; className?: string; label?: string }) {
  return (
    <span className={`picto ${className}`} style={{ width: size, height: size }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="currentColor">
        <Glyph name={name} />
      </svg>
    </span>
  );
}
