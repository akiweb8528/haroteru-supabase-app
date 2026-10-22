'use client';

import Image from 'next/image';
import iconPng from '@/app/icon.png';

interface Props {
  size?: number;
}

export function BrandLogo({ size = 32 }: Props) {
  return (
    <Image
      src={iconPng}
      alt=""
      width={size}
      height={size}
      className="rounded-lg"
      priority
    />
  );
}
