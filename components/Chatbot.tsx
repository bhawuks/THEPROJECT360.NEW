import React, { useState, useRef, useEffect } from 'react';
import { DailyReport } from '../types';
import { GeminiService } from '../services/geminiService';
import { MessageSquare, Send, Bot, User as UserIcon, Loader2, ChevronDown, Minimize2 } from 'lucide-react';

interface ChatbotProps {
  reports: DailyReport[];
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export const Chatbot: React.FC<ChatbotProps> = ({ reports }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hello! I am your SiteLog Assistant. I can analyze your project reports. Ask me about manpower, risks, or progress trends.',
      timestamp: Date.now()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Draggable State - Anchored from bottom-right
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number, y: number } | null>(null);
  const currentOffsetRef = useRef({ x: 0, y: 0 });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: inputValue.trim(),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const history = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, text: m.text }));

      const responseText = await GeminiService.chatWithProjectData(userMsg.text, reports, history);

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error("Chat error", error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "I'm having trouble connecting right now. Please try again later.",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Drag Logic
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = { x: clientX, y: clientY };
    setIsDragging(false);
  };

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      if (!dragStartRef.current) return;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const dx = clientX - dragStartRef.current.x;
      const dy = clientY - dragStartRef.current.y;

      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        setIsDragging(true);
      }

      const newX = currentOffsetRef.current.x + dx;
      const newY = currentOffsetRef.current.y + dy;

      setOffset({ x: newX, y: newY });
    };

    const handleGlobalUp = () => {
      if (dragStartRef.current) {
        currentOffsetRef.current = offset;
        dragStartRef.current = null;
        // Small delay to allow click events to distinguish from drag
        setTimeout(() => setIsDragging(false), 50);
      }
    };

    if (dragStartRef.current) {
      window.addEventListener('mousemove', handleGlobalMove);
      window.addEventListener('mouseup', handleGlobalUp);
      window.addEventListener('touchmove', handleGlobalMove, { passive: false });
      window.addEventListener('touchend', handleGlobalUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [offset]);

  const toggleChat = (e: React.MouseEvent) => {
    if (isDragging) return;
    setIsOpen(!isOpen);
  };

  return (
    <div className="z-[100] font-sans">
      {/* Chat Window */}
      {isOpen && (
        <div 
          className="fixed bg-white w-[90vw] md:w-[400px] h-[500px] rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] border-4 border-black flex flex-col overflow-hidden animate-scale-in z-[101]"
          style={{ 
            bottom: '100px', 
            right: '24px',
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            transformOrigin: 'bottom right'
          }}
        >
          {/* Header */}
          <div className="bg-black text-white p-4 flex justify-between items-center border-b-4 border-black">
            <div className="flex items-center gap-3">
              <div className="bg-white text-black p-1.5 rounded-lg">
                <Bot size={20} />
              </div>
              <div>
                <h3 className="font-black uppercase text-sm leading-none">SiteLog Assistant</h3>
                <span className="text-[10px] font-bold text-gray-400 uppercase">Powered by Gemini 3</span>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-gray-800 rounded transition-colors"
            >
              <Minimize2 size={18} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 border-black
                  ${msg.role === 'user' ? 'bg-black text-white' : 'bg-white text-black'}
                `}>
                  {msg.role === 'user' ? <UserIcon size={16} /> : <Bot size={16} />}
                </div>
                
                <div className={`
                  max-w-[80%] p-3 rounded-xl text-sm font-medium border-2 border-black
                  ${msg.role === 'user' 
                    ? 'bg-black text-white rounded-tr-none' 
                    : 'bg-white text-black rounded-tl-none'}
                `}>
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                 <div className="w-8 h-8 rounded-full bg-white text-black border-2 border-black flex items-center justify-center">
                    <Bot size={16} />
                 </div>
                 <div className="bg-white border-2 border-black px-4 py-2 rounded-xl rounded-tl-none flex items-center">
                    <Loader2 size={16} className="animate-spin text-black" />
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSend} className="p-4 bg-white border-t-4 border-black flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask about your project..."
              className="flex-1 bg-gray-100 border-2 border-black rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:bg-white transition-colors"
              disabled={isLoading}
            />
            <button 
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="bg-black text-white p-3 rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-2 border-black active:translate-y-1"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        onClick={toggleChat}
        className={`
          fixed bottom-6 right-6 w-16 h-16 rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] border-4 border-black transition-all active:scale-95 z-[102] flex items-center justify-center cursor-move touch-none
          ${isOpen ? 'bg-gray-200 text-black' : 'bg-black text-white hover:bg-gray-900'}
        `}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`
        }}
      >
        {isOpen ? (
          <ChevronDown size={32} strokeWidth={3} />
        ) : (
          <div className="relative pointer-events-none">
             <MessageSquare size={28} strokeWidth={3} />
             <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-black"></div>
          </div>
        )}
      </button>
    </div>
  );
};