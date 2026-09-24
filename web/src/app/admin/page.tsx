"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminPage() {
  const [geminiCookies, setGeminiCookies] = useState('');
  const [accountCookies, setAccountCookies] = useState('');
  const [status, setStatus] = useState('');

  const saveCookies = async () => {
    setStatus('Saving...');
    try {
      let combined = [];
      
      // Parse Gemini cookies
      if (geminiCookies.trim()) {
        const parsedGemini = JSON.parse(geminiCookies);
        if (Array.isArray(parsedGemini)) combined = [...combined, ...parsedGemini];
        else combined.push(parsedGemini);
      }
      
      // Parse Google Account cookies
      if (accountCookies.trim()) {
        const parsedAccount = JSON.parse(accountCookies);
        if (Array.isArray(parsedAccount)) combined = [...combined, ...parsedAccount];
        else combined.push(parsedAccount);
      }

      if (combined.length === 0) {
        throw new Error("Please provide at least one set of cookies.");
      }
      
      // Deduplicate cookies based on name and domain
      const uniqueCookiesMap = new Map();
      combined.forEach(cookie => {
        if (cookie && cookie.name) {
          const key = `${cookie.domain}-${cookie.name}`;
          uniqueCookiesMap.set(key, cookie);
        }
      });
      const deduplicatedCookies = Array.from(uniqueCookiesMap.values());
      
      const { error } = await supabase.from('auth_sessions').upsert({ id: 1, cookies_json: deduplicatedCookies });
      if (error) throw error;
      
      setStatus(`Saved ${deduplicatedCookies.length} unique cookies successfully! Worker can now authenticate.`);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Gemini Auth Configuration</h1>
      <p className="mb-6 text-sm text-gray-400">
        Export cookies using EditThisCookie from both domains and paste them below. They will be automatically merged and deduplicated.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <h2 className="font-bold mb-2 text-blue-400">1. gemini.google.com</h2>
          <textarea
            value={geminiCookies}
            onChange={(e) => setGeminiCookies(e.target.value)}
            className="w-full h-64 p-4 font-mono text-sm border rounded bg-gray-50 text-black shadow-inner"
            placeholder="Paste EditThisCookie export from gemini.google.com..."
          />
        </div>
        <div>
          <h2 className="font-bold mb-2 text-green-400">2. myaccount.google.com</h2>
          <textarea
            value={accountCookies}
            onChange={(e) => setAccountCookies(e.target.value)}
            className="w-full h-64 p-4 font-mono text-sm border rounded bg-gray-50 text-black shadow-inner"
            placeholder="Paste EditThisCookie export from myaccount.google.com..."
          />
        </div>
      </div>
      
      <div className="flex gap-4 items-center bg-gray-900 p-4 rounded-xl shadow-lg border border-gray-800">
        <button
          onClick={saveCookies}
          className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-3 rounded-lg font-bold hover:opacity-90 transition-opacity shadow-md"
        >
          Merge & Save to Supabase
        </button>
        {status && <span className={`text-sm font-medium ${status.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>{status}</span>}
      </div>
    </div>
  );
}
