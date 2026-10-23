import React from 'react';

export default function PancakeLogo({ size = 32, className = '', style = {} }) {
  const px = Math.max(24, Number(size) || 32);
  return (
    <span
      className={`pk-logo-badge ${className}`}
      style={{
        width: px,
        height: px,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        verticalAlign: 'middle',
        background: '#09090b',
        border: '1px solid rgba(200, 161, 101, 0.55)',
        boxShadow: '0 0 12px rgba(200, 161, 101, 0.22)',
        borderRadius: 3,
        ...style,
      }}
    >
      <img
        src="/pancake-logo.jpg"
        alt="Pancake Stats"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scale(1.42)',
          transformOrigin: 'center center',
          display: 'block',
          filter: 'contrast(1.12) brightness(1.08)',
        }}
      />
    </span>
  );
}
