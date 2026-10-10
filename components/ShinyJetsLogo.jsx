"use client";

const SIZES = {
  xs: { height: 24, width: 96 },
  sm: { height: 32, width: 128 },
  md: { height: 40, width: 160 },
  lg: { height: 64, width: 256 },
  xl: { height: 80, width: 320 },
};

export default function ShinyJetsLogo({ size = 'md', mode, className = '' }) {
  const dims = SIZES[size] || SIZES.md;

  // mode = 'dark' forces dark-bg logo, 'light' forces light-bg logo
  // If not specified, renders both and uses CSS to auto-switch
  if (mode === 'dark') {
    return (
      <img
        src="/logos/shiny-jets-dark.png"
        alt="Logo"
        height={dims.height}
        style={{ height: dims.height, maxWidth: dims.width, objectFit: 'contain' }}
        className={className}
      />
    );
  }

  if (mode === 'light') {
    return (
      <img
        src="/logos/shiny-jets-light.png"
        alt="Logo"
        height={dims.height}
        style={{ height: dims.height, maxWidth: dims.width, objectFit: 'contain' }}
        className={className}
      />
    );
  }

  // Auto mode follows .theme-light. The dark-bg file is shiny-jets-dark.png.
  const style = { height: dims.height, maxWidth: dims.width, objectFit: 'contain' };
  return (
    <span className={`inline-flex items-center ${className}`}>
      <img
        src="/logos/shiny-jets-dark.png"
        alt="Shiny Jets CRM"
        height={dims.height}
        style={style}
        className="sj-logo-for-dark"
      />
      <img
        src="/logos/shiny-jets-light.png"
        alt=""
        aria-hidden="true"
        height={dims.height}
        style={style}
        className="sj-logo-for-light"
      />
    </span>
  );
}
