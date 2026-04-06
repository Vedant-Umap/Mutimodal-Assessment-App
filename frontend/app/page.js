"use client";

import Link from "next/link";
import { ArrowRight, BrainCircuit, Activity, Video } from "lucide-react";
import "./globals.css";

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <div className="bg-glow"></div>
      <div className="bg-glow-2"></div>
      
      <div className="glass-panel animate-fade" style={{ maxWidth: "800px", textAlign: "center" }}>
          Multimodal <span className="accent-gradient">AI Analysis</span> for Self-Assessment & Coaching
        
          Next-generation personal coaching platform analyzing verbal content, facial expressions, vocal tone, and body language in real-time to provide actionable, data-driven feedback on your communication skills.

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginBottom: "3rem", flexWrap: "wrap" }}>
          <div className="glass-panel" style={{ padding: "1.5rem", flex: "1", minWidth: "200px" }}>
            <Activity color="var(--secondary)" size={32} style={{ marginBottom: "1rem" }} />
            <h3 style={{ fontSize: "1.1rem" }}>In-Browser ML</h3>
            <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", margin: 0 }}>Real-time facial & pose tracking with Zero latency.</p>
          </div>
          <div className="glass-panel" style={{ padding: "1.5rem", flex: "1", minWidth: "200px" }}>
            <Video color="var(--primary)" size={32} style={{ marginBottom: "1rem" }} />
            <h3 style={{ fontSize: "1.1rem" }}>Video Intake</h3>
            <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", margin: 0 }}>Capture audio & video synchronously for the backend.</p>
          </div>
          <div className="glass-panel" style={{ padding: "1.5rem", flex: "1", minWidth: "200px" }}>
            <BrainCircuit color="#f59e0b" size={32} style={{ marginBottom: "1rem" }} />
            <h3 style={{ fontSize: "1.1rem" }}>NLP & Sentiment</h3>
            <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", margin: 0 }}>Speech transcription and text sentiment analysis.</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <Link href="/interview" className="btn">
            Start Practice Session <ArrowRight size={20} />
          </Link>
          <Link href="/dashboard/result/demo-123" className="btn btn-secondary">
            View Example Report
          </Link>
        </div>
      </div>
    </main>
  );
}
