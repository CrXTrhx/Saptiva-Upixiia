import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
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
  title: "DigitalFoldr - Gestion de Expedientes",
  description: "Sistema de gestion documental DigitalFoldr",
  icons: {
    icon: [
      { url: "/digitalfoldr-icon.svg", type: "image/svg+xml" },
      { url: "/digitalfoldr-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/digitalfoldr-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/digitalfoldr-apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      data-theme="light"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ colorScheme: "light" }}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
