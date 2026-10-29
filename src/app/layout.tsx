import type { ReactNode } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
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
  title: "Devoluciones",
  description:
    "Trazabilidad de devoluciones, evidencias y reportes de carga con control de acceso por rol.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // Todo se renderiza por solicitud: así cada respuesta lleva el nonce de su CSP
  // (también la página 404, que de otro modo sería estática y sin nonce).
  await connection();

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
