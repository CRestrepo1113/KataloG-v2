'use client';

import { useEffect } from 'react';

export default function HomePage() {
  useEffect(() => {
    // Preservar parámetros de seguimiento de Instagram o redes sociales (?igshid=..., ?fbclid=...)
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    window.location.replace(`/v/costarica/${search}${hash}`);
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
      <head>
        <meta httpEquiv="refresh" content="0; url=/v/costarica/" />
      </head>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-10 h-10 border-3 border-[#3C5866] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold text-slate-500">Ingresando al catálogo...</p>
      </div>
    </div>
  );
}
