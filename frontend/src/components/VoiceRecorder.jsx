import React, { useState, useRef, useEffect } from 'react';
import { IoStop, IoTrash, IoSend } from 'react-icons/io5';
import toast from 'react-hot-toast';

export const VoiceRecorder = ({ onSend, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    // Start recording automatically on mount
    startRecording();

    return () => {
      stopTimer();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startTimer = () => {
    setRecordingTime(0);
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        // Stop all tracks on the stream to release microphone
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      startTimer();
    } catch (err) {
      console.error('Microphone access denied:', err);
      toast.error('Could not access microphone');
      onCancel();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopTimer();
    }
  };

  const handleSend = () => {
    if (audioChunksRef.current.length === 0) return;
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    // Convert to file
    const audioFile = new File([audioBlob], `voice_note_${Date.now()}.webm`, {
      type: 'audio/webm',
    });
    onSend(audioFile);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center space-x-3 w-full bg-slate-100 dark:bg-dark-300 rounded-full px-4 py-2 text-slate-800 dark:text-white transition-all shadow-inner">
      {isRecording ? (
        <>
          <div className="flex items-center space-x-2 flex-1">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-sm font-medium">{formatTime(recordingTime)}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 pl-2">Recording voice note...</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => {
                onCancel();
              }}
              className="rounded-full p-2 bg-slate-200 dark:bg-dark-200 hover:bg-red-500 hover:text-white transition"
              title="Discard"
            >
              <IoTrash size={18} />
            </button>
            <button
              onClick={stopRecording}
              className="rounded-full p-2 bg-red-500 text-white hover:bg-red-600 transition"
              title="Stop Recording"
            >
              <IoStop size={18} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center flex-1 space-x-3">
            <audio src={audioUrl} controls className="h-8 max-w-[200px] md:max-w-xs focus:outline-none" />
            <span className="text-xs text-slate-400 font-medium">Preview voice note</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => {
                if (audioUrl) URL.revokeObjectURL(audioUrl);
                onCancel();
              }}
              className="rounded-full p-2 bg-slate-200 dark:bg-dark-200 hover:bg-red-500 hover:text-white transition"
              title="Discard"
            >
              <IoTrash size={18} />
            </button>
            <button
              onClick={handleSend}
              className="rounded-full p-2.5 bg-sky-500 text-white hover:bg-sky-600 transition shadow"
              title="Send Voice Note"
            >
              <IoSend size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};
export default VoiceRecorder;
