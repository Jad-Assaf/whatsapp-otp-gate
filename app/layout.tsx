/*
 * Root layout for the entire Next.js app. This file is required by the
 * Next.js App Router to define the HTML structure for all pages and
 * API routes. Without a root layout, pages such as `/ui/page.tsx`
 * will error at build time. The layout wraps all children in a
 * minimal HTML document with a body element. Adjust the metadata or
 * styling as needed.
 */

import React from 'react';

// Optional metadata. You can customize the title or description here.
export const metadata = {
  title: 'WhatsApp OTP Gate Test App',
  description: 'A simple UI to test WhatsApp OTP verification and checkout gating.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: 'sans-serif' }}>{children}</body>
    </html>
  );
}