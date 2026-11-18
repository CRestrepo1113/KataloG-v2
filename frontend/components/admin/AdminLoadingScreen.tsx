'use client';

import React from 'react';
import Image from 'next/image';

interface AdminLoadingScreenProps {
  logoUrl?: string;
  nameLogoUrl?: string;
  companyName?: string;
}

export const AdminLoadingScreen: React.FC<AdminLoadingScreenProps> = ({
  logoUrl = '/assets/Logo.png',
  nameLogoUrl = '/assets/Nombre.png',
  companyName = 'KYG DISTRIBUCIONES',
}) => {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-300">
      <div className="flex flex-col items-center max-w-xs text-center space-y-4">
        {/* Logo Empresa */}
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 drop-shadow-md animate-pulse">
          <Image
            src={logoUrl}
            alt={companyName}
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* Nombre de la Empresa */}
        <div className="relative w-44 h-10 sm:w-52 sm:h-12">
          <Image
            src={nameLogoUrl}
            alt={companyName}
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* Texto de Carga */}
        <div className="pt-2 flex flex-col items-center gap-2.5">
          <div className="w-6 h-6 border-3 border-[#3C5866]/20 border-t-[#C37D41] rounded-full animate-spin" />
          <p className="text-xs sm:text-sm font-extrabold text-[#3C5866] tracking-tight">
            Cargando Base de Datos
          </p>
        </div>
      </div>
    </div>
  );
};
