// app/page.jsx
"use client";

import { useState, useEffect, useRef } from "react";

export default function VoiceChat() {
  const [nickname, setNickname] = useState("");
  const [isStarted, setIsStarted] = useState(false);
  const [status, setStatus] = useState("Enter your nickname to start");
  const [partnerName, setPartnerName] = useState("");
  const [isMatched, setIsMatched] = useState(false);

  const wsRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const partnerIdRef = useRef(null);

  const iceServers = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  // Cleanup เมื่อ component unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const findPartner = async () => {
    if (!nickname.trim()) {
      alert("Please enter a nickname");
      return;
    }

    setIsStarted(true);
    setStatus("Connecting...");

    // เชื่อมต่อ WebSocket
    wsRef.current = new WebSocket("ws://localhost:3000/match");

    wsRef.current.onopen = () => {
      setStatus("Looking for a partner...");
      wsRef.current.send(
        JSON.stringify({
          type: "find_partner",
          nickname: nickname,
        })
      );
    };

    wsRef.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "waiting") {
        setStatus(data.message);
      }

      if (data.type === "matched") {
        partnerIdRef.current = data.partnerId;
        setPartnerName(data.partnerNickname);
        setStatus("Partner found! Connecting...");
        setIsMatched(true);

        await startCall();
      }

      if (data.type === "offer") {
        await handleOffer(data.offer);
      }

      if (data.type === "answer") {
        await handleAnswer(data.answer);
      }

      if (data.type === "ice") {
        await handleIceCandidate(data.candidate);
      }

      if (data.type === "partner_disconnected") {
        setStatus("Partner disconnected. Looking for new partner...");
        setIsMatched(false);
        cleanupCall();
      }
    };

    wsRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      setStatus("Connection error. Please try again.");
    };

    wsRef.current.onclose = () => {
      console.log("WebSocket closed");
    };
  };

  const startCall = async () => {
    try {
      // ขอ microphone permission
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      // สร้าง RTCPeerConnection
      peerConnectionRef.current = new RTCPeerConnection(iceServers);

      // เพิ่ม local audio tracks
      localStreamRef.current.getTracks().forEach((track) => {
        peerConnectionRef.current.addTrack(track, localStreamRef.current);
      });

      // รับ remote audio
      peerConnectionRef.current.ontrack = (event) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          setStatus("Connected! You can talk now.");
        }
      };

      // ICE candidates
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate && wsRef.current) {
          wsRef.current.send(
            JSON.stringify({
              type: "ice",
              candidate: event.candidate,
              partnerId: partnerIdRef.current,
            })
          );
        }
      };

      // สร้าง offer
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);

      wsRef.current.send(
        JSON.stringify({
          type: "offer",
          offer: offer,
          partnerId: partnerIdRef.current,
        })
      );
    } catch (error) {
      console.error("Error starting call:", error);
      setStatus("Could not access microphone. Please allow microphone access.");
    }
  };

  const handleOffer = async (offer) => {
    try {
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
          setStatus("Connected! You can talk now.");
        }
      };

      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate && wsRef.current) {
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
      console.error("Error handling offer:", error);
    }
  };

  const handleAnswer = async (answer) => {
    try {
      await peerConnectionRef.current.setRemoteDescription(answer);
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  };

  const handleIceCandidate = async (candidate) => {
    try {
      await peerConnectionRef.current.addIceCandidate(candidate);
    } catch (error) {
      console.error("Error handling ICE candidate:", error);
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
    setPartnerName("");
    setStatus("Looking for a new partner...");

    if (wsRef.current) {
      wsRef.current.send(
        JSON.stringify({
          type: "next",
          nickname: nickname,
        })
      );
    }
  };

  const endCall = () => {
    cleanupCall();

    if (wsRef.current) {
      wsRef.current.close();
    }

    setIsStarted(false);
    setIsMatched(false);
    setPartnerName("");
    setStatus("Enter your nickname to start");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-700 p-5">
      <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-lg">
        {!isStarted ? (
          // Start Screen
          <div className="text-center">
            <div className="mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full mb-4">
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </div>
              <h1 className="text-4xl font-bold text-gray-800 mb-2">
                Random Voice Chat
              </h1>
              <p className="text-gray-600">
                Connect with random people and talk
              </p>
            </div>

            <input
              type="text"
              className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-xl mb-6 focus:outline-none focus:border-purple-500 transition-colors"
              placeholder="Enter your nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && findPartner()}
              maxLength={20}
            />

            <button
              onClick={findPartner}
              className="w-full py-4 px-6 text-lg font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl hover:from-purple-700 hover:to-indigo-700 transform hover:scale-[1.02] active:scale-100 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Find Partner
            </button>
          </div>
        ) : (
          // Call Screen
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-8">
              <div className="relative">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <div className="absolute inset-0 w-3 h-3 bg-green-500 rounded-full animate-ping"></div>
              </div>
              <h2 className="text-2xl font-semibold text-gray-800">{status}</h2>
            </div>

            {isMatched && (
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-6 rounded-2xl mb-8 border border-purple-100">
                <p className="text-sm text-gray-600 mb-2">Talking with:</p>
                <h3 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                  {partnerName}
                </h3>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-1 h-8 bg-purple-500 rounded-full animate-[wave_1s_ease-in-out_infinite]"></div>
                    <div className="w-1 h-8 bg-purple-500 rounded-full animate-[wave_1s_ease-in-out_0.1s_infinite]"></div>
                    <div className="w-1 h-8 bg-purple-500 rounded-full animate-[wave_1s_ease-in-out_0.2s_infinite]"></div>
                    <div className="w-1 h-8 bg-indigo-500 rounded-full animate-[wave_1s_ease-in-out_0.3s_infinite]"></div>
                    <div className="w-1 h-8 bg-indigo-500 rounded-full animate-[wave_1s_ease-in-out_0.4s_infinite]"></div>
                  </div>
                </div>
              </div>
            )}

            {/* Remote audio element */}
            <audio ref={remoteAudioRef} autoPlay />

            <div className="flex gap-4">
              <button
                onClick={nextPartner}
                disabled={!isMatched}
                className="flex-1 py-4 px-6 font-semibold text-purple-600 bg-white border-2 border-purple-600 rounded-xl hover:bg-purple-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-purple-600 transition-all duration-200"
              >
                Next Partner
              </button>

              <button
                onClick={endCall}
                className="flex-1 py-4 px-6 font-semibold text-white bg-red-500 rounded-xl hover:bg-red-600 transform hover:scale-[1.02] active:scale-100 transition-all duration-200 shadow-lg"
              >
                End Call
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
