/** @type {import('next').NextConfig} */
// output: 'export' — sito statico, come instant-rating: nessun server, si deploya
// su Firebase Hosting. Tutta la logica (auth, chat, chiamate al modello) è lato client.
const nextConfig = { output: 'export' };
export default nextConfig;
