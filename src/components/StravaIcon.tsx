import React from 'react';

/**
 * Authentic Strava Logo Mark
 * Circular badge matching the official brand asset with upper white and lower peach chevrons.
 */
export const StravaIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 512 512"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
    aria-hidden="true"
  >
    <circle cx="256" cy="256" r="256" fill="#FC5200" />
    {/* Upper white chevron */}
    <path
      d="M239.5 110.8L147.2 284.4H209.7L239.5 228.3L269.3 284.4H331.8L239.5 110.8Z"
      fill="#FFFFFF"
    />
    {/* Lower salmon/peach chevron */}
    <path
      d="M299.2 284.4L269.4 340.5L239.6 284.4H197.8L269.4 419.2L341 284.4H299.2Z"
      fill="#FFA486"
    />
  </svg>
);
