/** Root layout. Deliberately bare: the app is built to be embedded in 7hub, so no header or navigation. */
import { Plus_Jakarta_Sans } from 'next/font/google';
import AppearanceBoot from '@/shared/appearance/AppearanceBoot';
import { EARLY_THEME_SCRIPT } from '@/shared/appearance/earlyScript';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700']
});

export const metadata = {
  title: 'Assistente 7hub',
  description: 'Assistente conversazionale incorporabile nella dashboard 7hub.'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: the inline script sets data-theme (and color-scheme) on <html> before React runs
    <html lang="it" className={`${jakarta.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: EARLY_THEME_SCRIPT }} />
      </head>
      <body className="h-full">
        <AppearanceBoot />
        {children}
      </body>
    </html>
  );
}
