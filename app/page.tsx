import AuditorScreen from "./components/auditor-screen";
import { AUDITOR_BACKEND_URL } from "./lib/deployment-config";

const backendUrl = AUDITOR_BACKEND_URL;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-8 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Energy Auditor
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          NEXYRA auditing frontend — upload and datasets
        </p>
      </header>
      <main className="flex flex-1 flex-col">
        <AuditorScreen backendUrl={backendUrl} />
      </main>
    </div>
  );
}
