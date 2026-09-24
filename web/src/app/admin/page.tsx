"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminPage() {
  const [cookies, setCookies] = useState('');
  const [status, setStatus] = useState('');

  const saveCookies = async () => {
    setStatus('Saving...');
    try {
      let parsedCookies = JSON.parse(cookies);
      if (!Array.isArray(parsedCookies)) {
        throw new Error("Cookies must be a JSON array");
      }
      
      const { error } = await supabase.from('auth_sessions').upsert({ id: 1, cookies_json: parsedCookies });
      if (error) throw error;
      setStatus('Cookies saved successfully! You can now start the worker.');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Gemini Auth Configuration</h1>
      <p className="mb-4 text-gray-600">Paste your exported cookies (JSON array) from your mobile browser here.</p>
      
      <textarea
        className="w-full h-64 p-2 border rounded font-mono text-sm bg-gray-50 mb-4 text-black"
        placeholder='[{"name": "SID", "value": "..."}, ...]'
        value={cookies}
        onChange={(e) => setCookies(e.target.value)}
      />
      
      <button
        onClick={saveCookies}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Save Cookies to Supabase
      </button>
      
      {status && (
        <div className="mt-4 p-4 border rounded bg-gray-100 text-black">
          {status}
        </div>
      )}
    </div>
  );
}
