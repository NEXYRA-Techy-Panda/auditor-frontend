import AuditorScreen from "./components/auditor-screen";
import { AUDITOR_BACKEND_URL } from "./lib/deployment-config";

const backendUrl = AUDITOR_BACKEND_URL;

export default function Home() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-slate-50 font-sans text-slate-900 transition-colors dark:bg-[#090d16] dark:text-slate-100">
      <AuditorScreen backendUrl={backendUrl} />
    </div>
  );
}
