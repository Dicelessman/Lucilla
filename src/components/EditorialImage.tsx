import React, { useState } from 'react';
import { Leaf } from 'lucide-react';

interface EditorialImageProps {
  src: string;
  alt: string;
  className?: string;
  caption?: string;
}

export function EditorialImage({ src, alt, className = '', caption }: EditorialImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#EDF3F0] via-[#E1EBE5] to-[#D4E2DA] dark:from-[#1B2B25] dark:via-[#16231E] dark:to-[#111916] ${className}`}
      >
        <div className="flex flex-col items-center gap-2 px-4 text-center">
          <Leaf className="h-6 w-6 text-[#1F6E5C] dark:text-[#36A68C]" />
          <span className="font-editorial text-xs font-medium text-[#182420] dark:text-[#EAECE6]">
            {caption || alt}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-[#ECEEE8] dark:bg-[#161D1A] ${className}`}>
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
      {caption && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#182420]/75 via-[#182420]/20 to-transparent"
          />
          <p className="pointer-events-none absolute bottom-3 left-3.5 right-3.5 font-editorial text-xs font-medium leading-snug text-white">
            {caption}
          </p>
        </>
      )}
    </div>
  );
}
