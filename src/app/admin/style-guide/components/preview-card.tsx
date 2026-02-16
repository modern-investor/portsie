export function PreviewCard() {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Preview</h2>
      <p className="text-sm text-gray-500 mb-4">
        This card uses the style guide CSS variables to demonstrate how tokens
        compose together.
      </p>

      <div
        className="max-w-md rounded-lg border p-6 space-y-4"
        style={{
          backgroundColor: "var(--sg-color-background, #ffffff)",
          borderColor: "var(--sg-color-border, #e5e5e5)",
          color: "var(--sg-color-foreground, #171717)",
          borderRadius: "var(--sg-radius-lg, 0.5rem)",
        }}
      >
        <h3
          className="text-xl font-bold"
          style={{ fontFamily: "var(--sg-font-heading)" }}
        >
          Account Overview
        </h3>
        <p
          className="text-sm"
          style={{ color: "var(--sg-color-muted-foreground, #737373)" }}
        >
          Your portfolio is performing well this quarter.
        </p>

        <div className="flex gap-3">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: "var(--sg-color-success, #22c55e)",
              color: "#ffffff",
            }}
          >
            +4.2%
          </span>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: "var(--sg-color-error, #ef4444)",
              color: "#ffffff",
            }}
          >
            -1.1%
          </span>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: "var(--sg-color-warning, #f59e0b)",
              color: "#ffffff",
            }}
          >
            Pending
          </span>
        </div>

        <div
          className="rounded-md p-3 text-sm"
          style={{
            backgroundColor: "var(--sg-color-muted, #f5f5f5)",
            borderRadius: "var(--sg-radius-md, 0.375rem)",
          }}
        >
          <span
            className="font-mono text-xs"
            style={{ fontFamily: "var(--sg-font-mono)" }}
          >
            Total Value: $124,567.89
          </span>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            className="rounded-md px-4 py-2 text-sm font-medium text-white"
            style={{
              backgroundColor: "var(--sg-color-primary, #171717)",
              borderRadius: "var(--sg-radius-md, 0.375rem)",
            }}
          >
            View Details
          </button>
          <button
            className="rounded-md border px-4 py-2 text-sm font-medium"
            style={{
              borderColor: "var(--sg-color-border, #e5e5e5)",
              color: "var(--sg-color-secondary, #6b7280)",
              borderRadius: "var(--sg-radius-md, 0.375rem)",
            }}
          >
            Export
          </button>
        </div>
      </div>
    </section>
  );
}
