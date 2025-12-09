"use client";

import { useState, useEffect, useRef } from "react";
const api = process.env.NEXT_PUBLIC_WS_API;

// --- Sub-components ---

const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg transform transition-all duration-300 animate-in slide-in-from-right ${
            toast.type === "error"
              ? "bg-red-500 text-white"
              : toast.type === "success"
              ? "bg-green-500 text-white"
              : "bg-gray-800 text-white"
          }`}
        >
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      ))}
    </div>
  );
};

const UserAvatar = ({ name, size = "large" }) => {
  const getInitials = (n) => (n ? n.substring(0, 2).toUpperCase() : "??");
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

// --- Config ICE Servers ---
const iceServers = {
  iceServers: [
    // STUN Servers
    { urls: "stun:stun.relay.metered.ca:80" },
    { urls: "stun:stun.l.google.com:19302" },

    // ✅ TURN Servers (Metered)
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "e79fd9d985751a7176e4e1de",
      credential: "nkgrV/MuhOIUh8kC",
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "e79fd9d985751a7176e4e1de",
      credential: "nkgrV/MuhOIUh8kC",
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "e79fd9d985751a7176e4e1de",
      credential: "nkgrV/MuhOIUh8kC",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "e79fd9d985751a7176e4e1de",
      credential: "nkgrV/MuhOIUh8kC",
    },
  ],
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
  const [audioError, setAudioError] = useState(false);

  const [toasts, setToasts] = useState([]);

  // Refs
  const wsRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const partnerIdRef = useRef(null);

  const WAVE_DELAYS = [0.1, 0.3, 0.5, 0.2, 0.4, 0.6, 0.3, 0.5];

  const addToast = (message, type = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      3000
    );
  };

  const removeToast = (id) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  useEffect(() => {
    return () => cleanupResources();
  }, []);

  const cleanupResources = () => {
    if (wsRef.current) wsRef.current.close();
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  const forcePlayAudio = () => {
    if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.volume = 1.0;
      remoteAudioRef.current
        .play()
        .then(() => {
          console.log("✅ Audio resumed manually");
          setAudioError(false);
          addToast("Audio enabled!", "success");
        })
        .catch((e) => {
          console.error("❌ Manual play failed", e);
        });
    }
  };

  // ✅ Setup Peer Connection Logic
  const setupPeerConnection = () => {
    // ป้องกันการสร้างซ้ำ
    if (peerConnectionRef.current) {
      console.warn("⚠️ PC already exists, closing old one.");
      peerConnectionRef.current.close();
    }

    const pc = new RTCPeerConnection(iceServers);

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log("🧊 ICE State:", state);
      if (state === "failed" || state === "disconnected") {
        addToast("Connection unstable/failed", "error");
      }
    };

    pc.ontrack = (event) => {
      console.log("🔊 Received Remote Stream:", event.streams[0]);
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.muted = false;

        // Try playing
        const playPromise = remoteAudioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("🎶 Audio playing successfully");
              setAudioError(false);
            })
            .catch((e) => {
              console.error("❌ Auto-play failed:", e);
              setAudioError(true);
              addToast("Tap the speaker icon to enable sound", "error");
            });
        }
      }
    };

    pc.onicecandidate = (event) => {
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

    return pc;
  };

  const findPartner = async () => {
    if (!nickname.trim()) {
      addToast("Please enter a nickname first!", "error");
      return;
    }

    setIsStarted(true);
    setIsSearching(true);
    setStatus("Looking for a partner...");

    try {
      wsRef.current = new WebSocket(`${api}/match`);
    } catch (e) {
      console.error(e);
      addToast("Cannot connect to server", "error");
      setIsStarted(false);
      return;
    }

    wsRef.current.onopen = () => {
      wsRef.current.send(JSON.stringify({ type: "find_partner", nickname }));
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
          setAudioError(false);
          addToast(`Matched with ${data.partnerNickname}!`, "success");

          // ✅ FIX: เช็ค initiator! ถ้าเป็น true ค่อยโทร, ถ้า false รอนิ่งๆ
          if (data.initiator) {
            console.log("I am initiator, starting call...");
            await startCall();
          } else {
            console.log("I am receiver, waiting for offer...");
          }
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
      addToast("Connection failed", "error");
      setIsStarted(false);
    };
  };

  const startCall = async () => {
    try {
      console.log("🚀 Starting call...");
      if (!navigator.mediaDevices)
        throw new Error("Media devices not supported");

      localStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      peerConnectionRef.current = setupPeerConnection();

      localStreamRef.current.getTracks().forEach((track) => {
        peerConnectionRef.current.addTrack(track, localStreamRef.current);
      });

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
      console.error("❌ Error starting call:", error);
      addToast("Microphone access denied", "error");
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

      // Receiver สร้าง PC เพื่อรับ Offer
      peerConnectionRef.current = setupPeerConnection();

      localStreamRef.current.getTracks().forEach((track) => {
        peerConnectionRef.current.addTrack(track, localStreamRef.current);
      });

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
      // ✅ เช็ค State ก่อน Set Remote
      if (peerConnectionRef.current.signalingState === "stable") {
        console.warn(
          "⚠️ Connection is already stable, ignoring duplicate answer."
        );
        return;
      }
      await peerConnectionRef.current.setRemoteDescription(answer);
    } catch (error) {
      console.error("Handle Answer Error:", error);
    }
  };

  const handleIceCandidate = async (candidate) => {
    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(candidate);
      }
    } catch (error) {
      console.error("ICE Error:", error);
    }
  };

  const nextPartner = () => {
    cleanupCall();
    setIsMatched(false);
    setIsSearching(true);
    setPartnerName("");
    setStatus("Looking for a new partner...");
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "next", nickname }));
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
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  };

  const toggleLike = () => {
    setLiked(!liked);
    if (!liked) addToast(`You liked ${partnerName}!`, "success");
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
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        className="absolute w-1 h-1 opacity-0 pointer-events-none"
      />

      {/* Style Injection */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes wave {
          0% { height: 30%; opacity: 0.5; }
          100% { height: 100%; opacity: 1; }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(1.3); opacity: 0; }
        }
      `,
        }}
      />

      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[100px]" />
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        {/* Header */}
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

        {/* LOGIN */}
        {!isStarted && (
          <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            <p className="text-gray-400 text-center mb-6">
              Enter a nickname to start talking with strangers anonymously.
            </p>
            <div className="space-y-4">
              <input
                type="text"
                className="w-full bg-black/20 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                placeholder="Your cool nickname..."
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && findPartner()}
                maxLength={20}
              />
              <button
                onClick={findPartner}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl font-bold text-white shadow-lg hover:scale-[1.02] transition-all"
              >
                Start Matching
              </button>
            </div>
          </div>
        )}

        {/* SEARCHING */}
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

        {/* MATCHED */}
        {isStarted && isMatched && (
          <div className="w-full max-w-sm relative">
            <div className="bg-gray-800/80 backdrop-blur-md border border-white/10 rounded-[2.5rem] p-6 shadow-2xl overflow-hidden relative">
              <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-bold text-green-400 uppercase tracking-wider">
                  Live
                </span>
              </div>

              {/* Mute Button */}
              {audioError && (
                <button
                  onClick={forcePlayAudio}
                  className="absolute top-6 right-6 flex items-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg z-50 animate-bounce"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                  </svg>
                  <span className="text-xs font-bold">Tap to Unmute</span>
                </button>
              )}

              <div className="flex flex-col items-center mt-8 mb-6">
                <UserAvatar name={partnerName} size="large" />
                <div className="mt-6 text-center">
                  <h2 className="text-3xl font-bold text-white mb-1">
                    {partnerName}
                  </h2>
                  <p className="text-gray-400 text-sm">Online Stranger</p>
                </div>
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
                <button
                  onClick={endCall}
                  className="flex flex-col items-center justify-center gap-1 group"
                >
                  <div className="w-14 h-14 bg-gray-700/50 rounded-full flex items-center justify-center group-hover:bg-red-500/20 group-hover:text-red-500 transition-all">
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
                <button
                  onClick={toggleLike}
                  className="flex flex-col items-center justify-center gap-1 group"
                >
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all transform hover:scale-110 shadow-lg ${
                      liked
                        ? "bg-pink-500 text-white"
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
                <button
                  onClick={nextPartner}
                  className="flex flex-col items-center justify-center gap-1 group"
                >
                  <div className="w-14 h-14 bg-gray-700/50 rounded-full flex items-center justify-center group-hover:bg-purple-500/20 group-hover:text-purple-400 transition-all">
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
