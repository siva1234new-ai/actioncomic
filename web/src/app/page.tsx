"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function ChatPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    // Initial fetch
    fetchMessages();
    
    // Poll for new messages every 1 second
    const interval = setInterval(fetchMessages, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('story_messages')
      .select('*')
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    setIsSending(true);
    const { error } = await supabase.from('story_messages').insert({
      role: 'user',
      content: input,
      status: 'pending'
    });
    
    if (!error) {
      setInput('');
      await fetchMessages();
    }
    setIsSending(false);
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto p-4 font-sans text-black">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Story Builder POC</h1>
          <p className="text-sm text-gray-400">Worker must be running locally to process messages.</p>
        </div>
        <a href="/admin" className="text-blue-400 text-sm hover:underline">Auth Settings</a>
      </header>
      
      <div className="flex-1 overflow-y-auto mb-4 border rounded p-4 bg-gray-50 flex flex-col gap-4">
        {messages.map((msg, i) => (
          <div key={i} className={`p-4 rounded-xl max-w-[85%] ${msg.role === 'user' ? 'bg-blue-600 text-white self-end rounded-br-none' : 'bg-white border text-gray-800 self-start rounded-bl-none shadow-sm'}`}>
            <div className={`font-bold mb-1 text-xs opacity-75`}>
              {msg.role === 'user' ? 'You' : 'Gemini'}
              {msg.status === 'pending' && <span className="ml-2 italic animate-pulse">Sending...</span>}
              {msg.status === 'processing' && <span className="ml-2 italic animate-pulse">Gemini is typing...</span>}
            </div>
            <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-10">No messages yet. Start the story!</div>
        )}
      </div>

      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Today's episode starts with..."
          className="flex-1 border rounded-full px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
          disabled={isSending}
        />
        <button
          type="submit"
          disabled={isSending}
          className="bg-blue-600 text-white px-8 py-3 rounded-full hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
