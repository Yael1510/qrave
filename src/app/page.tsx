import Link from 'next/link';

const features = [
  { emoji: '📱', title: 'Scan & order', body: 'A QR code on every table. No app to download — customers order straight from their phone.' },
  { emoji: '🔔', title: 'Live order screen', body: 'Orders, waiter calls and bill requests pop up instantly for your staff, with a sound.' },
  { emoji: '🖼️', title: 'Your menu, your brand', body: 'Photos, prices in pesos, diet & allergen tags, English and Filipino, your logo and colours.' },
  { emoji: '🧾', title: 'Running tabs', body: 'Tables can keep ordering through their visit. Close the tab when they pay at the counter.' },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20">
      <nav className="flex items-center justify-between py-5">
        <span className="text-xl font-bold">☕ QRave</span>
        <div className="flex gap-2">
          <Link href="/login" className="btn-secondary btn-sm">Log in</Link>
          <Link href="/signup" className="btn btn-sm">Start free</Link>
        </div>
      </nav>

      <section className="py-14 text-center sm:py-24">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          QR table ordering for your cafe
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
          Customers scan the code on their table, browse your menu and order. Your staff see it the moment it’s placed.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="btn">Create your cafe</Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {features.map(f => (
          <div key={f.title} className="card p-6">
            <div className="text-3xl">{f.emoji}</div>
            <h3 className="mt-3 text-lg font-semibold">{f.title}</h3>
            <p className="mt-1 text-muted">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
