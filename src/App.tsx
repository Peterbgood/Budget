import { useEffect, useMemo, useState } from 'react';
import { db } from "./firebase"; 
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

type ItemType = 'income' | 'expense';

interface BudgetItem {
  id: string;
  name: string;
  amounts: number[];
  amount?: number; 
  notes: string;
  type: ItemType;
  order: number;
}

const TAX_RATE = 0.7253; 
const CORRECT_PIN = "3270";

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function App() {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [locations, setLocations] = useState(['Current', 'Knoxville']);
  const [form, setForm] = useState({ name: '', amounts: [''] as string[], type: 'expense' as ItemType });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  // Updated Mortgage State
  const [mortgage, setMortgage] = useState({
    price: 450000,
    downPayment: 90000,
    interest: 6.2,
    term: 30,
    annualTax: 2205, // Manual Tax Input
    annualInsurance: 1980 
  });

  const mortgageResult = useMemo(() => {
    const principal = mortgage.price - mortgage.downPayment;
    const monthlyRate = (mortgage.interest / 100) / 12;
    const totalPayments = mortgage.term * 12;
    
    const pAndI = (principal * monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1);
    const monthlyTax = mortgage.annualTax / 12;
    const monthlyInsurance = mortgage.annualInsurance / 12;
    
    return { pAndI, tax: monthlyTax, insurance: monthlyInsurance, total: pAndI + monthlyTax + monthlyInsurance };
  }, [mortgage]);

  useEffect(() => {
    setForm(f => ({ ...f, amounts: locations.map((_, i) => f.amounts[i] || '') }));
  }, [locations.length]);

  useEffect(() => {
    const q = query(collection(db, "budget"), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as BudgetItem[]);
    });
    return () => unsubscribe();
  }, []);

  const comparisonTotals = useMemo(() => {
    return locations.map((_, locIdx) => {
      const calculateTotal = (type: ItemType) => items
        .filter(i => i.type === type)
        .reduce((sum, i) => {
          const val = i.amounts ? (i.amounts[locIdx] ?? i.amounts[0]) : (i.amount || 0);
          return sum + val;
        }, 0);
      const gross = calculateTotal('income');
      const net = (gross * TAX_RATE) / 12;
      const exp = calculateTotal('expense');
      return { net, exp, surplus: net - exp };
    });
  }, [items, locations]);

  // PIN Handling logic
  useEffect(() => {
    if (pin.length === 4) {
      if (pin === CORRECT_PIN) setIsLocked(false);
      else { setError(true); setTimeout(() => { setPin(""); setError(false); }, 600); }
    }
  }, [pin]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLocked) return;
      if (e.key >= '0' && e.key <= '9' && pin.length < 4) setPin(p => p + e.key);
      if (e.key === 'Backspace') setPin(p => p.slice(0, -1));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, isLocked]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.amounts[0]) return;
    const processedAmounts = form.amounts.map((val, i) => 
      i === 0 ? Number(val) : (val === '' ? Number(form.amounts[0]) : Number(val))
    );
    const payload = { name: form.name, amounts: processedAmounts, type: form.type, amount: null };
    if (editingId) { await updateDoc(doc(db, "budget", editingId), payload as any); }
    else {
      const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.order)) : 0;
      await addDoc(collection(db, "budget"), { ...payload, order: maxOrder + 1, notes: '' });
    }
    setForm({ name: '', amounts: locations.map(() => ''), type: 'expense' });
    setEditingId(null);
  };

  const moveItem = async (currentIndex: number, direction: 'up' | 'down', list: BudgetItem[]) => {
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    await updateDoc(doc(db, "budget", list[currentIndex].id), { order: list[targetIndex].order });
    await updateDoc(doc(db, "budget", list[targetIndex].id), { order: list[currentIndex].order });
  };

  if (isLocked) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className={`w-full max-w-xs ${error ? 'animate-shake' : ''}`}>
          <div className="text-center mb-10">
            <h2 className="text-2xl font-black tracking-tight italic uppercase">Fiscal Flow</h2>
            <p className="text-slate-500 text-sm mt-1 tracking-widest uppercase font-bold">Secure Access</p>
          </div>
          <div className="flex justify-center gap-4 mb-12">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${pin.length > i ? 'bg-indigo-500 border-indigo-500 scale-125' : 'border-slate-700'}`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((btn, i) => (
              <button key={i} onClick={() => btn === "⌫" ? setPin(p => p.slice(0, -1)) : btn && setPin(p => p + btn)}
                className={`h-16 w-16 mx-auto flex items-center justify-center text-2xl font-bold rounded-full transition-all ${btn === "" ? "opacity-0 pointer-events-none" : "bg-slate-900 border border-slate-800 hover:bg-slate-800 active:scale-90"}`}>
                {btn}
              </button>
            ))}
          </div>
        </div>
        <style>{`@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-10px); } 75% { transform: translateX(10px); } } .animate-shake { animation: shake 0.2s ease-in-out 3; }`}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-900">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <h1 className="text-3xl font-black italic">Scenario Planner</h1>
          <div className="flex gap-2">
            <button onClick={() => setLocations([...locations, `City ${locations.length + 1}`])} className="bg-indigo-600 text-white px-5 py-2.5 rounded-2xl font-bold text-sm shadow-md hover:bg-indigo-700 transition-all">+ Add City</button>
            <button onClick={() => { setIsLocked(true); setPin(""); }} className="bg-white border px-5 py-2.5 rounded-2xl font-bold text-slate-400 hover:text-slate-600">Lock</button>
          </div>
        </header>

        {/* 🏛️ Mortgage Calculator */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-12">
          <div className="lg:col-span-3 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h2 className="text-xl font-black mb-6">🏠 Mortgage Estimator</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-4">
                <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Home Price</label><input type="number" value={mortgage.price} onChange={e => setMortgage({...mortgage, price: Number(e.target.value)})} className="w-full p-3 bg-slate-50 rounded-xl ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" /></div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Down Payment</label><input type="number" value={mortgage.downPayment} onChange={e => setMortgage({...mortgage, downPayment: Number(e.target.value)})} className="w-full p-3 bg-slate-50 rounded-xl ring-1 ring-slate-200 outline-none" /></div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Interest %</label><input type="number" step="0.1" value={mortgage.interest} onChange={e => setMortgage({...mortgage, interest: Number(e.target.value)})} className="w-full p-3 bg-slate-50 rounded-xl ring-1 ring-slate-200 outline-none" /></div>
              </div>
              <div className="space-y-4">
                <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Annual Property Tax</label>
                   <input type="number" value={mortgage.annualTax} onChange={e => setMortgage({...mortgage, annualTax: Number(e.target.value)})} className="w-full p-3 bg-slate-50 rounded-xl ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" />
                   <p className="text-[9px] text-slate-400 mt-1 italic">Effective Rate: {((mortgage.annualTax / mortgage.price) * 100).toFixed(2)}%</p>
                </div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Annual Insurance</label><input type="number" value={mortgage.annualInsurance} onChange={e => setMortgage({...mortgage, annualInsurance: Number(e.target.value)})} className="w-full p-3 bg-slate-50 rounded-xl ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" /></div>
              </div>
              <div className="bg-indigo-50 rounded-3xl p-6 flex flex-col justify-center items-center">
                <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">Monthly Total</p>
                <p className="text-4xl font-black text-indigo-600">{formatCurrency(mortgageResult.total)}</p>
                <div className="mt-4 w-16 h-16"><Pie data={{ datasets: [{ data: [mortgageResult.pAndI, mortgageResult.tax, mortgageResult.insurance], backgroundColor: ['#6366f1', '#f43f5e', '#fbbf24'] }] }} options={{ plugins: { tooltip: { enabled: false } } }} /></div>
              </div>
            </div>
          </div>
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-center gap-6">
            <h3 className="font-bold text-slate-400 text-xs uppercase tracking-widest">Monthly Breakdown</h3>
            <div className="space-y-4">
              <div className="flex justify-between text-sm border-b border-slate-50 pb-2"><span className="text-slate-500 font-bold">P&I</span><span className="font-black">{formatCurrency(mortgageResult.pAndI)}</span></div>
              <div className="flex justify-between text-sm border-b border-slate-50 pb-2"><span className="text-slate-500 font-bold">Tax</span><span className="font-black text-rose-500">{formatCurrency(mortgageResult.tax)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500 font-bold">Insurance</span><span className="font-black text-amber-500">{formatCurrency(mortgageResult.insurance)}</span></div>
            </div>
          </div>
        </div>

        {/* Location Comparison Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {locations.map((loc, i) => (
            <div key={i} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative group">
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">City {i+1}</label>
              <input value={loc} onChange={(e) => { const n = [...locations]; n[i] = e.target.value; setLocations(n); }} className="w-full font-black text-lg outline-none bg-transparent focus:text-indigo-600 transition-colors" />
              <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                <div><p className="text-[9px] font-black text-slate-300 uppercase">Surplus</p><p className="text-xl font-black text-indigo-600">{formatCurrency(comparisonTotals[i].surplus)}</p></div>
                {locations.length > 1 && <button onClick={() => setLocations(locations.filter((_, idx) => idx !== i))} className="text-slate-200 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Quick Add Form */}
          <div className="lg:col-span-4">
            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm sticky top-8 space-y-4">
              <h2 className="font-bold text-lg">Quick Add</h2>
              <div className="flex p-1 bg-slate-100 rounded-2xl">
                {(['income', 'expense'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setForm({...form, type: t})} className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-all ${form.type === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>{t}</button>
                ))}
              </div>
              <input className="w-full p-4 bg-slate-50 rounded-2xl ring-1 ring-slate-200 outline-none" placeholder="Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              {locations.map((loc, i) => (
                <div key={i}>
                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 mb-1">{loc} Amount</label>
                  <input type="number" className="w-full p-3 bg-slate-50 rounded-xl ring-1 ring-slate-200 outline-none" placeholder={i > 0 ? `Same as ${locations[0]}` : "$0.00"} value={form.amounts[i]} onChange={e => { const n = [...form.amounts]; n[i] = e.target.value; setForm({...form, amounts: n}); }} />
                </div>
              ))}
              <button className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-slate-800 transition-all">Save Entry</button>
            </form>
          </div>

          {/* List and Visualization */}
          <div className="lg:col-span-8 space-y-8">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm h-80">
              <Bar data={{
                labels: ['Net Monthly', 'Expenses', 'Surplus'],
                datasets: locations.map((loc, i) => ({
                  label: loc,
                  data: [comparisonTotals[i].net, comparisonTotals[i].exp, comparisonTotals[i].surplus],
                  backgroundColor: i === 0 ? '#6366f1' : i === 1 ? '#94a3b8' : '#cbd5e1',
                  borderRadius: 8,
                }))
              }} options={{ maintainAspectRatio: false }} />
            </div>

            {(['income', 'expense'] as const).map((type) => (
              <section key={type} className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                <div className="p-5 bg-slate-50/50 border-b flex justify-between items-center uppercase tracking-widest text-[10px] font-black text-slate-400">
                  <span>{type}s</span>
                  <div className="hidden md:flex gap-10 pr-20">
                    {locations.map(loc => <span key={loc} className="w-20 text-center truncate">{loc}</span>)}
                  </div>
                </div>
                <div className="divide-y">
                  {items.filter(i => i.type === type).map((item, idx) => (
                    <div key={item.id} className="p-5 flex justify-between items-center hover:bg-slate-50 group transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => moveItem(idx, 'up', items.filter(i => i.type === type))} className="text-slate-300 hover:text-indigo-600 text-[10px]">▲</button>
                          <button onClick={() => moveItem(idx, 'down', items.filter(i => i.type === type))} className="text-slate-300 hover:text-indigo-600 text-[10px]">▼</button>
                        </div>
                        <span className="font-bold text-slate-700">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="flex gap-6 md:gap-10">
                          {locations.map((_, lIdx) => (
                            <span key={lIdx} className={`w-20 text-right font-black ${lIdx === 0 ? 'text-slate-400' : 'text-slate-900'}`}>
                              {formatCurrency(item.amounts ? (item.amounts[lIdx] ?? item.amounts[0]) : (item.amount || 0))}
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingId(item.id); setForm({ name: item.name, amounts: item.amounts ? item.amounts.map(String) : [String(item.amount || '')], type: item.type }); }} className="p-2 text-slate-300 hover:text-indigo-600">✎</button>
                          <button onClick={() => deleteDoc(doc(db, "budget", item.id))} className="p-2 text-slate-300 hover:text-rose-500">✕</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;