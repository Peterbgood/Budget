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
  const [locations, setLocations] = useState<string[]>(() => {
    const saved = localStorage.getItem('budget_locations');
    return saved ? JSON.parse(saved) : ['Current', 'Knoxville'];
  });
  
  const [form, setForm] = useState({ name: '', amounts: [''] as string[], type: 'expense' as ItemType });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [showMortgage, setShowMortgage] = useState(false);

  const [mortgage, setMortgage] = useState({
    price: 450000,
    downPayment: 90000,
    interest: 6.2,
    term: 30,
    annualTax: 2205,
    annualInsurance: 1980 
  });

  useEffect(() => {
    localStorage.setItem('budget_locations', JSON.stringify(locations));
  }, [locations]);

  const mortgageResult = useMemo(() => {
    const principal = mortgage.price - mortgage.downPayment;
    const monthlyRate = (mortgage.interest / 100) / 12;
    const totalPayments = mortgage.term * 12;
    const pAndI = (principal * monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1);
    return { pAndI, tax: mortgage.annualTax / 12, insurance: mortgage.annualInsurance / 12, total: pAndI + (mortgage.annualTax / 12) + (mortgage.annualInsurance / 12) };
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
      const net = (calculateTotal('income') * TAX_RATE) / 12;
      const exp = calculateTotal('expense');
      return { net, exp, surplus: net - exp };
    });
  }, [items, locations]);

  const handleNumChange = (val: string) => val.replace(/^0+/, '') || '';

  // PIN Logic
  useEffect(() => {
    if (pin.length === 4) {
      if (pin === CORRECT_PIN) setIsLocked(false);
      else { setError(true); setTimeout(() => { setPin(""); setError(false); }, 500); }
    }
  }, [pin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.amounts[0]) return;
    const processedAmounts = form.amounts.map((val, i) => i === 0 ? Number(val) : (val === '' ? Number(form.amounts[0]) : Number(val)));
    const payload = { name: form.name, amounts: processedAmounts, type: form.type, amount: null };
    if (editingId) await updateDoc(doc(db, "budget", editingId), payload as any);
    else await addDoc(collection(db, "budget"), { ...payload, order: Date.now(), notes: '' });
    setForm({ name: '', amounts: locations.map(() => ''), type: 'expense' });
    setEditingId(null);
  };

  if (isLocked) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center p-6 transition-all duration-500">
        <div className={`w-full max-w-[280px] flex flex-col items-center ${error ? 'animate-shake' : ''}`}>
          <div className="mb-12 text-center">
            <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-xl">
              <span className="text-white text-2xl font-black italic">F</span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Enter Passcode</h2>
          </div>
          
          <div className="flex gap-5 mb-16">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={`w-3.5 h-3.5 rounded-full border border-slate-300 transition-all duration-200 ${pin.length > i ? 'bg-slate-900 border-slate-900 scale-110 shadow-sm' : 'bg-transparent'}`} />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "Delete"].map((btn, i) => (
              <button
                key={i}
                onClick={() => btn === "Delete" ? setPin(p => p.slice(0, -1)) : btn && setPin(p => p + btn)}
                className={`w-16 h-16 flex flex-col items-center justify-center rounded-full transition-all active:bg-slate-200 ${btn === "" ? "pointer-events-none opacity-0" : "bg-slate-100/50"}`}
              >
                <span className={`text-2xl ${btn === "Delete" ? "text-sm font-medium" : "font-normal"}`}>{btn}</span>
              </button>
            ))}
          </div>
        </div>
        <style>{`@keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-8px); } 80% { transform: translateX(8px); } } .animate-shake { animation: shake 0.4s ease-in-out; }`}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7] p-4 md:p-8 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tighter text-slate-900">Budget <span className="text-indigo-600 italic">Vault</span></h1>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Active Comparison Mode</p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={() => setShowMortgage(!showMortgage)} className={`flex-1 md:flex-none px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-sm ${showMortgage ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>
              Mortgage Tool
            </button>
            <button onClick={() => { setIsLocked(true); setPin(""); }} className="bg-white px-4 py-3 rounded-2xl shadow-sm"><span className="opacity-40">🔒</span></button>
          </div>
        </header>

        {showMortgage && (
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200/60 mb-10 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold tracking-tight">Mortgage Estimator</h2>
              <button onClick={() => setShowMortgage(false)} className="text-slate-300 hover:text-slate-900">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="space-y-4">
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Home Price</label><input type="text" value={mortgage.price} onChange={e => setMortgage({...mortgage, price: Number(handleNumChange(e.target.value))})} className="w-full p-4 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500" /></div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Down Payment</label><input type="text" value={mortgage.downPayment} onChange={e => setMortgage({...mortgage, downPayment: Number(handleNumChange(e.target.value))})} className="w-full p-4 bg-slate-50 rounded-2xl outline-none" /></div>
              </div>
              <div className="space-y-4">
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Annual Tax</label><input type="text" value={mortgage.annualTax} onChange={e => setMortgage({...mortgage, annualTax: Number(handleNumChange(e.target.value))})} className="w-full p-4 bg-slate-50 rounded-2xl outline-none" /></div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Annual Insurance</label><input type="text" value={mortgage.annualInsurance} onChange={e => setMortgage({...mortgage, annualInsurance: Number(handleNumChange(e.target.value))})} className="w-full p-4 bg-slate-50 rounded-2xl outline-none" /></div>
              </div>
              <div className="md:col-span-2 bg-indigo-600 rounded-[2rem] p-8 text-white flex flex-col justify-center items-center relative overflow-hidden">
                <div className="relative z-10 text-center">
                  <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-2">Estimated Monthly PITI</p>
                  <p className="text-5xl font-black tracking-tighter">{formatCurrency(mortgageResult.total)}</p>
                </div>
                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {locations.map((loc, i) => (
            <div key={i} className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-slate-200/50 group">
              <input value={loc} onChange={(e) => { const n = [...locations]; n[i] = e.target.value; setLocations(n); }} className="w-full font-bold text-lg outline-none bg-transparent focus:text-indigo-600" />
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-end">
                <div><p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Surplus</p><p className="text-2xl font-black tracking-tighter text-indigo-600">{formatCurrency(comparisonTotals[i].surplus)}</p></div>
                {locations.length > 1 && <button onClick={() => setLocations(locations.filter((_, idx) => idx !== i))} className="text-slate-200 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity pb-1">✕</button>}
              </div>
            </div>
          ))}
          <button onClick={() => setLocations([...locations, `City ${locations.length + 1}`])} className="border-2 border-dashed border-slate-200 rounded-[1.5rem] p-6 text-slate-400 font-bold hover:bg-white hover:border-indigo-300 transition-all">+ Add Comparison</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-[2rem] shadow-sm space-y-5 sticky top-8">
              <h3 className="font-bold text-xl tracking-tight">New Entry</h3>
              <div className="flex p-1.5 bg-slate-100 rounded-2xl">
                {(['income', 'expense'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setForm({...form, type: t})} className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${form.type === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>{t}</button>
                ))}
              </div>
              <input className="w-full p-4 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium" placeholder="Label (e.g. Salary)" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              {locations.map((loc, i) => (
                <div key={i}>
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">{loc} Amount</label>
                  <input type="text" className="w-full p-4 bg-slate-50 rounded-2xl outline-none" placeholder="0" value={form.amounts[i]} onChange={e => { const n = [...form.amounts]; n[i] = handleNumChange(e.target.value); setForm({...form, amounts: n}); }} />
                </div>
              ))}
              <button className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-indigo-200 transition-all">Add to Records</button>
            </form>
          </div>

          <div className="lg:col-span-8 space-y-10">
            {(['income', 'expense'] as const).map((type) => (
              <section key={type} className="bg-white rounded-[2rem] shadow-sm overflow-hidden border border-slate-200/50">
                <div className="px-8 py-5 bg-slate-50/50 border-b flex items-center">
                  <span className="w-1/3 text-[10px] font-black uppercase tracking-widest text-slate-400">{type} Summary</span>
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
                    {locations.map(loc => <span key={loc} className="text-[10px] font-black uppercase text-slate-400 truncate">{loc}</span>)}
                  </div>
                  <div className="w-12" />
                </div>
                <div className="divide-y divide-slate-50">
                  {items.filter(i => i.type === type).map((item) => (
                    <div key={item.id} className="px-8 py-6 flex items-center hover:bg-slate-50/80 transition-colors group">
                      <span className="w-1/3 font-bold text-slate-800 truncate pr-4">{item.name}</span>
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
                        {locations.map((_, lIdx) => (
                          <span key={lIdx} className={`font-black text-sm ${lIdx === 0 ? 'text-slate-300' : 'text-slate-900'}`}>
                            {formatCurrency(item.amounts ? (item.amounts[lIdx] ?? item.amounts[0]) : (item.amount || 0))}
                          </span>
                        ))}
                      </div>
                      <div className="w-12 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => deleteDoc(doc(db, "budget", item.id))} className="text-slate-300 hover:text-rose-500 text-lg">✕</button>
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