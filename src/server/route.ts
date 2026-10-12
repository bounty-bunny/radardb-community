import type { NextResponse } from "next/server";
import { control, type ControlPlane } from "./control";
import { guardControl, guardData, handleError } from "./http";

type Handler = (cp: ControlPlane) => Promise<NextResponse> | NextResponse;

/** Control-plane route wrapper: localhost guard + error mapping. */
export async function controlRoute(req: Request, fn: Handler): Promise<NextResponse> {
  const denied = guardControl(req);
  if (denied) return denied;
  try {
    return await fn(await control());
  } catch (e) {
    return handleError(e);
  }
}

/** Data-plane route wrapper: API key (or localhost) guard + error mapping. */
export async function dataRoute(req: Request, fn: Handler): Promise<NextResponse> {
  const denied = guardData(req);
  if (denied) return denied;
  try {
    return await fn(await control());
  } catch (e) {
    return handleError(e);
  }
}
