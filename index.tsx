import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';

// Types
interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: { uri: string; title: string }[];
}

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Olá! Sou seu assistente especializado na **Tabela Unificada do SUS (SIGTAP)**. Posso te ajudar a extrair dados detalhados incluindo códigos, valores, CBOs e regras de faturamento.\n\nDigite o que você precisa extrair ou consultar abaixo.'
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [extractingTable, setExtractingTable] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedHistory = localStorage.getItem('sigtap_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addToHistory = (query: string) => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    
    setHistory(prev => {
      const newHistory = [cleanQuery, ...prev.filter(h => h !== cleanQuery)].slice(0, 20);
      localStorage.setItem('sigtap_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const performSearch = async (query: string) => {
    if (!query.trim() || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: query }]);
    setLoading(true);
    addToHistory(query);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [{ text: `Aja como um auditor técnico sênior de faturamento hospitalar e ambulatorial do SUS (especialista em SIGTAP). 
            Extraia os dados precisos para: "${query}". 
            
            DIRETRIZES DE RESPOSTA (CRÍTICO):
            1. TABELA MARKDOWN: Use obrigatoriamente tabelas markdown com cabeçalhos claros.
            2. COLUNAS: Código, Descrição, Valor SH, Valor SP, CBOs Compatíveis, Regras / Financiamento.
            3. VALORES MONETÁRIOS: Exiba Valor SH e Valor SP SEMPRE no formato "R$ 0,00". Nunca omita os centavos (ex: se for zero, use R$ 0,00; se for 10 reais, use R$ 10,00).
            4. REGRAS: Detalhe se o financiamento é MAC, PAB ou FAEC e os atributos (BPA-C, BPA-I, AIH).
            5. FORMATAÇÃO: Certifique-se de que a tabela markdown tenha uma linha em branco antes e depois dela para correta renderização.` }]
          }
        ],
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      let text = response.text || "Não foi possível obter uma resposta no momento.";
      
      // Pre-process text to ensure markdown tables are correctly identified by adding double newlines
      text = text.replace(/(\n|^)(\|.+|:---.+)/g, '$1\n$2');

      const sources: { uri: string; title: string }[] = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        chunks.forEach((chunk: any) => {
          if (chunk.web?.uri && chunk.web?.title) {
            sources.push({ uri: chunk.web.uri, title: chunk.web.title });
          }
        });
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: text,
        sources: sources.length > 0 ? Array.from(new Set(sources.map(s => JSON.stringify(s)))).map(s => JSON.parse(s)) : undefined
      }]);
    } catch (error) {
      console.error("Erro na busca:", error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Desculpe, ocorreu um erro ao tentar acessar os dados do SIGTAP." 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(input);
  };

  const handleHistoryClick = (query: string) => {
    setIsHistoryOpen(false);
    performSearch(query);
  };

  const clearHistory = () => {
    if (confirm("Deseja limpar todo o histórico de pesquisas?")) {
      setHistory([]);
      localStorage.removeItem('sigtap_history');
    }
  };

  const exportSingleMessageToTxt = (msg: Message) => {
    const timestamp = new Date().toLocaleString('pt-BR');
    let content = `SIGTAP EXPLORER - RELATÓRIO DE AUDITORIA\n`;
    content += `DATA: ${timestamp}\n`;
    content += `====================================================\n\n`;
    content += msg.content;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_sigtap_${new Date().getTime()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-screen max-w-6xl mx-auto shadow-2xl bg-white relative overflow-hidden">
      
      {/* Sidebar History Drawer */}
      <div className={`absolute inset-y-0 left-0 w-80 bg-white shadow-2xl z-[110] transform transition-transform duration-300 ease-in-out border-r border-slate-200 ${isHistoryOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <h2 className="font-bold text-slate-700 flex items-center text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2 text-[#005DAE]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              HISTÓRICO
            </h2>
            <button onClick={() => setIsHistoryOpen(false)} className="p-1 hover:bg-slate-200 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 custom-scroll">
            {history.map((item, i) => (
              <button key={i} onClick={() => handleHistoryClick(item)} className="w-full text-left p-3 rounded-xl hover:bg-blue-50 text-xs text-slate-600 font-semibold mb-1 transition-all truncate border border-transparent hover:border-blue-100">
                {item}
              </button>
            ))}
          </div>
          {history.length > 0 && (
            <div className="p-4 border-t border-slate-100">
              <button onClick={clearHistory} className="w-full py-2 text-[10px] font-black tracking-widest text-red-500 hover:bg-red-50 rounded-lg transition-colors uppercase">Limpar Histórico</button>
            </div>
          )}
        </div>
      </div>

      {isHistoryOpen && <div className="absolute inset-0 bg-slate-900/20 z-[105] backdrop-blur-sm" onClick={() => setIsHistoryOpen(false)} />}

      {/* Header */}
      <header className="bg-gradient-to-r from-[#005DAE] to-[#004a8b] text-white p-5 border-b-4 border-blue-900 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="bg-white p-2 rounded-2xl shadow-lg ring-4 ring-blue-400/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-[#005DAE]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20"/><path d="M2 12h20"/><path d="m4.93 4.93 14.14 14.14"/><path d="m4.93 19.07 14.14-14.14"/></svg>
            </div>
            <div>
              <h1 className="text-2xl font-black leading-none tracking-tight">SIGTAP Explorer</h1>
              <span className="text-[9px] text-blue-100 opacity-70 font-bold uppercase tracking-widest">Base de Dados Unificada SUS</span>
            </div>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto p-6 space-y-8 custom-scroll bg-[#f8fafc]">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`group relative max-w-[98%] md:max-w-[95%] rounded-[1.5rem] p-6 shadow-md transition-all ${
              msg.role === 'user' 
                ? 'bg-[#005DAE] text-white rounded-br-none' 
                : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'
            }`}>
              
              {msg.role === 'assistant' && (
                <button 
                  onClick={() => exportSingleMessageToTxt(msg)}
                  className="absolute top-4 right-4 p-2 bg-slate-50 hover:bg-blue-100 text-slate-400 hover:text-blue-600 rounded-xl border border-slate-200 transition-all opacity-0 group-hover:opacity-100"
                  title="Baixar Relatório"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
              )}

              <div className="prose prose-sm max-w-none prose-slate">
                <ReactMarkdown 
                  components={{
                    table: ({node, ...props}) => (
                      <div className="my-6 overflow-x-auto rounded-2xl border-2 border-slate-200 shadow-xl bg-white sticky-table-container">
                        <table className="w-full border-collapse text-[11px] sm:text-xs table-fixed min-w-[800px]" {...props} />
                      </div>
                    ),
                    thead: ({node, ...props}) => <thead className="bg-slate-100 border-b-2 border-slate-300" {...props} />,
                    th: ({node, ...props}) => (
                      <th className="px-4 py-4 text-left font-black uppercase tracking-wider text-slate-600 border-x border-slate-200/40" {...props} />
                    ),
                    tr: ({node, ...props}) => <tr className="even:bg-slate-50/50 hover:bg-blue-50/30 transition-colors border-b border-slate-100" {...props} />,
                    td: ({node, ...props}) => {
                      const content = String(props.children || '');
                      const isCode = /^\d{2,}\.?\d*/.test(content) && content.length >= 8 && content.length <= 15;
                      const isCurrency = content.includes('R$');
                      const isNumeric = isCode || isCurrency;
                      
                      // Identify the column by index or content for special truncation
                      const isTruncatable = content.length > 20 && !isCode && !isCurrency;
                      
                      return (
                        <td className={`px-4 py-3 border-x border-slate-200/20 text-slate-700 font-medium relative group/cell 
                          ${isCode ? 'font-mono text-[11px] text-blue-700 bg-blue-50/10' : ''} 
                          ${isCurrency ? 'font-black text-right text-emerald-700 tabular-nums' : ''}`} 
                        {...props}>
                          <div className={isTruncatable ? "truncate max-w-full" : ""}>
                             {props.children}
                          </div>
                          {isTruncatable && (
                            <div className="absolute z-[300] bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover/cell:block bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl text-[10px] w-80 whitespace-normal break-words border border-white/20 ring-1 ring-black">
                              <p className="font-bold text-blue-400 mb-1 uppercase text-[8px] tracking-widest">Informação Detalhada:</p>
                              {props.children}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900/95"></div>
                            </div>
                          )}
                        </td>
                      );
                    },
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>

              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                  {msg.sources.map((source, sIdx) => (
                    <a key={sIdx} href={source.uri} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-1 text-[9px] bg-slate-100 text-slate-500 px-3 py-1.5 rounded-full hover:bg-blue-600 hover:text-white transition-all font-black border border-slate-200 shadow-sm">
                      <span className="truncate max-w-[150px]">{source.title}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border-2 border-blue-100 rounded-3xl p-5 shadow-lg flex items-center space-x-4">
              <div className="w-3 h-3 bg-blue-600 rounded-full animate-ping"></div>
              <span className="text-xs text-slate-500 font-black uppercase tracking-widest animate-pulse">Sincronizando Base DATASUS...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </main>

      {/* Input Area */}
      <footer className="p-6 bg-white border-t-2 border-slate-100 shadow-lg">
        <form onSubmit={handleSearch} className="relative flex items-center max-w-5xl mx-auto space-x-3">
          
          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            className="p-4 bg-slate-50 text-[#005DAE] rounded-[1.25rem] hover:bg-blue-50 transition-all border-2 border-slate-200 active:scale-90"
            title="Ver Histórico"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </button>

          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ex: 'Valor do parto 04.10.01.001-3' ou 'Procedimentos de nebulização'"
              className="w-full pl-6 pr-28 py-5 bg-slate-50 border-2 border-slate-200 rounded-[1.5rem] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#005DAE] focus:bg-white transition-all shadow-inner font-bold text-slate-700"
              disabled={loading}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex space-x-2">
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="p-3 bg-[#005DAE] text-white rounded-2xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg active:scale-95"
              >
                {loading ? <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="22" y1="2" x2="11" y2="13"/><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg>}
              </button>
            </div>
          </div>
        </form>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        /* Fixed Column Widths for Perfect Alignment */
        th:nth-child(1), td:nth-child(1) { width: 130px; } /* Código */
        th:nth-child(2), td:nth-child(2) { min-width: 150px; } /* Descrição */
        th:nth-child(3), td:nth-child(3), th:nth-child(4), td:nth-child(4) { width: 100px; text-align: right; } /* Valores */
        th:nth-child(5), td:nth-child(5) { width: 150px; } /* CBOs */
        th:nth-child(6), td:nth-child(6) { width: 220px; } /* Regras */
        
        .sticky-table-container thead {
          position: sticky;
          top: 0;
          z-index: 20;
        }
        
        .prose table {
          table-layout: fixed;
          border-spacing: 0;
        }

        .custom-scroll::-webkit-scrollbar { width: 5px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}} />
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}