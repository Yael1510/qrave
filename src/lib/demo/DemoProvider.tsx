'use client';

import { ensureDemoSeed, type DemoDB } from './store';

/** Loads the sample data into this browser before the page's own components run. */
export default function DemoProvider({ seed, children }: { seed: DemoDB; children: React.ReactNode }) {
  ensureDemoSeed(seed); // runs during render, so it's in place before any child effect queries it
  return <>{children}</>;
}
