type Params = Promise<{ id: string }>;

export default async function ResultPage({ params }: { params: Params }) {
  const { id } = await params;

  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold">
        Result for <span className="font-mono">{id}</span> — coming soon
      </h1>
    </main>
  );
}
