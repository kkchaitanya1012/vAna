import { Suspense } from "react";
import { LiveSession } from "@/components/live-session";
import { PageSkeleton } from "@/components/skeleton";

async function Live({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveSession sessionId={id} />;
}

export default function LivePage(props: PageProps<"/live/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Live params={props.params} />
    </Suspense>
  );
}
