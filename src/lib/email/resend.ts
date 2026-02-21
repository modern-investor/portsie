type ResendClient = InstanceType<(typeof import("resend"))["Resend"]>;

let resendClient: ResendClient | null = null;

export async function getResendClient(): Promise<ResendClient> {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    const { Resend } = await import("resend");
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}
