"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, StopCircle, Activity } from "lucide-react";
import { useRouter } from "next/navigation";

export default function InterviewClient() {
  const router = useRouter();
  const videoRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const wsRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [liveEmotion, setLiveEmotion] = useState(null);
  const [micError, setMicError] = useState(false);

  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const transcriptRef = useRef("");
  const persistedTranscriptRef = useRef("");
  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    // Web Speech API init
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      recognitionRef.current = new SpeechRec();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true; // Capture speech interim

      recognitionRef.current.onresult = (event) => {
        let currentSessionTranscript = "";
        for (let i = 0; i < event.results.length; ++i) {
          currentSessionTranscript += event.results[i][0].transcript;
        }

        // Merge transcript segments
        const totalText = persistedTranscriptRef.current + " " + currentSessionTranscript;
        transcriptRef.current = totalText.trim();
        setLiveTranscript(totalText.trim());
      };

      recognitionRef.current.onerror = (e) => {
        // Ignore non-critical speech errors
        if (["no-speech", "audio-capture", "aborted"].includes(e.error)) {
          return;
        }

        console.warn("Speech recognition notice:", e.error);

        // Show Mic Error only if initial start fails
        if (!isRecordingRef.current && e.error === "not-allowed") {
          setMicError(true);
        }
      };

      recognitionRef.current.onend = () => {
        // Save current progress on silence pause
        persistedTranscriptRef.current = transcriptRef.current + " ";

        // Auto-restart if recording is still active
        if (isRecordingRef.current) {
          try {
            recognitionRef.current.start();
          } catch (err) {
            // Probably already started or busy, ignore
          }
        }
      };
    }
  }, []);

  useEffect(() => {
    // Scan for cameras
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); // Ask permission first to read labels
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = allDevices.filter(d => d.kind === 'videoinput');
        setDevices(videoInputs);
        if (videoInputs.length > 0) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      } catch (err) {
        console.error("Permission denied for camera", err);
      }
    };
    getDevices();
  }, []);

  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          width: { ideal: 3840 },
          height: { ideal: 2160 }
        },
        audio: true
      };
      if (selectedDeviceId) {
        constraints.video.deviceId = { exact: selectedDeviceId };
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // MediaRecorder config with browser support check
      const types = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4', 'video/ogg'];
      const supportedType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
      
      if (!supportedType) {
        console.error("No supported MediaRecorder format found in this browser.");
        return;
      }

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: supportedType });
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.onstop = handleStopRecording;

    } catch (e) {
      console.error("Camera access denied", e);
    }
  };

  const toggleRecording = () => {
    if (!isRecording) {

      transcriptRef.current = ""; // Reset transcript
      persistedTranscriptRef.current = "";
      setLiveTranscript("");
      setLiveEmotion(null);
      setMicError(false);
      isRecordingRef.current = true;

      const startActions = () => {
        chunksRef.current = [];
        mediaRecorderRef.current.start();
        setIsRecording(true);
        try { recognitionRef.current?.start(); } catch (e) { }

        // Real-time analysis socket
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
        const wsUrl = API_BASE.replace(/^http/, "ws");
        const ws = new WebSocket(`${wsUrl}/api/stream`);
        wsRef.current = ws;

        ws.onopen = () => {
          const captureFrame = () => {
            if (!isRecordingRef.current || ws.readyState !== WebSocket.OPEN) return;

            if (captureCanvasRef.current && videoRef.current) {
              const ctx = captureCanvasRef.current.getContext('2d');
              captureCanvasRef.current.width = 320;
              captureCanvasRef.current.height = 240;
              ctx.drawImage(videoRef.current, 0, 0, 320, 240);
              const dataUrl = captureCanvasRef.current.toDataURL('image/jpeg', 0.5);
              ws.send(dataUrl);
            }
            setTimeout(captureFrame, 250); // ~4 FPS
          };
          captureFrame();
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.status === "success") {
              setLiveEmotion({ dominant: data.dominant, scores: data.scores });
            } else {
              setLiveEmotion(null);
            }
          } catch (e) { }
        };
      };

      if (!videoRef.current?.srcObject) {
        startCamera().then(startActions);
      } else {
        startActions();
      }
    } else {
      isRecordingRef.current = false; // Disable auto-restart loop
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      try { recognitionRef.current?.stop(); } catch (e) { }

      if (wsRef.current) {
        wsRef.current.close();
      }

      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    }
  };

  const handleStopRecording = async () => {
    setIsProcessing(true);
    const blob = new Blob(chunksRef.current, { type: 'video/webm' });

    const visualData = JSON.stringify({});

    const formData = new FormData();
    const promptText = "Describe a personal achievement and how you overcame obstacles to reach it.";
    const expectedAnsText = `One of my most meaningful achievements was successfully leading a project during a time when our team was facing tight deadlines and unexpected technical challenges. Initially, we encountered issues with system integration, which caused delays and affected team morale. Instead of reacting impulsively, I took a step back to analyze the problem and understand each team member’s perspective. I organized short daily check-ins to improve communication and ensured that everyone clearly understood their responsibilities. I also broke down the larger problem into smaller, manageable tasks, which made it easier to track progress and identify bottlenecks early. During this process, I made sure to remain approachable and encouraged open discussion, so team members felt comfortable sharing concerns or suggestions. Despite the pressure, I maintained a solution-oriented mindset and adapted our approach whenever necessary. Gradually, the team regained confidence, and we were able to resolve the technical issues and complete the project successfully within the revised timeline. This experience taught me the importance of clear communication, teamwork, and staying calm under pressure. It also strengthened my ability to handle challenges systematically and lead with empathy and accountability.`;

    formData.append("audio", blob, "interview.webm");
    formData.append("visualData", visualData);
    formData.append("transcript", transcriptRef.current);
    formData.append("prompt", promptText);
    formData.append("expected_answer", expectedAnsText);

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(`Backend error: ${res.statusText}`);
      
      const data = await res.json();

      // Generate session ID
      const sessionId = `ASSESS-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

      // Cache and redirect
      localStorage.setItem("latestInterviewResult", JSON.stringify(data.data));
      router.push(`/dashboard/result/${sessionId}`);

    } catch (e) {
      console.error(e);
      alert("Failed to connect to Python backend.");
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "2rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div className="bg-glow"></div>

      <div className="glass-panel animate-fade" style={{ width: "100%", maxWidth: "900px" }}>
        <h2 className="text-gradient" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Activity /> Live Practice Session
        </h2>

        <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
          Please answer the following prompt clearly, looking into the camera.
          <br /><strong style={{ color: "#fff" }}>Prompt:</strong> "Describe a personal achievement and how you overcame obstacles to reach it."
        </p>

        <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", maxWidth: "1000px", margin: "0 auto", backgroundColor: "#000", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--panel-border)", marginBottom: "2rem" }}>
          {(!videoRef.current || !videoRef.current.srcObject) && !isProcessing && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10, color: "var(--text-muted)", padding: "2rem" }}>
              <p style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Click Start to map camera constraints.</p>
              {devices.length > 0 && (
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", padding: "0.5rem 1rem", borderRadius: "8px", cursor: "pointer", maxWidth: "300px", fontSize: "0.95rem" }}
                >
                  {devices.map(d => <option key={d.deviceId} value={d.deviceId} style={{ color: "#000" }}>{d.label || `Camera ${d.deviceId.substring(0, 5)}`}</option>)}
                </select>
              )}
            </div>
          )}

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
          <canvas ref={captureCanvasRef} style={{ display: "none" }} />

          {micError && isRecording && (
            <div style={{ position: "absolute", top: "20px", left: "20px", right: "20px", background: "rgba(255, 0, 0, 0.8)", padding: "1rem", borderRadius: "8px", color: "#fff", zIndex: 16, textAlign: "center" }}>
              <strong>Microphone Error:</strong> Live transcription stopped. Ensure your browser gave mic permissions.
              <br />(Fallback audio transcription is possible after submit, but requires <code>ffmpeg</code> on the backend.)
            </div>
          )}

          {isRecording && liveEmotion && (
            <div style={{ position: "absolute", top: "20px", right: "20px", background: "rgba(0,0,0,0.6)", padding: "1rem", borderRadius: "8px", color: "#fff", zIndex: 15, backdropFilter: "blur(4px)", border: "1px solid var(--primary)", minWidth: "150px" }}>
              <h3 style={{ margin: "0 0 10px 0", color: "var(--primary)", textTransform: "capitalize", fontSize: "1.2rem" }}>
                {liveEmotion.dominant}
              </h3>
              {Object.entries(liveEmotion.scores).map(([emotion, score]) => (
                <div key={emotion} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px", color: emotion === liveEmotion.dominant ? "#fff" : "var(--text-muted)" }}>
                  <span style={{ textTransform: "capitalize" }}>{emotion}</span>
                  <span>{Math.round(score * 100)}%</span>
                </div>
              ))}
            </div>
          )}

          {isRecording && liveTranscript && (
            <div style={{ position: "absolute", bottom: "20px", left: "5%", right: "5%", background: "rgba(0,0,0,0.6)", padding: "1rem", borderRadius: "8px", color: "#fff", textAlign: "center", zIndex: 15, backdropFilter: "blur(4px)" }}>
              <p style={{ margin: 0, fontSize: "1.1rem" }}>"{liveTranscript}"</p>
            </div>
          )}

          {isProcessing && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 20 }}>
              <Activity size={48} color="var(--primary)" style={{ animation: "pulse 1.5s infinite" }} />
              <p style={{ marginTop: "1rem", color: "#fff", fontSize: "1.2rem" }}>Analyzing Multimodal Data...</p>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
          <button
            className="btn"
            onClick={toggleRecording}
            disabled={isProcessing}
            style={{ backgroundColor: isRecording ? "var(--error)" : "var(--primary)" }}
          >
            {isRecording ? <><StopCircle size={20} /> Stop & Submit</> : <><Camera size={20} /> Start Recording</>}
          </button>
        </div>
      </div>
    </div>
  );
}
