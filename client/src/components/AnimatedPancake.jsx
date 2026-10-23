import React from 'react';

export default function AnimatedPancake({ size = 160, showTelemetry = true }) {
  const containerSize = size + 70;
  return (
    <div
      className="pk-anim-stage"
      style={{
        width: containerSize,
        height: containerSize,
      }}
    >
      {/* Halo lumineux pulsant */}
      <div className="pk-anim-glow" />

      {/* Anneaux radar orbitaux en rotation */}
      <svg
        className="pk-anim-orbit pk-orbit-slow"
        viewBox="0 0 240 240"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="18"
          y="18"
          width="204"
          height="204"
          rx="6"
          stroke="rgba(200, 161, 101, 0.28)"
          strokeWidth="1.2"
          strokeDasharray="10 6"
        />
        <circle
          cx="120"
          cy="120"
          r="104"
          stroke="rgba(14, 165, 233, 0.25)"
          strokeWidth="1.2"
          strokeDasharray="4 8"
        />
        <circle cx="120" cy="16" r="3.5" fill="#c8a165" />
        <circle cx="224" cy="120" r="3.5" fill="#0ea5e9" />
        <circle cx="120" cy="224" r="3.5" fill="#10b981" />
        <circle cx="16" cy="120" r="3.5" fill="#c8a165" />
      </svg>

      <svg
        className="pk-anim-orbit pk-orbit-reverse"
        viewBox="0 0 240 240"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="120"
          cy="120"
          r="84"
          stroke="rgba(200, 161, 101, 0.45)"
          strokeWidth="1.5"
          strokeDasharray="28 14 6 14"
        />
        <path
          d="M 48 165 Q 120 40 192 165"
          stroke="rgba(16, 185, 129, 0.35)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      </svg>

      {/* Cœur flottant avec le logo Pancake Stats + décor pancake doré */}
      <div
        className="pk-anim-core"
        style={{
          width: size,
          height: size,
        }}
      >
        <img
          src="/pancake-logo.jpg"
          alt="Pancake Stats"
          className="pk-anim-img"
          style={{ transform: 'scale(1.36)', filter: 'contrast(1.1) brightness(1.06)' }}
        />
        <div className="pk-anim-shine" />
      </div>

      {/* Badges télémétrie flottants autour du pancake */}
      {showTelemetry && (
        <>
          <span className="pk-float-chip pk-chip-tl">
            <b>#</b> ACE · 100%
          </span>
          <span className="pk-float-chip pk-chip-tr">
            <b>SO</b> SIDE-OUT
          </span>
          <span className="pk-float-chip pk-chip-bl">
            <b>P1→P6</b> ROTATION
          </span>
          <span className="pk-float-chip pk-chip-br">
            <b>EFF%</b> +48.5%
          </span>
        </>
      )}
    </div>
  );
}
