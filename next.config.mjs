/** @type {import('next').NextConfig} */
// output: 'export' — sito statico, come instant-rating: nessun server, si deploya
// su Firebase Hosting. Tutta la logica (auth, chat, chiamate al modello) è lato client.
// devIndicators: in dev, Next's round "N" badge sits over the chat's own buttons (in 7Hub's 400px panel it
// covered "Torna alla chat"). Errors still open the dev overlay; production never had it.
const nextConfig = { output: 'export', devIndicators: false };
export default nextConfig;
