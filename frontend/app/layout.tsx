import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://katalog-lime.vercel.app'),
  title: {
    default: "KataloG",
    template: "%s | KataloG",
  },
  description: "Catálogo interactivo de productos - KataloG",
  applicationName: "KataloG",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KataloG",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "KataloG",
    description: "Catálogo interactivo de productos - KataloG",
    siteName: "KataloG",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "KataloG Logo",
      },
    ],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.ort=window.ort||{};window.ort.env=window.ort.env||{};window.ort.env.wasm=window.ort.env.wasm||{};window.ort.env.wasm.numThreads=1;window.ort.env.logLevel='error';`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
