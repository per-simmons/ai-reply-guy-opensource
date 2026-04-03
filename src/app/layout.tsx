import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Reply Guy",
  description: "Personal Twitter engagement dashboard with AI-assisted replies",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body
        className="min-h-full flex flex-col bg-background text-foreground"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}
      >
        {children}
      </body>
    </html>
  );
}
