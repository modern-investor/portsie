import { DataFlowDiagram } from "../dashboard/components/data-flow-diagram";

export default function ArchVisualPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-8">
      <div className="w-full max-w-2xl">
        <DataFlowDiagram />
      </div>
    </div>
  );
}
