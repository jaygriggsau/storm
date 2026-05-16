import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Storm the Tower",
  description: "A deck-building climb."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-storm-bg text-slate-100 font-body antialiased">
        {children}
      </body>
    </html>
  );
}
