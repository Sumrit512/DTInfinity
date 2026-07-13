"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useState } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "https://dummy-convex-url.convex.cloud";
const convexClient = new ConvexReactClient(convexUrl);

export default function ConvexClientProvider({ children }) {
  const [client] = useState(() => convexClient);
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
