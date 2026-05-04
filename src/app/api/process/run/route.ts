import { NextResponse } from "next/server";

import { drainProcessingQueue } from "@/lib/processing/pipeline";

export async function POST() {
  try {
    const result = await drainProcessingQueue({ maxJobs: 25 });
    return NextResponse.json(result);
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : "Processor error", { status: 500 });
  }
}

export async function GET() {
  return POST();
}
