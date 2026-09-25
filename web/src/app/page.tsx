"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function AutoAiStudio() {
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('brainstorm'); 

  useEffect(() => {
    fetchEpisodes();

    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'episodes' }, fetchEpisodes)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchEpisodes = async () => {
    const { data } = await supabase.from('episodes').select('*').order('created_at', { ascending: false });
    if (data) setEpisodes(data);
  };

  const createNewEpisode = async () => {
    const dateTitle = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + " Episode";
    const { data, error } = await supabase.from('episodes').insert({ date_title: dateTitle }).select().single();
    if (data) {
      setSelectedEpisode(data);
      setActiveTab('brainstorm');
      fetchEpisodes();
    }
  };

  return (
    <div className="flex h-screen w-full bg-gray-900 text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h1 className="font-bold text-lg text-blue-400">Auto-AI Studio</h1>
        </div>
        <div className="p-4">
          <button 
            onClick={createNewEpisode}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            + New Episode
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {episodes.map(ep => (
            <button
              key={ep.id}
              onClick={() => setSelectedEpisode(ep)}
              className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${selectedEpisode?.id === ep.id ? 'border-blue-500 bg-gray-800 text-white' : 'border-transparent text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}
            >
              <div className="font-medium text-sm">{ep.date_title}</div>
              <div className="text-xs text-gray-500 mt-1 capitalize">{ep.status}</div>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-gray-800">
          <a href="/admin" className="text-xs text-gray-500 hover:text-gray-300">Auth Settings</a>
        </div>
      </div>

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col bg-gray-900 h-full relative">
        {!selectedEpisode ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 flex-col gap-4">
            <svg className="w-16 h-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p>Select or create an episode to begin directing.</p>
          </div>
        ) : (
          <>
            {/* Hierarchical Tabs Header */}
            <div className="bg-gray-900 border-b border-gray-800 px-4 pt-4 flex space-x-1 overflow-x-auto">
              <TabButton active={activeTab === 'brainstorm'} onClick={() => setActiveTab('brainstorm')} label="Overall Story" />
              {[1,2,3,4,5,6].map(num => (
                <TabButton key={num} active={activeTab === `scene_${num}`} onClick={() => setActiveTab(`scene_${num}`)} label={`Scene ${num}`} />
              ))}
            </div>
            
            {/* Tab Body */}
            <div className="flex-1 overflow-hidden relative">
              {activeTab === 'brainstorm' && <BrainstormTab episodeId={selectedEpisode.id} />}
              {activeTab.startsWith('scene_') && <SceneTab episodeId={selectedEpisode.id} sceneNumber={parseInt(activeTab.split('_')[1])} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------------
// HELPER COMPONENTS
// ----------------------------------------------------------------------------------

function TabButton({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
        active 
          ? 'bg-gray-800 text-white border-t border-l border-r border-gray-700' 
          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
      }`}
    >
      {label}
    </button>
  );
}

function BrainstormTab({ episodeId }: { episodeId: number }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
    const channel = supabase
      .channel('story-chats-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'story_chats', filter: `episode_id=eq.${episodeId}` }, fetchMessages)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [episodeId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const fetchMessages = async () => {
    const { data } = await supabase.from('story_chats').select('*').eq('episode_id', episodeId).order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const currentInput = input;
    setInput('');
    setIsSending(true);
    
    // Save to chat history
    await supabase.from('story_chats').insert({ episode_id: episodeId, role: 'user', content: currentInput, status: 'completed' });
    
    // Send job to queue for worker to process
    await supabase.from('job_queue').insert({
      job_type: 'brainstorm',
      payload: { episode_id: episodeId, prompt: currentInput }
    });
    
    setIsSending(false);
  };

  const finalizeStory = async () => {
    if (!confirm("Are you ready to finalize this story? This will instruct the AI to generate detailed scripts for all 6 scenes.")) return;
    
    // Update episode status
    await supabase.from('episodes').update({ status: 'scripting_scenes' }).eq('id', episodeId);
    
    // Queue up 6 scene generation jobs
    for(let i=1; i<=6; i++) {
      // Create a scene record first
      const { data: sceneData } = await supabase.from('scenes').insert({ episode_id: episodeId, scene_number: i }).select().single();
      if (sceneData) {
        // Queue the job
        await supabase.from('job_queue').insert({
          job_type: 'scene_script',
          payload: { episode_id: episodeId, scene_id: sceneData.id, scene_number: i }
        });
      }
    }
    alert("Script finalizing triggered! Check the individual Scene tabs in a few moments.");
  };

  return (
    <div className="flex flex-col h-full bg-gray-800">
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {messages.map((msg, i) => (
          <div key={i} className={`p-4 rounded-xl max-w-[80%] ${msg.role === 'user' ? 'bg-blue-600 text-white self-end rounded-br-none' : 'bg-gray-700 border border-gray-600 text-gray-100 self-start rounded-bl-none shadow-sm'}`}>
            <div className="font-bold mb-1 text-xs opacity-75">{msg.role === 'user' ? 'You' : 'Director AI'}</div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-20 flex flex-col items-center">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-4">🎬</div>
            <h2 className="text-xl font-bold text-gray-200 mb-2">Director's Chair</h2>
            <p className="max-w-md">Pitch an idea for a 60-second short. The AI Director will help you structure a high-retention narrative.</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-gray-900 border-t border-gray-800">
        <form onSubmit={sendMessage} className="flex gap-2 max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Today's episode starts with..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 text-white placeholder-gray-500"
            disabled={isSending}
          />
          <button type="submit" disabled={isSending} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors">
            Send
          </button>
          <button type="button" onClick={finalizeStory} className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-medium transition-colors ml-2">
            Finalize Story
          </button>
        </form>
      </div>
    </div>
  );
}

function SceneTab({ episodeId, sceneNumber }: { episodeId: number, sceneNumber: number }) {
  const [scene, setScene] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [activeV, setActiveV] = useState(1);

  useEffect(() => {
    fetchSceneData();
    const channel = supabase
      .channel(`scene-changes-${sceneNumber}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scene_versions' }, fetchSceneData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [episodeId, sceneNumber]);

  const fetchSceneData = async () => {
    // 1. Get scene
    const { data: sData } = await supabase.from('scenes').select('*').eq('episode_id', episodeId).eq('scene_number', sceneNumber).maybeSingle();
    if (sData) {
      setScene(sData);
      // 2. Get versions
      const { data: vData } = await supabase.from('scene_versions').select('*').eq('scene_id', sData.id).order('version_number', { ascending: true });
      if (vData && vData.length > 0) {
        setVersions(vData);
        // Default to latest version if none selected
        setActiveV(vData[vData.length - 1].version_number);
      }
    }
  };
  
  if (!scene) return <div className="p-10 text-center text-gray-500">Wait for the Overall Story to be finalized. Scene {sceneNumber} has not been generated yet.</div>;
  if (versions.length === 0) return <div className="p-10 text-center text-gray-500">Generating script for Scene {sceneNumber}... <br/><span className="text-xs animate-pulse">Worker is processing in the background.</span></div>;

  const currentVersion = versions.find(v => v.version_number === activeV);

  return (
    <div className="flex flex-col h-full bg-gray-800 p-6 overflow-y-auto">
      {/* Version Tabs */}
      <div className="flex space-x-2 mb-6">
        {versions.map(v => (
          <button
            key={v.id}
            onClick={() => setActiveV(v.version_number)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${activeV === v.version_number ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
          >
            V{v.version_number}
          </button>
        ))}
      </div>
      
      {/* Script Panel */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mb-6 shadow-lg">
        <h3 className="text-blue-400 font-bold mb-4 uppercase text-xs tracking-wider border-b border-gray-800 pb-2">The Script</h3>
        <div className="mb-4">
          <label className="text-gray-500 text-xs font-bold block mb-1">Visual Prompt (For Veo/Imagen)</label>
          <div className="text-gray-200 text-sm p-3 bg-gray-800 rounded-md border border-gray-700">{currentVersion?.visual_prompt || 'Pending...'}</div>
        </div>
        <div>
          <label className="text-gray-500 text-xs font-bold block mb-1">Voiceover (TTS)</label>
          <div className="text-gray-200 text-sm p-3 bg-gray-800 rounded-md border border-gray-700 italic">{currentVersion?.voiceover || 'Pending...'}</div>
        </div>
        
        <div className="mt-6 flex justify-end gap-3">
          <button className="px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded hover:bg-gray-600">Modify Script</button>
          <button className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 shadow-lg shadow-green-900/20">Approve Script & Generate Images</button>
        </div>
      </div>

      {/* Visual Asset Panel */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 shadow-lg">
        <h3 className="text-pink-400 font-bold mb-4 uppercase text-xs tracking-wider border-b border-gray-800 pb-2">Visual Assets</h3>
        <div className="text-center text-gray-500 text-sm py-10">
          Images will appear here once the script is approved.
        </div>
      </div>
    </div>
  );
}
