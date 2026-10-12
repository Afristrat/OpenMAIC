'use client';

// Static import target of the lazy loader in message.tsx and reasoning.tsx: the package only
// exposes an ESM entry, which a dynamic import of the bare name cannot resolve at build time.
export { Streamdown as default } from 'streamdown';
