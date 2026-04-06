"use client";

import { useEffect, useState, use } from "react";
import { Activity, UserCheck, MessageSquare, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function SelfAssessmentDashboard({ params: paramsPromise }) {
  const params = use(paramsPromise);
  const [data, setData] = useState(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("latestInterviewResult");
      if (stored) {
        setData(JSON.parse(stored));
      } else {
        // Fallback demo data
        setData({
          verbal: { 
            transcription: "I successfully led a cross-functional team of five to deliver a critical client project ahead of schedule. The biggest challenge was managing conflicting opinions on technical architecture, but I organized a brainstorming session where everyone felt heard. We eventually reached a consensus that combined both approaches, and the client was thrilled with the final result. This experience taught me that active listening is just as important as technical leadership.", 
            sentiment: { pos: 0.85, neu: 0.1, neg: 0.05, compound: 0.92 },
            relevance: 0.94
          },
          nonverbal: { happy: 0.8, neutral: 0.2, sad: 0.0 },
          overall_performance_score: 92
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  if (!data) return <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}><Activity className="animate-pulse" /></div>;

  return (
    <div style={{ minHeight: "100vh", padding: "2rem" }}>
      <div className="bg-glow"></div>
      
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ marginBottom: "2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <Link href="/" style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <ArrowLeft size={16} /> Back to Home
            </Link>
            <h1 className="text-gradient">Self-Assessment Report</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", letterSpacing: "1px" }}>SESSION ID: <span style={{ color: "var(--primary)" }}>{params?.id?.toUpperCase()}</span></p>
          </div>
          
          <div className="glass-panel" style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1rem 2rem" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.9rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Overall Performance</div>
              <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--secondary)" }}>{data.overall_performance_score}/100</div>
            </div>
            <UserCheck size={40} color="var(--secondary)" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
          
          {/* Verbal Analysis */}
          <div className="glass-panel animate-fade" style={{ animationDelay: "0.1s" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--primary)" }}>
              <MessageSquare size={20} /> Verbal & NLP
            </h3>
            
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem", fontSize: "0.95rem", lineHeight: "1.5", color: "var(--text-muted)", maxHeight: "150px", overflowY: "auto" }}>
              "{data.verbal.transcription}"
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>Sentiment (Pos)</p>
                <div style={{ height: "8px", background: "var(--panel-border)", borderRadius: "4px" }}>
                  <div style={{ height: "100%", width: `${data.verbal.sentiment.pos * 100}%`, background: "var(--success)", borderRadius: "4px" }}></div>
                </div>
              </div>
              <div>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>Sentiment (Neg)</p>
                <div style={{ height: "8px", background: "var(--panel-border)", borderRadius: "4px" }}>
                  <div style={{ height: "100%", width: `${data.verbal.sentiment.neg * 100}%`, background: "var(--error)", borderRadius: "4px" }}></div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "1.5rem" }}>
              <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.85rem", color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
                <span>Semantic Relevance (Context)</span>
                <span style={{ color: "var(--secondary)" }}>{Math.round((data.verbal.relevance || 0) * 100)}%</span>
              </p>
              <div style={{ height: "8px", background: "var(--panel-border)", borderRadius: "4px" }}>
                <div style={{ height: "100%", width: `${(data.verbal.relevance || 0) * 100}%`, background: "var(--secondary)", borderRadius: "4px" }}></div>
              </div>
            </div>
          </div>

          {/* Nonverbal Analysis */}
          <div className="glass-panel animate-fade" style={{ animationDelay: "0.2s" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px", color: "#f59e0b" }}>
              <Activity size={20} /> Facial Expressions
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem", marginTop: "1.5rem" }}>
               {Object.entries(data.nonverbal || {}).map(([emotion, val]) => (
                 <div key={emotion}>
                   <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.85rem", textTransform: "capitalize", color: "var(--text-muted)" }}>
                     <span>{emotion}</span>
                     <span>{Math.round(val * 100)}%</span>
                   </div>
                   <div style={{ height: "8px", background: "var(--panel-border)", borderRadius: "4px" }}>
                      <div style={{ height: "100%", width: `${val * 100}%`, background: "#f59e0b", borderRadius: "4px" }}></div>
                   </div>
                 </div>
               ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
