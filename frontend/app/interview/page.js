"use client";

import dynamic from "next/dynamic";
import { Activity } from "lucide-react";

// Dynamically import the Video ML Component with SSR disabled to prevent Node backend resolution errors.
const InterviewClient = dynamic(() => import("./InterviewClient"), { 
  ssr: false, 
  loading: () => (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
       <Activity className="animate-pulse" size={48} style={{ marginBottom: "1rem", color: "var(--primary)" }} /> 
       Initializing ML Framework...
    </div>
  )
});

export default function InterviewPage() {
  return <InterviewClient />;
}
