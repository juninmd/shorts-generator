import { Layout } from "./components/Layout";
import { VideoInput } from "./components/VideoInput";
import { ProcessingStatus } from "./components/ProcessingStatus";
import { ShortsList } from "./components/ShortsList";
import { useShorts } from "./hooks/useShorts";

export default function App() {
  const { shorts, currentJob, isLoading, error, generate } = useShorts();

  return (
    <Layout>
      <div className="space-y-6">
        {/* Input form */}
        <VideoInput onSubmit={generate} isLoading={isLoading} />

        {/* Error display */}
        {error && (
          <div className="card border-red-900 bg-red-950/30">
            <p className="text-sm text-red-400">❌ {error}</p>
          </div>
        )}

        {/* Processing status */}
        {currentJob && <ProcessingStatus job={currentJob} />}

        {/* Generated shorts list */}
        <ShortsList shorts={shorts} />
      </div>
    </Layout>
  );
}
