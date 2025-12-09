// app/page.jsx
"use client";

import { useState, useEffect, useRef } from "react";

// --- Sub-components for UI ---

// 1. Toast Notification Component
const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg transform transition-all duration-300 animate-in slide-in-from-right
            ${
              toast.type === "error"
                ? "bg-red-500 text-white"
                : toast.type === "success"
                ? "bg-green-500 text-white"
                : "bg-gray-800 text-white"
            }
          `}
        >
          {toast.type === "success" && (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
          {toast.type === "error" && (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          )}
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="ml-2 opacity-70 hover:opacity-100"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
};

// 2. Avatar Component
const UserAvatar = ({ name, size = "large" }) => {
  const getInitials = (n) => (n ? n.substring(0, 2).toUpperCase() : "??");

  // ใช้ useMemo หรือ algorithm ที่ให้ค่าเดิมเสมอเพื่อป้องกัน Hydration Error
  const stringToColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return "#" + "00000".substring(0, 6 - c.length) + c;
  };

  const bgColor = stringToColor(name || "User");
  const sizeClass =
    size === "large" ? "w-32 h-32 text-4xl" : "w-12 h-12 text-lg";

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-bold text-white shadow-lg border-4 border-white/30 transition-transform`}
      style={{ backgroundColor: bgColor }}
    >
      {getInitials(name)}
    </div>
  );
};

// --- Main Component ---

export default function VoiceChat() {
  const [nickname, setNickname] = useState("");
  const [isStarted, setIsStarted] = useState(false);
  const [status, setStatus] = useState("Enter your nickname to start");
  const [partnerName, setPartnerName] = useState("");
  const [isMatched, setIsMatched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [liked, setLiked] = useState(false);

  const [toasts, setToasts] = useState([]);

  // Refs
  const wsRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const partnerIdRef = useRef(null);

  // Constants for animation (Defined here to avoid Hydration mismatch)
  const WAVE_DELAYS = [0.1, 0.3, 0.5, 0.2, 0.4, 0.6, 0.3, 0.5];

  const iceServers = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  // Toast Helpers
  const addToast = (message, type = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      cleanupResources();
    };
  }, []);

  const cleanupResources = () => {
    if (wsRef.current) wsRef.current.close();
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  const findPartner = async () => {
    if (!nickname.trim()) {
      addToast("Please enter a nickname first!", "error");
      return;
    }

    setIsStarted(true);
    setIsSearching(true);
    setStatus("Looking for a partner...");

    // *** ตรวจสอบ URL WebSocket ให้ตรงกับ Server ของคุณ ***
    // ถ้า run local ปกติจะเป็น ws://localhost:3000 (ถ้ามี Custom Server)
    // หรือต้องมี backend แยกต่างหาก
    try {
      wsRef.current = new WebSocket("ws://localhost:3000/match");
    } catch (e) {
      console.error(e);
      addToast("Cannot connect to server", "error");
      setIsStarted(false);
      return;
    }

    wsRef.current.onopen = () => {
      wsRef.current.send(
        JSON.stringify({
          type: "find_partner",
          nickname: nickname,
        })
      );
    };

    wsRef.current.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "waiting") {
          setStatus(data.message);
        } else if (data.type === "matched") {
          setIsSearching(false);
          partnerIdRef.current = data.partnerId;
          setPartnerName(data.partnerNickname);
          setStatus("Connected");
          setIsMatched(true);
          setLiked(false);
          addToast(`Matched with ${data.partnerNickname}!`, "success");
          await startCall();
        } else if (data.type === "offer") {
          await handleOffer(data.offer);
        } else if (data.type === "answer") {
          await handleAnswer(data.answer);
        } else if (data.type === "ice") {
          await handleIceCandidate(data.candidate);
        } else if (data.type === "partner_disconnected") {
          setStatus("Partner disconnected.");
          setIsMatched(false);
          setIsSearching(true);
          cleanupCall();
          addToast("Partner disconnected. Searching...", "info");
        }
      } catch (err) {
        console.error("Message parsing error:", err);
      }
    };

    wsRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      setStatus("Connection error.");
      addToast("Connection failed. Is the server running?", "error");
      setIsStarted(false);
    };
  };

  const startCall = async () => {
    try {
      if (!navigator.mediaDevices) {
        throw new Error("Media devices not supported");
      }

      localStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      peerConnectionRef.current = new RTCPeerConnection(iceServers);

      localStreamRef.current.getTracks().forEach((track) => {
        peerConnectionRef.current.addTrack(track, localStreamRef.current);
      });

      peerConnectionRef.current.ontrack = (event) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          // Ensure play is called
          remoteAudioRef.current
            .play()
            .catch((e) => console.error("Auto-play blocked:", e));
        }
      };

      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "ice",
              candidate: event.candidate,
              partnerId: partnerIdRef.current,
            })
          );
        }
      };

      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "offer",
            offer: offer,
            partnerId: partnerIdRef.current,
          })
        );
      }
    } catch (error) {
      console.error("Error starting call:", error);
      addToast("Microphone access denied or error.", "error");
    }
  };

  const handleOffer = async (offer) => {
    try {
      if (!localStreamRef.current) {
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
      }

      peerConnectionRef.current = new RTCPeerConnection(iceServers);

      localStreamRef.current.getTracks().forEach((track) => {
        peerConnectionRef.current.addTrack(track, localStreamRef.current);
      });

      peerConnectionRef.current.ontrack = (event) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current
            .play()
            .catch((e) => console.error("Auto-play blocked:", e));
        }
      };

      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "ice",
              candidate: event.candidate,
              partnerId: partnerIdRef.current,
            })
          );
        }
      };

      await peerConnectionRef.current.setRemoteDescription(offer);
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);

      wsRef.current.send(
        JSON.stringify({
          type: "answer",
          answer: answer,
          partnerId: partnerIdRef.current,
        })
      );
    } catch (error) {
      console.error(error);
    }
  };

  const handleAnswer = async (answer) => {
    try {
      await peerConnectionRef.current.setRemoteDescription(answer);
    } catch (error) {
      console.error(error);
    }
  };

  const handleIceCandidate = async (candidate) => {
    try {
      await peerConnectionRef.current.addIceCandidate(candidate);
    } catch (error) {
      console.error(error);
    }
  };

  const cleanupCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  };

  const nextPartner = () => {
    cleanupCall();
    setIsMatched(false);
    setIsSearching(true);
    setPartnerName("");
    setStatus("Looking for a new partner...");
    addToast("Skipping... Finding new partner", "info");

    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "next", nickname: nickname }));
    }
  };

  const toggleLike = () => {
    setLiked(!liked);
    if (!liked) {
      addToast(`You liked ${partnerName}!`, "success");
    }
  };

  const endCall = () => {
    cleanupCall();
    if (wsRef.current) wsRef.current.close();
    setIsStarted(false);
    setIsMatched(false);
    setIsSearching(false);
    setPartnerName("");
    setStatus("Enter your nickname to start");
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans selection:bg-purple-500 selection:text-white overflow-hidden relative">
      {/* Inject Keyframes Styles locally to avoid config issues */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes wave {
          0% { height: 30%; opacity: 0.5; }
          100% { height: 100%; opacity: 1; }
        }
      `,
        }}
      />

      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[100px]" />
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        {/* Header Logo */}
        <div
          className={`transition-all duration-500 ${
            isStarted ? "mb-4 scale-75" : "mb-10"
          }`}
        >
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-gradient-to-tr from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30 mb-4 transform rotate-3">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              RandomVoice
            </h1>
          </div>
        </div>

        {/* --- SCENE 1: LOGIN --- */}
        {!isStarted && (
          <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            <p className="text-gray-400 text-center mb-6">
              Enter a nickname to start talking with strangers anonymously.
            </p>

            <div className="space-y-4">
              <input
                type="text"
                className="w-full bg-black/20 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                placeholder="Your cool nickname..."
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && findPartner()}
                maxLength={20}
              />
              <button
                onClick={findPartner}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl font-bold text-white shadow-lg shadow-purple-600/30 hover:shadow-purple-600/50 transform hover:scale-[1.02] active:scale-95 transition-all duration-200"
              >
                Start Matching
              </button>
            </div>
          </div>
        )}

        {/* --- SCENE 2: SEARCHING --- */}
        {isStarted && isSearching && (
          <div className="flex flex-col items-center animate-pulse">
            <div className="relative mb-8">
              <div className="w-32 h-32 bg-purple-500/20 rounded-full absolute inset-0 animate-ping"></div>
              <UserAvatar name={nickname} />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">
              Searching...
            </h2>
            <button
              onClick={endCall}
              className="mt-8 text-gray-500 hover:text-red-400 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* --- SCENE 3: MATCHED --- */}
        {isStarted && isMatched && (
          <div className="w-full max-w-sm relative">
            <audio ref={remoteAudioRef} autoPlay playsInline />

            <div className="bg-gray-800/80 backdrop-blur-md border border-white/10 rounded-[2.5rem] p-6 shadow-2xl overflow-hidden relative">
              <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-bold text-green-400 uppercase tracking-wider">
                  Live
                </span>
              </div>

              <div className="flex flex-col items-center mt-8 mb-6">
                <UserAvatar name={partnerName} size="large" />

                <div className="mt-6 text-center">
                  <h2 className="text-3xl font-bold text-white mb-1">
                    {partnerName}
                  </h2>
                  <p className="text-gray-400 text-sm">Online Stranger</p>
                </div>

                {/* Audio Visualizer (Fixed Hydration Error) */}
                <div className="flex items-center gap-1 h-8 mt-6">
                  {WAVE_DELAYS.map((delay, i) => (
                    <div
                      key={i}
                      className="w-1 bg-gradient-to-t from-purple-500 to-pink-500 rounded-full"
                      style={{
                        height: "100%",
                        animation: `wave 1s ease-in-out infinite alternate`,
                        animationDelay: `${delay}s`,
                      }}
                    ></div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-8">
                {/* End Button */}
                <button
                  onClick={endCall}
                  className="flex flex-col items-center justify-center gap-1 group"
                >
                  <div className="w-14 h-14 bg-gray-700/50 rounded-full flex items-center justify-center group-hover:bg-red-500/20 group-hover:text-red-500 transition-all border border-transparent group-hover:border-red-500/50">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </div>
                  <span className="text-xs text-gray-500 font-medium">End</span>
                </button>

                {/* Like Button */}
                <button
                  onClick={toggleLike}
                  className="flex flex-col items-center justify-center gap-1 group"
                >
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all transform hover:scale-110 shadow-lg ${
                      liked
                        ? "bg-pink-500 text-white shadow-pink-500/40"
                        : "bg-white text-pink-500"
                    }`}
                  >
                    <svg
                      className={`w-8 h-8 ${
                        liked ? "fill-current" : "fill-none"
                      }`}
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                      />
                    </svg>
                  </div>
                  <span className="text-xs text-gray-500 font-medium">
                    Like
                  </span>
                </button>

                {/* Next Button */}
                <button
                  onClick={nextPartner}
                  className="flex flex-col items-center justify-center gap-1 group"
                >
                  <div className="w-14 h-14 bg-gray-700/50 rounded-full flex items-center justify-center group-hover:bg-purple-500/20 group-hover:text-purple-400 transition-all border border-transparent group-hover:border-purple-500/50">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 5l7 7-7 7M5 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                  <span className="text-xs text-gray-500 font-medium">
                    Next
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
