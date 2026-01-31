import React, { useEffect, useMemo, useState } from 'react';
import { 
  Plus, 
  Save, 
  Trash2, 
  Search, 
  Users, 
  Package, 
  Truck, 
  Briefcase,
  RefreshCw 
} from 'lucide-react';
import { 
  listMasterItems, 
  saveMasterItem, 
  deleteMasterItem, 
  syncAllMasterItemsToMemory 
} from '../services/firestoreService';

type Category = 'manpower' | 'material' | 'equipment' | 'subcontractor';

// ✅ Added 'id' to ensure the row stays stable while you type
export interface MasterDataItem {
  id: string; 
  code: string;
  name: string;
  unit?: string;
  quantity?: number;
  overtime?: number;
  trade?: string;
  company?: string;
  cost?: number;
  comments?: string;
  updatedAt?: number;
}

const CATEGORY_LABELS: Record<Category, string> = {
  manpower: 'Manpower',
  material: 'Material',
  equipment: 'Equipment',
  subcontractor: 'Subcontractor',
};

const CATEGORY_ICONS: Record<Category, any> = {
  manpower: Users,
  material: Package,
  equipment: Truck,
  subcontractor: Briefcase,
};

const normalizeCode = (code: string) => code.trim().toUpperCase();

const titleCase = (s: string) =>
  s.trim().split(/\s+/).map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(' ');

export const MasterData: React.FC<{ currentUserId: string }> = ({ currentUserId }) => {
  const [activeTab, setActiveTab] = useState<Category>('manpower');
  const [items, setItems] = useState<MasterDataItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [modified, setModified] = useState<Record<string, MasterDataItem>>({});

  useEffect(() => {
    if (currentUserId) {
      loadItems();
      setModified({});
      setSearch('');
    }
  }, [activeTab, currentUserId]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await listMasterItems(currentUserId, activeTab);
      // ✅ Assign a random stable ID to each item so React doesn't re-render while typing
      const itemsWithIds = data.map((d: any) => ({
        ...d,
        id: d.id || Math.random().toString(36).substr(2, 9)
      }));
      setItems(itemsWithIds as MasterDataItem[]);
    } catch (error) {
      console.error('Error loading master items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncToEntryForm = async () => {
    if (!confirm("Push all Master Data (names, trades, hours) to the Entry Form?")) return;
    setSyncing(true);
    try {
      await syncAllMasterItemsToMemory(currentUserId);
      alert("Success! Entry Form is now synced.");
    } catch (e) {
      console.error(e);
      alert("Failed to sync.");
    } finally {
      setSyncing(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(
      it =>
        it.code.toLowerCase().includes(q) ||
        it.name.toLowerCase().includes(q) ||
        (it.trade || '').toLowerCase().includes(q) ||
        (it.company || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  // ✅ Fix: We update based on ID, not Code, so focus isn't lost
  const updateItem = (id: string, changes: Partial<MasterDataItem>) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, ...changes } : item))
    );
    const item = items.find(x => x.id === id);
    if (item) {
      setModified(prev => ({
        ...prev,
        [id]: { ...prev[id], ...item, ...changes },
      }));
    }
  };

  const saveOne = async (item: MasterDataItem) => {
    try {
      // Remove internal ID before saving to DB
      const { id, ...dbItem } = item;
      
      const payload: any = {
        ...dbItem,
        name: titleCase(item.name),
        updatedAt: Date.now(),
      };

      await saveMasterItem(currentUserId, activeTab, item.code, payload);

      setModified(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      // Update the item in the list (keep the same ID)
      setItems(prev => prev.map(x => (x.id === item.id ? { ...x, ...payload } : x)));
    } catch (e) {
      console.error('Failed to save item:', e);
      alert('Error saving item. Ensure Code is not empty.');
    }
  };

  const addNewRow = () => {
    const newItem: MasterDataItem = {
      id: Math.random().toString(36).substr(2, 9), // ✅ Unique ID
      code: '',
      name: '',
      unit: '',
      quantity: 8,
      cost: 0,
    };
    setItems([newItem, ...items]);
  };

  const deleteOne = async (item: MasterDataItem) => {
    if (!item.code) {
      setItems(prev => prev.filter(x => x.id !== item.id));
      return; 
    }
    if (!confirm('Delete this item?')) return;
    try {
      await deleteMasterItem(currentUserId, activeTab, item.code);
      setItems(prev => prev.filter(x => x.id !== item.id));
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  };

  if (!currentUserId) return <div className="p-10 text-center font-bold">Loading...</div>;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase flex items-center gap-3">
          {React.createElement(CATEGORY_ICONS[activeTab], { size: 28 })}
          {CATEGORY_LABELS[activeTab]} Master
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncToEntryForm}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-black hover:text-white rounded-xl font-bold uppercase text-xs transition-all mr-2"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync to Entry Form"}
          </button>
          <button
            onClick={addNewRow}
            className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl font-bold uppercase text-xs hover:scale-105 transition-all shadow-lg"
          >
            <Plus size={16} /> Add New
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-4 gap-6 overflow-x-auto">
        {(Object.keys(CATEGORY_LABELS) as Category[]).map(cat => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`py-4 font-bold uppercase text-xs tracking-wider border-b-2 transition-all whitespace-nowrap ${
              activeTab === cat ? 'border-black text-black' : 'border-transparent text-gray-400'
            }`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="p-4 bg-gray-50/50 flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search code, name, trade..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white border-2 border-transparent focus:border-black rounded-xl text-sm font-bold outline-none"
          />
        </div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          {filteredItems.length} Records
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-xs border-b border-gray-100">
              <tr>
                <th className="p-3 w-32">Code</th>
                <th className="p-3">Description / Name</th>
                {activeTab === 'manpower' && <th className="p-3 w-32">Trade</th>}
                {activeTab === 'subcontractor' && <th className="p-3 w-40">Company</th>}
                <th className="p-3 w-24">Unit</th>
                {activeTab === 'manpower' && <th className="p-3 w-24">Reg (Hrs)</th>}
                {activeTab === 'manpower' && <th className="p-3 w-24">OT (Hrs)</th>}
                <th className="p-3 w-32">Unit Cost</th>
                <th className="p-3 w-40 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="p-8 text-center text-gray-400 font-bold">Loading...</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-gray-400 font-bold">No items found.</td></tr>
              ) : (
                filteredItems.map((it) => {
                  const dirty = !!modified[it.id] || !it.code; 
                  // ✅ KEY IS NOW STABLE ID, NOT CODE
                  return (
                    <tr key={it.id} className={`group hover:bg-gray-50 transition-colors ${dirty ? 'bg-blue-50/30' : ''}`}>
                      <td className="p-3">
                        <input type="text" className="w-full bg-transparent font-black uppercase outline-none" placeholder="CODE" value={it.code} onChange={(e) => updateItem(it.id, { code: normalizeCode(e.target.value) })} />
                      </td>
                      <td className="p-3">
                        <input type="text" className="w-full bg-transparent font-medium outline-none" placeholder="Item Name" value={it.name} onChange={(e) => updateItem(it.id, { name: e.target.value })} />
                      </td>
                      {activeTab === 'manpower' && (
                        <td className="p-3">
                          <input type="text" className="w-full bg-transparent outline-none" placeholder="Trade" value={it.trade || ''} onChange={(e) => updateItem(it.id, { trade: e.target.value })} />
                        </td>
                      )}
                      {activeTab === 'subcontractor' && (
                        <td className="p-3">
                          <input type="text" className="w-full bg-transparent outline-none" placeholder="Company" value={it.company || ''} onChange={(e) => updateItem(it.id, { company: e.target.value })} />
                        </td>
                      )}
                      <td className="p-3">
                        <input type="text" className="w-full bg-transparent outline-none" placeholder="Unit" value={it.unit || ''} onChange={(e) => updateItem(it.id, { unit: e.target.value })} />
                      </td>
                      {activeTab === 'manpower' && (
                        <td className="p-3">
                          <input
                            type="number"
                            className="w-full bg-transparent outline-none text-blue-600 font-bold"
                            placeholder="8"
                            value={it.quantity === undefined ? '' : it.quantity}
                            onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })}
                          />
                        </td>
                      )}
                      {activeTab === 'manpower' && (
                        <td className="p-3">
                          <input type="number" className="w-full bg-transparent outline-none" placeholder="0" value={it.overtime === undefined ? '' : it.overtime} onChange={(e) => updateItem(it.id, { overtime: Number(e.target.value) })} />
                        </td>
                      )}
                      <td className="p-3">
                        <input type="number" className="w-full bg-transparent outline-none" placeholder="0.00" value={typeof it.cost === 'number' ? it.cost : ''} onChange={(e) => updateItem(it.id, { cost: e.target.value === '' ? undefined : Number(e.target.value) })} />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => saveOne(it)} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-black font-bold uppercase text-xs ${dirty ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-50'}`}><Save size={16} /> Save</button>
                          <button onClick={() => deleteOne(it)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-black font-bold uppercase text-xs hover:bg-gray-50"><Trash2 size={16} /> Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};