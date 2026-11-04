import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fleetClient } from "@/lib/fleet-client";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await fleetClient.getSystem();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Fleet agent unavailable",
      },
      { status: 502 },
    );
  }
}
