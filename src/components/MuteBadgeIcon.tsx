import React, { useState } from 'react';
import { VolumeX } from 'lucide-react';
import { MUTE_ICON_DATA_URL } from '../assets/muteIcon';

interface MuteBadgeIconProps {
  className?: string;
  isLight?: boolean;
}

export const MuteBadgeIcon: React.FC<MuteBadgeIconProps> = ({
  className = 'w-3.5 h-3.5',
  isLight = false,
}) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <VolumeX
        className={`${className} ${isLight ? 'text-slate-600' : 'text-slate-400'}`}
        aria-label="Muted"
      />
    );
  }

  return (
    <img
      src={MUTE_ICON_DATA_URL}
      alt="Muted"
      className={`${className} object-contain inline-block align-middle`}
      onError={() => setHasError(true)}
      loading="eager"
      decoding="sync"
    />
  );
};
