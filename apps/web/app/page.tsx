import { Suspense } from "react";
import { NewSessionForm } from "@/components/new-session-form";
import { Block } from "@/components/skeleton";
import { getPersonas, getProviders } from "@/lib/api";

async function Form() {
  const loaded = await Promise.all([getProviders(), getPersonas()]).then(
    ([providers, personas]) => ({ providers, personas, error: null as string | null }),
    (e: unknown) => ({ providers: null, personas: null, error: e instanceof Error ? e.message : "Could not load the options." }),
  );
  if (!loaded.providers || !loaded.personas) {
    return (
      <div role="alert" className="panel max-w-md rounded-panel p-6 text-bad">
        {loaded.error} Are the API (port 8000) and voice server (port 8100) running?
      </div>
    );
  }
  return <NewSessionForm providers={loaded.providers} personas={loaded.personas} />;
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col gap-12 sm:gap-20">
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute -right-6 top-6 hidden lg:block" style={{ ["--orb-size" as string]: "min(24vw, 340px)" }}>
          <div className="orb float" data-state="bot"><div className="orb-bloom" /><div className="orb-ring" /><div className="orb-lens"><div className="orb-iris" /></div></div>
        </div>
        <h1 className="display display-xl text-balance text-[56px] leading-[0.92] sm:text-[96px] lg:text-[112px] xl:text-[128px]">
          <span className="rise block" style={{ ["--i" as string]: 0 }}>Talk to it.</span>
          <span className="rise block text-muted" style={{ ["--i" as string]: 1 }}>See where the</span>
          <span className="rise block text-muted" style={{ ["--i" as string]: 2 }}>time goes.</span>
        </h1>
        <p className="rise mt-8 max-w-xl text-[17px] leading-relaxed text-muted sm:text-[19px]" style={{ ["--i" as string]: 4 }}>
          Choose how the agent hears, thinks and speaks. Have a short call. Get a plain verdict on how fast it felt, which step was slowest, and what it cost.
        </p>
      </div>
      <div className="rise" style={{ ["--i" as string]: 5 }}>
        <Suspense fallback={<Block className="h-[26rem] w-full" />}>
          <Form />
        </Suspense>
      </div>
    </div>
  );
}
