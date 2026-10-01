/** Root layout. Deliberately bare: the app is built to be embedded in 7hub, so no header or navigation. */
import { Plus_Jakarta_Sans } from 'next/font/google';
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
    <html lang="it" className={`${jakarta.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
